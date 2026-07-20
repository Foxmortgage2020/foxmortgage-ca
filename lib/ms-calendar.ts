// Microsoft Graph calendar (READ-ONLY) for the Today page's "Your day" band.
// Client-credentials against the tenant, today's calendarView for the mailbox
// in MS_CALENDAR_UPN, rendered in America/Toronto. No Graph WRITE exists
// anywhere in this build — the module's whole surface is a token POST and a
// calendarView GET.
//
// FAIL-SOFT BY CONSTRUCTION (the load-bearing rule): every path returns a
// CalendarResult the band can render; nothing here throws to the page. Missing
// env → { configured:false } (the connect teaching state). A token/Graph
// failure → { configured:true, ok:false } (one quiet line). So a Graph outage
// never breaks Today.
//
// SECURITY: server-only. The four MS_* secrets and the UPN are read HERE and
// nowhere else, never NEXT_PUBLIC, never sent to the client. This module is
// imported only by the server page (app/portal/admin/page.tsx) and — TYPE-ONLY
// — by lib/demo-fixtures.ts; the band component receives already-mapped events
// as props, so no secret code enters any client bundle. Asserted statically in
// tests/ms-calendar.test.ts. (No `server-only` npm package is vendored in this
// repo; the guarantee is the comment convention plus the static test, the same
// convention lib/foxca-secret.ts and the other server-only modules use.)
//
// The app permission is tenant-wide Calendars.Read at the application level. A
// later ApplicationAccessPolicy can scope the app to this one mailbox — noted
// in docs/ms-calendar-2026-07-20.md for Mike's hardening pass.
//
// Logs carry status codes only — never a token, a secret, an event body, or a
// URL that includes the mailbox (the read-only-workbench logging discipline).

import { isDemoMode } from '@/lib/demo'
import { ADMIN_TZ } from '@/config/targets'
import { torontoTodayYMD, ymdAddDays, torontoDayStartISO, daysUntilYMD } from '@/lib/dates'
import { createCache } from '@/lib/cache'
import { demoCalendarLites } from '@/lib/demo-fixtures'

// ─── Types ───────────────────────────────────────────────────────────────────

// The slim event shape mapped from Graph JSON: start/end are NAIVE Toronto
// wall-clock strings ("YYYY-MM-DDTHH:MM:SS") because the request carries
// Prefer: outlook.timezone="America/Toronto" — verified live 2026-07-20. No
// attendee lists, no bodies, no join URLs (an online meeting is a hint only).
export interface GraphEventLite {
  subject: string
  startLocal: string | null
  endLocal: string | null
  isAllDay: boolean
  location: string | null
  isOnline: boolean
}

export type EventStatus = 'allday' | 'past' | 'now' | 'upcoming'

export interface CalendarEvent {
  key: string
  subject: string
  isAllDay: boolean
  timeLabel: string // "All day" | "9:00 AM"
  rangeLabel: string // "All day" | "9:00 AM to 9:50 AM" (title/aria detail)
  location: string | null
  isOnline: boolean
  status: EventStatus
}

// Mirrors the UwResult discriminated union so the band reads it the same way
// the rest of the admin surface reads its data.
export type CalendarResult =
  | { configured: false }
  | { configured: true; ok: true; events: CalendarEvent[] }
  | { configured: true; ok: false; error: string }

// ─── Config (server-only env) ────────────────────────────────────────────────

// Trim every value: two of the four vars carried a stray leading space in
// .env.local, and a space inside the tenant id or secret silently breaks the
// token request. Trimming is cheap insurance regardless of the loader.
function msEnv(): { tenant: string; clientId: string; clientSecret: string; upn: string } | null {
  const tenant = process.env.MS_TENANT_ID?.trim()
  const clientId = process.env.MS_CLIENT_ID?.trim()
  const clientSecret = process.env.MS_CLIENT_SECRET?.trim()
  const upn = process.env.MS_CALENDAR_UPN?.trim()
  if (!tenant || !clientId || !clientSecret || !upn) return null
  return { tenant, clientId, clientSecret, upn }
}

