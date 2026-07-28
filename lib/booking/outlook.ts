// Microsoft Graph implementation of the calendar provider. SERVER-ONLY.
//
// It reads the SAME four MS_* env vars the Today band uses (lib/ms-calendar.ts)
// but keeps its own module: ms-calendar.ts is a deliberately narrow read surface
// for one page, and bolting a write path onto it would widen a module whose whole
// value is that it cannot write. Two modules, one credential, separate blast
// radii. Secrets are read here and nowhere else in the booking engine, never
// NEXT_PUBLIC, never logged — logs carry status codes and durations only.
//
// ─── THE WRITE STORY ─────────────────────────────────────────────────────────
//
// SESSION ONE found the credential READ-ONLY: the roles claim was exactly
// ["Calendars.Read"], so createEvent refused before firing and every booking
// landed as pending_retry with the reason.
//
// SESSION TWO: the grant landed. The roles claim now reads
// ["Calendars.Read", "Calendars.ReadWrite"], and events are created live and
// verified. NOT ONE LINE OF THIS FILE CHANGED to make that happen, which was the
// whole point of gating on the claim rather than hardcoding a stub: `capability()`
// reads the tenant's own statement of what this app may do, so the day an admin
// granted the permission the code started writing on its next token.
//
// The gate stays exactly as it was, because it is not scaffolding. If the grant
// is ever revoked, createEvent goes back to refusing before it fires, the
// refusal reason reaches the booking row's calendar_detail, and the reconcile
// job stops hammering a wall. That is the steady state, not a migration step.

import { createCache } from '@/lib/cache'
import type {
  BusyResult,
  CalendarProvider,
  CalendarRange,
  CancelEventResult,
  CreateEventInput,
  CreateEventResult,
  ProviderCapability,
} from '@/lib/booking/calendar'
import type { BusyInterval } from '@/lib/booking/types'

const GRAPH = 'https://graph.microsoft.com/v1.0'
const WRITE_ROLE = /^Calendars\.ReadWrite/
const READ_ROLE = /^Calendars\.Read/

interface MsEnv {
  tenant: string
  clientId: string
  clientSecret: string
  upn: string
}

// Trim every value: two of these carried a stray leading space in .env.local, and
// a space inside the tenant id or secret silently breaks the token request.
function msEnv(): MsEnv | null {
  const tenant = process.env.MS_TENANT_ID?.trim()
  const clientId = process.env.MS_CLIENT_ID?.trim()
  const clientSecret = process.env.MS_CLIENT_SECRET?.trim()
  const upn = process.env.MS_CALENDAR_UPN?.trim()
  if (!tenant || !clientId || !clientSecret || !upn) return null
  return { tenant, clientId, clientSecret, upn }
}

// ─── Token ───────────────────────────────────────────────────────────────────

interface CachedToken {
  token: string
  roles: string[]
  expMs: number
}

let tokenCache: CachedToken | null = null
const TOKEN_MARGIN_MS = 60_000

/**
 * The `roles` claim of an app-only token is the tenant's own list of granted
 * application permissions. Decoding it is a local base64 read of a claim we
 * already hold — no extra call, no admin API, no secret exposure. Returns [] if
 * the token is not a readable JWT, which reads as "no capability" and fails safe.
 */
function rolesFromToken(token: string): string[] {
  try {
    const part = token.split('.')[1]
    if (!part) return []
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    const payload = JSON.parse(json) as { roles?: unknown }
    return Array.isArray(payload.roles) ? payload.roles.filter((r): r is string => typeof r === 'string') : []
  } catch {
    return []
  }
}