export function msCalendarConfigured(): boolean {
  return msEnv() !== null
}

// ─── Pure helpers (exported for tests) ───────────────────────────────────────

// Minutes since midnight (0..1439) from a naive local datetime's CLOCK; null if
// unparseable. Used for the displayed time labels.
export function localMinutes(local: string | null): number | null {
  if (!local) return null
  const m = /T(\d{2}):(\d{2})/.exec(local)
  if (!m) return null
  const h = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null
  return h * 60 + mm
}

// Minutes relative to TODAY's midnight, DATE-AWARE: an event ending after today
// exceeds 1440 and one that started before today is negative. Status and sort
// MUST use this, not the clock — calendarView returns instances that overlap
// the day with their real (possibly cross-midnight) start/end, so a clock-only
// reading would misplace an event that spans midnight. null if unparseable.
export function localOffsetMinutes(local: string | null, todayYMD: string): number | null {
  if (!local) return null
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(local)
  if (!m) return null
  const min = Number(m[2]) * 60 + Number(m[3])
  return daysUntilYMD(m[1], todayYMD) * 1440 + min
}

// "9:00 AM" from minutes-since-midnight (0..1439).
export function fmtClock(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = ((min % 60) + 60) % 60
  const period = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

// Minutes since midnight for "now" in the practice timezone. hour12:false gives
// 00..23; the % 24 guards a "24" some engines emit at midnight.
export function torontoNowMinutes(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ADMIN_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const h = Number(parts.find(p => p.type === 'hour')?.value ?? '0') % 24
  const m = Number(parts.find(p => p.type === 'minute')?.value ?? '0')
  return h * 60 + m
}

// The pure mapping the band renders. All-day events sort first (a fixed
// sentinel) and read neutral; timed events sort by start and read past (ended) /
// now (in progress) / upcoming vs nowMinutes (minutes into today). Status and
// sort use DATE-AWARE offsets so a cross-midnight event is placed correctly,
// while the displayed labels use the event's own wall clock. A timed event with
// an unparseable start falls back to the neutral all-day treatment.
const ALLDAY_SORT = -1_000_000
export function mapCalendarEvents(
  lites: GraphEventLite[],
  nowMinutes: number,
  todayYMD: string,
): CalendarEvent[] {
  const rows = lites.map((e, i) => {
    const startOff = e.isAllDay ? null : localOffsetMinutes(e.startLocal, todayYMD)
    const endOff = e.isAllDay ? null : localOffsetMinutes(e.endLocal, todayYMD)
    const startClock = e.isAllDay ? null : localMinutes(e.startLocal)
    const endClock = e.isAllDay ? null : localMinutes(e.endLocal)
    let status: EventStatus
    if (e.isAllDay || startOff === null || startClock === null) status = 'allday'
    else if (endOff !== null && endOff <= nowMinutes) status = 'past'
    else if (startOff <= nowMinutes && (endOff === null || nowMinutes < endOff)) status = 'now'
    else status = 'upcoming'
    const timeLabel = status === 'allday' ? 'All day' : fmtClock(startClock as number)
    const rangeLabel =
      status === 'allday'
        ? 'All day'
        : endClock !== null
          ? `${fmtClock(startClock as number)} to ${fmtClock(endClock)}`
          : fmtClock(startClock as number)
    const ev: CalendarEvent = {
      key: `ev-${i}`,
      subject: e.subject || 'Untitled event',
      isAllDay: e.isAllDay,
      timeLabel,
      rangeLabel,
      location: e.location,
      isOnline: e.isOnline,
      status,
    }
    return { ev, sortKey: status === 'allday' ? ALLDAY_SORT : (startOff as number) }
  })
  rows.sort((a, b) => a.sortKey - b.sortKey)
  return rows.map(r => r.ev)
}

// ─── Graph I/O ───────────────────────────────────────────────────────────────

// Token: cached in-process until 60s before expiry. The token never leaves this
// module and is never logged.
let tokenCache: { token: string; expMs: number } | null = null
const TOKEN_MARGIN_MS = 60_000

async function graphToken(env: NonNullable<ReturnType<typeof msEnv>>): Promise<string> {
  const now = Date.now()
  if (tokenCache && now < tokenCache.expMs - TOKEN_MARGIN_MS) return tokenCache.token
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
    console.error(`[ms-calendar] token HTTP ${res.status}`)
    throw new Error(`token ${res.status}`)
  }
  const j = await res.json()
  const token = typeof j?.access_token === 'string' ? j.access_token : ''
  if (!token) throw new Error('token missing')
  const expiresIn = Number(j?.expires_in) || 3600
  tokenCache = { token, expMs: now + expiresIn * 1000 }
  return token
}