async function graphToken(env: MsEnv): Promise<CachedToken> {
  const now = Date.now()
  if (tokenCache && now < tokenCache.expMs - TOKEN_MARGIN_MS) return tokenCache
  const body = new URLSearchParams({
    client_id: env.clientId,
    client_secret: env.clientSecret,
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default',
  })
  const res = await fetch(`https://login.microsoftonline.com/${env.tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  })
  if (!res.ok) {
    console.error(`[booking-outlook] token HTTP ${res.status}`)
    throw new Error(`token ${res.status}`)
  }
  const j = (await res.json()) as { access_token?: string; expires_in?: number }
  const token = typeof j.access_token === 'string' ? j.access_token : ''
  if (!token) throw new Error('token missing')
  const expiresIn = Number(j.expires_in) || 3600
  tokenCache = { token, roles: rolesFromToken(token), expMs: now + expiresIn * 1000 }
  return tokenCache
}

// ─── Busy ────────────────────────────────────────────────────────────────────

// An event whose showAs is one of these does not block a booking. Everything else
// does. Outlook's default for an all-day event is 'free', which is why a
// day-long "Reminder" does not wipe out a whole day of availability while a
// day-long "Vacation" marked out-of-office correctly does.
const NON_BLOCKING_SHOW_AS = new Set(['free', 'unknown'])

interface GraphEvent {
  id?: string
  start?: { dateTime?: string }
  end?: { dateTime?: string }
  showAs?: string
  isCancelled?: boolean
}

// With Prefer: outlook.timezone="UTC", Graph renders start/end as NAIVE UTC wall
// clock ("2026-07-28T13:00:00.0000000"). Trim the fractional seconds and stamp
// the Z rather than letting Date.parse guess a local zone.
function naiveUtcToIso(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/.exec(value)
  return m ? `${m[1]}Z` : null
}

// A short cache so the slots endpoint and an immediate confirm do not both hit
// Graph. Keyed by the exact range. Only the success path is cached — a failure is
// never remembered, because the next request must be free to succeed.
const busyCache = createCache<string, BusyInterval[]>({ max: 8, ttlMs: 45_000 })

const MAX_PAGES = 8

async function fetchBusy(env: MsEnv, range: CalendarRange): Promise<BusyInterval[]> {
  const cacheKey = `${env.upn}|${range.startUtc}|${range.endUtc}`
  const cached = busyCache.get(cacheKey)
  if (cached !== undefined) return cached

  const { token } = await graphToken(env)
  const qs = new URLSearchParams({
    startDateTime: range.startUtc,
    endDateTime: range.endUtc,
    $select: 'id,start,end,showAs,isCancelled',
    $orderby: 'start/dateTime',
    $top: '250',
  })
  let url: string | null = `${GRAPH}/users/${encodeURIComponent(env.upn)}/calendarView?${qs}`
  const out: BusyInterval[] = []

  for (let page = 0; page < MAX_PAGES && url; page++) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"' },
      cache: 'no-store',
    })
    if (!res.ok) {
      console.error(`[booking-outlook] calendarView HTTP ${res.status}`)
      throw new Error(`calendarView ${res.status}`)
    }
    const j = (await res.json()) as { value?: GraphEvent[]; '@odata.nextLink'?: string }
    for (const e of Array.isArray(j.value) ? j.value : []) {
      if (e.isCancelled === true) continue
      const showAs = typeof e.showAs === 'string' ? e.showAs.toLowerCase() : 'busy'
      if (NON_BLOCKING_SHOW_AS.has(showAs)) continue
      const start = naiveUtcToIso(e.start?.dateTime)
      const end = naiveUtcToIso(e.end?.dateTime)
      if (!start || !end) continue
      out.push({ start, end, id: typeof e.id === 'string' ? e.id : undefined })
    }
    url = typeof j['@odata.nextLink'] === 'string' ? j['@odata.nextLink'] : null
  }

  busyCache.set(cacheKey, out)
  return out
}

// ─── The provider ────────────────────────────────────────────────────────────

export const outlookProvider: CalendarProvider = {
  id: 'outlook',

  async capability(): Promise<ProviderCapability> {
    const env = msEnv()
    if (!env) {
      return {
        configured: false,
        canRead: false,
        canWrite: false,
        detail: 'Outlook is not configured. The four MS_ environment variables are not all set.',
      }
    }
    try {
      const { roles } = await graphToken(env)
      const canWrite = roles.some(r => WRITE_ROLE.test(r))
      const canRead = canWrite || roles.some(r => READ_ROLE.test(r))
      return {
        configured: true,
        canRead,
        canWrite,
        detail: canWrite
          ? 'Outlook is connected and can add events to the calendar.'
          : canRead
            ? 'Outlook can read the calendar but cannot add events yet. The app needs the Calendars.ReadWrite permission.'
            : 'Outlook is connected but has no calendar permission.',
      }
    } catch {
      return {
        configured: true,
        canRead: false,
        canWrite: false,
        detail: 'Outlook could not be reached just now.',
      }
    }
  },

  async getBusy(range: CalendarRange): Promise<BusyResult> {
    const env = msEnv()
    if (!env) return { ok: false, reason: 'outlook_not_configured' }
    try {
      return { ok: true, busy: await fetchBusy(env, range) }
    } catch {
      return { ok: false, reason: 'calendar_unreadable' }
    }
  },

  async createEvent(input: CreateEventInput): Promise<CreateEventResult> {
    const env = msEnv()
    if (!env) {
      return { ok: false, reason: 'Outlook is not configured.', permanent: true }
    }

    let roles: string[]
    try {
      roles = (await graphToken(env)).roles
    } catch {
      return { ok: false, reason: 'Could not reach Microsoft to sign in.', permanent: false }
    }

    // ── THE STUB BOUNDARY ──────────────────────────────────────────────────
    // No write permission means no request. The booking is already saved; this
    // returns a permanent refusal so the row is marked pending_retry with a
    // reason a human can act on, and the reconcile job does not spin.
    if (!roles.some(r => WRITE_ROLE.test(r))) {
      return {
        ok: false,
        reason:
          'The calendar app can read this calendar but cannot add events yet. It needs the Calendars.ReadWrite permission.',
        permanent: true,
      }
    }

    const path = input.calendarId
      ? `${GRAPH}/users/${encodeURIComponent(env.upn)}/calendars/${encodeURIComponent(input.calendarId)}/events`
      : `${GRAPH}/users/${encodeURIComponent(env.upn)}/events`

    // No attendees on purpose. Adding one makes Graph send an invitation from the
    // application identity, which is a different permission and a different piece
    // of mail than the confirmation Resend sends in session two. The event is
    // Michael's own record of the call; the client gets the email.
    const body = {
      subject: input.subject,
      body: { contentType: 'Text', content: input.body },
      start: { dateTime: input.startUtc.replace(/Z$/, ''), timeZone: 'UTC' },
      end: { dateTime: input.endUtc.replace(/Z$/, ''), timeZone: 'UTC' },
      ...(input.location ? { location: { displayName: input.location } } : {}),
      isOnlineMeeting: false,
    }

    try {
      const { token } = await graphToken(env)
      const res = await fetch(path, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      })
      if (!res.ok) {
        console.error(`[booking-outlook] createEvent HTTP ${res.status}`)
        return {
          ok: false,
          reason: `The calendar refused the event (HTTP ${res.status}).`,
          permanent: res.status === 401 || res.status === 403,
        }
      }
      const j = (await res.json()) as { id?: string }
      if (!j.id) return { ok: false, reason: 'The calendar did not return an event id.', permanent: false }
      return { ok: true, eventId: j.id }
    } catch {
      console.error('[booking-outlook] createEvent unreachable')
      return { ok: false, reason: 'Could not reach the calendar.', permanent: false }
    }
  },

  async cancelEvent(calendarId: string | null, eventId: string): Promise<CancelEventResult> {
    const env = msEnv()
    if (!env) return { ok: false, reason: 'Outlook is not configured.' }
    let roles: string[]
    try {
      roles = (await graphToken(env)).roles
    } catch {
      return { ok: false, reason: 'Could not reach Microsoft to sign in.' }
    }
    if (!roles.some(r => WRITE_ROLE.test(r))) {
      return { ok: false, reason: 'The calendar app cannot change events yet.' }
    }
    const path = calendarId
      ? `${GRAPH}/users/${encodeURIComponent(env.upn)}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`
      : `${GRAPH}/users/${encodeURIComponent(env.upn)}/events/${encodeURIComponent(eventId)}`
    try {
      const { token } = await graphToken(env)
      const res = await fetch(path, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      if (!res.ok && res.status !== 404) {
        console.error(`[booking-outlook] cancelEvent HTTP ${res.status}`)
        return { ok: false, reason: `The calendar refused the change (HTTP ${res.status}).` }
      }
      return { ok: true }
    } catch {
      return { ok: false, reason: 'Could not reach the calendar.' }
    }
  },
}