function toLite(e: any): GraphEventLite {
  const loc = typeof e?.location?.displayName === 'string' ? e.location.displayName.trim() : ''
  return {
    subject: typeof e?.subject === 'string' ? e.subject.trim() : '',
    startLocal: typeof e?.start?.dateTime === 'string' ? e.start.dateTime : null,
    endLocal: typeof e?.end?.dateTime === 'string' ? e.end.dateTime : null,
    isAllDay: e?.isAllDay === true,
    location: loc ? loc : null,
    isOnline: e?.isOnlineMeeting === true || Boolean(e?.onlineMeeting),
  }
}

// The revalidate the brief asks for: a 60s in-process cache of the raw lites so
// a burst of Today renders makes one Graph call. Statuses are re-derived from a
// fresh "now" on every render (only the network read is cached), and failures
// are never cached (the cache is only .set on the success path).
const litesCache = createCache<string, GraphEventLite[]>({ max: 2, ttlMs: 60_000 })

async function fetchLites(
  env: NonNullable<ReturnType<typeof msEnv>>,
  todayYMD: string,
): Promise<GraphEventLite[]> {
  const cached = litesCache.get(todayYMD)
  if (cached !== undefined) return cached
  const token = await graphToken(env)
  // The window MUST carry a zone: Graph reads an offset-less calendarView
  // datetime as UTC, and Prefer: outlook.timezone only sets RESPONSE rendering,
  // not the request bounds. So send the exact Toronto day as UTC instants
  // (torontoDayStartISO is DST-correct); an offset-less string would query a
  // UTC day and drop this evening's events while leaking last night's.
  const qs = new URLSearchParams({
    startDateTime: torontoDayStartISO(todayYMD),
    endDateTime: torontoDayStartISO(ymdAddDays(todayYMD, 1)),
    $select: 'subject,start,end,location,isAllDay,isOnlineMeeting,onlineMeeting',
    $orderby: 'start/dateTime',
    $top: '50',
  })
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env.upn)}/calendarView?${qs}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="America/Toronto"' },
    cache: 'no-store',
  })
  if (!res.ok) {
    console.error(`[ms-calendar] calendarView HTTP ${res.status}`)
    throw new Error(`calendarView ${res.status}`)
  }
  const j = await res.json()
  const lites: GraphEventLite[] = (Array.isArray(j?.value) ? j.value : []).map(toLite)
  litesCache.set(todayYMD, lites)
  return lites
}

// ─── Entry point ─────────────────────────────────────────────────────────────

// Today's calendar for the configured mailbox. Demo mode returns canned
// synthetic events (zero reads). Absent env → { configured:false }. Any failure
// → { configured:true, ok:false } — Today is never broken by this call.
export async function getTodayCalendar(now: Date = new Date()): Promise<CalendarResult> {
  const todayYMD = torontoTodayYMD(now)
  const nowMin = torontoNowMinutes(now)
  if (isDemoMode()) {
    return {
      configured: true,
      ok: true,
      events: mapCalendarEvents(demoCalendarLites(todayYMD), nowMin, todayYMD),
    }
  }
  const env = msEnv()
  if (!env) return { configured: false }
  try {
    const lites = await fetchLites(env, todayYMD)
    return { configured: true, ok: true, events: mapCalendarEvents(lites, nowMin, todayYMD) }
  } catch {
    return { configured: true, ok: false, error: 'Calendar is not available right now' }
  }
}
