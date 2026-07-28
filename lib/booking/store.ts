// FOXCA booking store client. SERVER-ONLY: talks to the foxmortgage-ca Supabase
// project through the narrow security-definer functions from migration
// 20260727160000. The anon key holds no direct table privileges (RLS on, grants
// revoked) and every function here demands the operator secret. Twin of
// lib/task-events-store.ts.
//
// The public visitor never reaches Supabase. The Next server makes every call
// below and is the only thing that holds FOXCA_OPERATOR_SECRET.
//
// Logs carry the function name, status, and duration. Never a payload, never a
// client's name, email, or phone, never the secret.

import { foxcaOperatorSecret } from '@/lib/foxca-secret'
import { isDemoMode } from '@/lib/demo'
import type { EventTypeDraft, HoursWindow, OverrideDraft } from '@/lib/booking/admin'
import type {
  AvailabilityInputs,
  BookingConfig,
  BookingRecord,
  ExistingBooking,
  IntakeQuestion,
  TokenBooking,
} from '@/lib/booking/types'

export type BookingStoreResult<T> =
  | { configured: false }
  | { configured: true; ok: true; data: T }
  | { configured: true; ok: false; error: string }

function foxcaEnv(): { url: string; key: string } | null {
  const url = process.env.FOXCA_SUPABASE_URL
  const key = process.env.FOXCA_SUPABASE_KEY
  if (!url || !key) return null
  return { url: url.replace(/\/+$/, '').replace(/\/rest\/v1$/, ''), key }
}

export function bookingStoreConfigured(): boolean {
  return foxcaEnv() !== null
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<BookingStoreResult<T>> {
  const env = foxcaEnv()
  if (!env) return { configured: false }
  const started = Date.now()
  try {
    const res = await fetch(`${env.url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: env.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      cache: 'no-store',
    })
    const ms = Date.now() - started
    if (!res.ok) {
      console.error(`[booking-store] ${fn} HTTP ${res.status} ms=${ms}`)
      const body = (await res.json().catch(() => null)) as { message?: string } | null
      return {
        configured: true,
        ok: false,
        error: body?.message ? String(body.message).slice(0, 200) : `Store query failed (HTTP ${res.status})`,
      }
    }
    const data = (await res.json().catch(() => null)) as T
    console.log(`[booking-store] ${fn} ok ms=${ms}`)
    return { configured: true, ok: true, data }
  } catch {
    console.error(`[booking-store] ${fn} unreachable ms=${Date.now() - started}`)
    return { configured: true, ok: false, error: 'Booking store unreachable' }
  }
}

// ─── Mapping ─────────────────────────────────────────────────────────────────

export function mapIntakeQuestions(raw: unknown): IntakeQuestion[] {
  if (!Array.isArray(raw)) return []
  const out: IntakeQuestion[] = []
  for (const q of raw) {
    const key = typeof (q as any)?.key === 'string' ? (q as any).key : ''
    const label = typeof (q as any)?.label === 'string' ? (q as any).label : ''
    if (!key || !label) continue
    const type = (q as any)?.type
    out.push({
      key,
      label,
      type: type === 'textarea' || type === 'select' ? type : 'text',
      required: (q as any)?.required === true,
      options: Array.isArray((q as any)?.options)
        ? (q as any).options.filter((o: unknown): o is string => typeof o === 'string')
        : [],
    })
  }
  return out
}

function mapConfig(raw: any): BookingConfig | null {
  if (!raw || raw.found !== true) return null
  const h = raw.host ?? {}
  const e = raw.eventType ?? {}
  return {
    host: {
      agentId: String(h.agentId ?? ''),
      slug: String(h.slug ?? ''),
      displayName: String(h.displayName ?? ''),
      timezone: String(h.timezone ?? 'America/Toronto'),
    },
    eventType: {
      slug: String(e.slug ?? ''),
      name: String(e.name ?? ''),
      description: typeof e.description === 'string' ? e.description : null,
      durationMinutes: Number(e.durationMinutes) || 30,
      bufferBeforeMinutes: Number(e.bufferBeforeMinutes) || 0,
      bufferAfterMinutes: Number(e.bufferAfterMinutes) || 0,
      minNoticeHours: Number(e.minNoticeHours) || 0,
      maxAdvanceDays: Number(e.maxAdvanceDays) || 30,
      maxPerDay: Number(e.maxPerDay) || 8,
      slotIncrementMinutes: Number(e.slotIncrementMinutes) || 15,
      intakeQuestions: mapIntakeQuestions(e.intakeQuestions),
    },
  }
}

function mapAvailabilityInputs(raw: any): AvailabilityInputs {
  const bookings: ExistingBooking[] = Array.isArray(raw?.bookings)
    ? raw.bookings.map((b: any) => ({
        start: String(b.start),
        end: String(b.end),
        localDate: String(b.localDate),
        eventTypeSlug: String(b.eventTypeSlug ?? ''),
        bufferBefore: Number(b.bufferBefore) || 0,
        bufferAfter: Number(b.bufferAfter) || 0,
      }))
    : []
  return {
    hours: Array.isArray(raw?.hours)
      ? raw.hours.map((h: any) => ({ weekday: Number(h.weekday), windows: h.windows }))
      : [],
    overrides: Array.isArray(raw?.overrides)
      ? raw.overrides.map((o: any) => ({
          date: String(o.date),
          closed: o.closed === true,
          windows: o.windows,
        }))
      : [],
    bookings,
  }
}

function mapBooking(raw: any): BookingRecord | null {
  if (!raw || typeof raw !== 'object') return null
  return {
    id: String(raw.id),
    agentId: String(raw.agentId),
    eventTypeSlug: String(raw.eventTypeSlug),
    eventTypeName: typeof raw.eventTypeName === 'string' ? raw.eventTypeName : null,
    startsAt: String(raw.startsAt),
    endsAt: String(raw.endsAt),
    localDate: String(raw.localDate),
    clientName: String(raw.clientName ?? ''),
    clientEmail: String(raw.clientEmail ?? ''),
    clientPhone: String(raw.clientPhone ?? ''),
    clientTimezone: typeof raw.clientTimezone === 'string' ? raw.clientTimezone : null,
    notes: typeof raw.notes === 'string' ? raw.notes : null,
    intakeAnswers: raw.intakeAnswers && typeof raw.intakeAnswers === 'object' ? raw.intakeAnswers : {},
    status: raw.status,
    smsConsent: raw.smsConsent === true,
    consentedAt: typeof raw.consentedAt === 'string' ? raw.consentedAt : null,
    source: String(raw.source ?? 'public'),
    calendarStatus: raw.calendarStatus,
    calendarDetail: typeof raw.calendarDetail === 'string' ? raw.calendarDetail : null,
    hostTimezone: String(raw.hostTimezone ?? 'America/Toronto'),
    hostDisplayName: String(raw.hostDisplayName ?? ''),
  }
}

// ─── Reads ───────────────────────────────────────────────────────────────────
//
// NOT demo-guarded, deliberately: booking hosts, event types, and hours are
// PRACTICE reference data, not borrower data — the same rule that keeps lender
// names real in demo (Session 9). No client's name, email, or phone is on any of
// these rows. The WRITES below are guarded, and the machine jobs (reminders,
// reconcile) refuse to run in demo rather than silently no-opping their stamps.

export async function bookingConfigFor(
  hostSlug: string,
  eventSlug: string,
): Promise<BookingStoreResult<BookingConfig | null>> {
  const res = await rpc<any>('booking_config_for', {
    p_host_slug: hostSlug,
    p_event_slug: eventSlug,
    p_operator_secret: foxcaOperatorSecret(),
  })
  if (!res.configured || !res.ok) return res as BookingStoreResult<BookingConfig | null>
  return { configured: true, ok: true, data: mapConfig(res.data) }
}

export async function availabilityInputs(input: {
  agentId: string
  fromDate: string
  toDate: string
  fromInstant: string
  toInstant: string
}): Promise<BookingStoreResult<AvailabilityInputs>> {
  const res = await rpc<any>('booking_availability_inputs', {
    p_agent_id: input.agentId,
    p_from_date: input.fromDate,
    p_to_date: input.toDate,
    p_from_instant: input.fromInstant,
    p_to_instant: input.toInstant,
    p_operator_secret: foxcaOperatorSecret(),
  })
  if (!res.configured || !res.ok) return res as BookingStoreResult<AvailabilityInputs>
  return { configured: true, ok: true, data: mapAvailabilityInputs(res.data) }
}

// ─── Writes ──────────────────────────────────────────────────────────────────

export interface CreateBookingInput {
  agentId: string
  eventTypeSlug: string
  startsAt: string
  endsAt: string
  localDate: string
  clientName: string
  clientEmail: string
  clientPhone: string
  clientTimezone: string | null
  notes: string | null
  intakeAnswers: Record<string, string>
  rescheduleTokenHash: string
  smsConsent: boolean
  source: string
  zohoContactId: string | null
  dealId: string | null
  touchId: string | null
}

export type CreateBookingVerdict =
  | { ok: true; id: string }
  | { ok: false; reason: string }

/**
 * The write. Demo mode NEVER creates a booking — it returns a refusal rather than
 * throwing, so the public page can render an honest line instead of a stack trace
 * on a surface a visitor can reach.
 */
export async function createBooking(
  input: CreateBookingInput,
): Promise<BookingStoreResult<CreateBookingVerdict>> {
  if (isDemoMode()) {
    return { configured: true, ok: true, data: { ok: false, reason: 'demo_mode' } }
  }
  const res = await rpc<any>('booking_create', {
    p_agent_id: input.agentId,
    p_event_type_slug: input.eventTypeSlug,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_local_date: input.localDate,
    p_client_name: input.clientName,
    p_client_email: input.clientEmail,
    p_client_phone: input.clientPhone,
    p_client_timezone: input.clientTimezone,
    p_notes: input.notes,
    p_intake_answers: input.intakeAnswers,
    p_reschedule_token_hash: input.rescheduleTokenHash,
    p_sms_consent: input.smsConsent,
    p_source: input.source,
    p_zoho_contact_id: input.zohoContactId,
    p_deal_id: input.dealId,
    p_touch_id: input.touchId,
    p_operator_secret: foxcaOperatorSecret(),
  })
  if (!res.configured || !res.ok) return res as BookingStoreResult<CreateBookingVerdict>
  const raw = res.data
  if (raw?.ok === true && typeof raw.id === 'string') {
    return { configured: true, ok: true, data: { ok: true, id: raw.id } }
  }
  return {
    configured: true,
    ok: true,
    data: { ok: false, reason: typeof raw?.reason === 'string' ? raw.reason : 'unknown' },
  }
}

/** Best effort: a failed stamp never costs the visitor their booking. */
export async function markCalendarOutcome(input: {
  id: string
  calendarEventId: string | null
  calendarStatus: 'written' | 'pending_retry' | 'not_attempted'
  detail: string | null
}): Promise<void> {
  if (isDemoMode()) return
  await rpc<boolean>('booking_mark_calendar', {
    p_id: input.id,
    p_calendar_event_id: input.calendarEventId,
    p_calendar_status: input.calendarStatus,
    p_detail: input.detail,
    p_operator_secret: foxcaOperatorSecret(),
  }).catch(() => undefined)
}

export async function getBooking(id: string): Promise<BookingStoreResult<BookingRecord | null>> {
  const res = await rpc<any>('booking_get', {
    p_id: id,
    p_operator_secret: foxcaOperatorSecret(),
  })
  if (!res.configured || !res.ok) return res as BookingStoreResult<BookingRecord | null>
  return { configured: true, ok: true, data: mapBooking(res.data) }
}

// ─── Session two: the manage, reconcile, and reminder surface ────────────────

/**
 * Look a booking up by the sha256 of its reschedule token. The RAW token is
 * never sent to the database and never stored, so this is the only way in, and
 * a database reader cannot use what they read.
 */
function mapTokenBooking(raw: any): TokenBooking | null {
  if (!raw || typeof raw !== 'object') return null
  return {
    id: String(raw.id),
    agentId: String(raw.agentId),
    hostSlug: String(raw.hostSlug),
    hostTimezone: String(raw.hostTimezone ?? 'America/Toronto'),
    hostDisplayName: String(raw.hostDisplayName ?? ''),
    eventTypeSlug: String(raw.eventTypeSlug),
    eventTypeName: typeof raw.eventTypeName === 'string' ? raw.eventTypeName : null,
    durationMinutes: Number(raw.durationMinutes) || 30,
    startsAt: String(raw.startsAt),
    endsAt: String(raw.endsAt),
    localDate: String(raw.localDate),
    clientName: String(raw.clientName ?? ''),
    clientEmail: String(raw.clientEmail ?? ''),
    clientPhone: String(raw.clientPhone ?? ''),
    clientTimezone: typeof raw.clientTimezone === 'string' ? raw.clientTimezone : null,
    notes: typeof raw.notes === 'string' ? raw.notes : null,
    status: raw.status,
    calendarEventId: typeof raw.calendarEventId === 'string' ? raw.calendarEventId : null,
    rescheduledCount: Number(raw.rescheduledCount) || 0,
  }
}

export async function bookingByRescheduleToken(
  tokenHash: string,
): Promise<BookingStoreResult<TokenBooking | null>> {
  const res = await rpc<any>('booking_by_reschedule_token', {
    p_token_hash: tokenHash,
    p_operator_secret: foxcaOperatorSecret(),
  })
  if (!res.configured || !res.ok) return res as BookingStoreResult<TokenBooking | null>
  return { configured: true, ok: true, data: mapTokenBooking(res.data) }
}

/**
 * The same booking, found by id instead of by token.
 *
 * THE SHAPE IS DELIBERATELY IDENTICAL. An admin cancel then runs through the
 * exact `cancelBooking` the client's own emailed link runs through, so the
 * client confirmation and the calendar removal cannot be skipped by an admin
 * taking a different door into the same action.
 */
export async function bookingById(id: string): Promise<BookingStoreResult<TokenBooking | null>> {
  const res = await rpc<any>('booking_admin_by_id', {
    p_id: id,
    p_operator_secret: foxcaOperatorSecret(),
  })
  if (!res.configured || !res.ok) return res as BookingStoreResult<TokenBooking | null>
  return { configured: true, ok: true, data: mapTokenBooking(res.data) }
}

export type BookingActionVerdict =
  | { ok: true; calendarEventId?: string | null; previousStartsAt?: string; unchanged?: boolean }
  | { ok: false; reason: string }

function verdictFrom(raw: any): BookingActionVerdict {
  if (raw?.ok === true) {
    return {
      ok: true,
      calendarEventId: typeof raw.calendarEventId === 'string' ? raw.calendarEventId : null,
      previousStartsAt: typeof raw.previousStartsAt === 'string' ? raw.previousStartsAt : undefined,
      unchanged: raw.unchanged === true,
    }
  }
  return { ok: false, reason: typeof raw?.reason === 'string' ? raw.reason : 'unknown' }
}

export async function cancelBookingRow(input: {
  id: string
  reason: string | null
  by: 'client' | 'admin' | 'system'
}): Promise<BookingStoreResult<BookingActionVerdict>> {
  if (isDemoMode()) {
    return { configured: true, ok: true, data: { ok: false, reason: 'demo_mode' } }
  }
  const res = await rpc<any>('booking_cancel', {
    p_id: input.id,
    p_reason: input.reason,
    p_by: input.by,
    p_operator_secret: foxcaOperatorSecret(),
  })
  if (!res.configured || !res.ok) return res as BookingStoreResult<BookingActionVerdict>
  return { configured: true, ok: true, data: verdictFrom(res.data) }
}

export async function rescheduleBookingRow(input: {
  id: string
  startsAt: string
  endsAt: string
  localDate: string
}): Promise<BookingStoreResult<BookingActionVerdict>> {
  if (isDemoMode()) {
    return { configured: true, ok: true, data: { ok: false, reason: 'demo_mode' } }
  }
  const res = await rpc<any>('booking_reschedule', {
    p_id: input.id,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_local_date: input.localDate,
    p_operator_secret: foxcaOperatorSecret(),
  })
  if (!res.configured || !res.ok) return res as BookingStoreResult<BookingActionVerdict>
  return { configured: true, ok: true, data: verdictFrom(res.data) }
}

export interface PendingCalendarRow {
  id: string
  agentId: string
  hostSlug: string
  hostTimezone: string
  hostDisplayName: string
  eventTypeSlug: string
  eventTypeName: string | null
  durationMinutes: number
  startsAt: string
  endsAt: string
  clientName: string
  clientPhone: string
  clientEmail: string
  clientTimezone: string | null
  notes: string | null
  intakeAnswers: Record<string, string>
  smsConsent: boolean
  calendarEventId: string | null
  calendarAttempts: number
  calendarDetail: string | null
  createdAt: string
  ageHours: number
}

export async function pendingCalendarBookings(
  limit: number,
): Promise<BookingStoreResult<PendingCalendarRow[]>> {
  const res = await rpc<any[]>('booking_pending_calendar', {
    p_limit: limit,
    p_operator_secret: foxcaOperatorSecret(),
  })
  if (!res.configured || !res.ok) return res as BookingStoreResult<PendingCalendarRow[]>
  const rows = Array.isArray(res.data) ? res.data : []
  return {
    configured: true,
    ok: true,
    data: rows.map((r: any) => ({
      id: String(r.id),
      agentId: String(r.agentId),
      hostSlug: String(r.hostSlug ?? ''),
      hostTimezone: String(r.hostTimezone ?? 'America/Toronto'),
      hostDisplayName: String(r.hostDisplayName ?? ''),
      eventTypeSlug: String(r.eventTypeSlug),
      eventTypeName: typeof r.eventTypeName === 'string' ? r.eventTypeName : null,
      durationMinutes: Number(r.durationMinutes) || 30,
      startsAt: String(r.startsAt),
      endsAt: String(r.endsAt),
      clientName: String(r.clientName ?? ''),
      clientPhone: String(r.clientPhone ?? ''),
      clientEmail: String(r.clientEmail ?? ''),
      clientTimezone: typeof r.clientTimezone === 'string' ? r.clientTimezone : null,
      notes: typeof r.notes === 'string' ? r.notes : null,
      intakeAnswers: r.intakeAnswers && typeof r.intakeAnswers === 'object' ? r.intakeAnswers : {},
      smsConsent: r.smsConsent === true,
      calendarEventId: typeof r.calendarEventId === 'string' ? r.calendarEventId : null,
      calendarAttempts: Number(r.calendarAttempts) || 0,
      calendarDetail: typeof r.calendarDetail === 'string' ? r.calendarDetail : null,
      createdAt: String(r.createdAt),
      ageHours: Number(r.ageHours) || 0,
    })),
  }
}

/** Stamp a calendar attempt. Unlike markCalendarOutcome this counts attempts and
 *  CAN clear the event id, which a cancel needs once the provider event is gone. */
export async function markCalendarAttempt(input: {
  id: string
  calendarEventId: string | null
  calendarStatus: 'written' | 'pending_retry' | 'not_attempted'
  detail: string | null
  permanent: boolean
  clearEvent?: boolean
}): Promise<void> {
  if (isDemoMode()) return
  await rpc<boolean>('booking_mark_calendar_attempt', {
    p_id: input.id,
    p_calendar_event_id: input.calendarEventId,
    p_calendar_status: input.calendarStatus,
    p_detail: input.detail,
    p_permanent: input.permanent,
    p_clear_event: input.clearEvent === true,
    p_operator_secret: foxcaOperatorSecret(),
  }).catch(() => undefined)
}

export interface DueReminderRow {
  id: string
  eventTypeName: string | null
  durationMinutes: number
  startsAt: string
  endsAt: string
  clientName: string
  clientEmail: string
  clientPhone: string
  clientTimezone: string | null
  hostDisplayName: string
  hostTimezone: string
}

export async function dueReminders(input: {
  fromIso: string
  toIso: string
  minLeadHours: number
  limit: number
}): Promise<BookingStoreResult<DueReminderRow[]>> {
  const res = await rpc<any[]>('booking_due_reminders', {
    p_from: input.fromIso,
    p_to: input.toIso,
    p_min_lead_hours: input.minLeadHours,
    p_limit: input.limit,
    p_operator_secret: foxcaOperatorSecret(),
  })
  if (!res.configured || !res.ok) return res as BookingStoreResult<DueReminderRow[]>
  const rows = Array.isArray(res.data) ? res.data : []
  return {
    configured: true,
    ok: true,
    data: rows.map((r: any) => ({
      id: String(r.id),
      eventTypeName: typeof r.eventTypeName === 'string' ? r.eventTypeName : null,
      durationMinutes: Number(r.durationMinutes) || 30,
      startsAt: String(r.startsAt),
      endsAt: String(r.endsAt),
      clientName: String(r.clientName ?? ''),
      clientEmail: String(r.clientEmail ?? ''),
      clientPhone: String(r.clientPhone ?? ''),
      clientTimezone: typeof r.clientTimezone === 'string' ? r.clientTimezone : null,
      hostDisplayName: String(r.hostDisplayName ?? ''),
      hostTimezone: String(r.hostTimezone ?? 'America/Toronto'),
    })),
  }
}

/**
 * Claim the right to alert Michael about ONE stuck booking on ONE day.
 *
 * Returns true exactly once per booking per Toronto day, to whichever caller
 * won the insert. Every later call that day returns false and sends nothing,
 * which is what turns an hourly job into one email rather than twenty four.
 *
 * A store failure returns FALSE, so an unreachable database means no mail
 * rather than a mail per run. Silence on a broken store is the safer failure:
 * the job log still names the stuck row, and a flood is the thing that gets an
 * alert channel muted for good.
 */
export async function claimStuckAlert(input: {
  id: string
  ageHours: number
  detail: string | null
}): Promise<boolean> {
  if (isDemoMode()) return false
  const res = await rpc<boolean>('booking_claim_stuck_alert', {
    p_booking_id: input.id,
    p_age_hours: input.ageHours,
    p_detail: input.detail,
    p_operator_secret: foxcaOperatorSecret(),
  }).catch(() => ({ configured: true, ok: false, error: 'threw' }) as BookingStoreResult<boolean>)
  if (!res.configured || !res.ok) return false
  return res.data === true
}

export async function markSent(id: string, kind: 'confirmation' | 'reminder'): Promise<void> {
  if (isDemoMode()) return
  await rpc<boolean>('booking_mark_sent', {
    p_id: id,
    p_kind: kind,
    p_operator_secret: foxcaOperatorSecret(),
  }).catch(() => undefined)
}

// ─── Session four: the Availability page's own surface ───────────────────────

/** A host slug to its agent id. The page's starting point. */
export async function agentIdForSlug(slug: string): Promise<BookingStoreResult<string | null>> {
  const res = await rpc<string | null>('booking_agent_for_slug', {
    p_slug: slug,
    p_operator_secret: foxcaOperatorSecret(),
  })
  if (!res.configured || !res.ok) return res as BookingStoreResult<string | null>
  return { configured: true, ok: true, data: typeof res.data === 'string' ? res.data : null }
}

export interface AdminHoursRow {
  weekday: number
  windows: HoursWindow[]
}

export interface AdminOverrideRow {
  date: string
  closed: boolean
  windows: HoursWindow[]
  note: string | null
}

export interface AdminEventTypeRow extends EventTypeDraft {}

export interface AdminOverview {
  host: { agentId: string; slug: string; displayName: string; timezone: string; active: boolean } | null
  hours: AdminHoursRow[]
  overrides: AdminOverrideRow[]
  eventTypes: AdminEventTypeRow[]
}

/** Windows off the wire, shaped without judgement. The editor validates. */
function mapWindows(raw: unknown): HoursWindow[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(w => ({ start: String((w as any)?.start ?? ''), end: String((w as any)?.end ?? '') }))
    .filter(w => w.start && w.end)
}

/**
 * Hours, overrides, and event types for one agent.
 *
 * NOT demo-guarded, and that is the existing rule rather than an oversight:
 * hours and event types are PRACTICE reference data, the same class as lender
 * names. No client's name, email, or phone is on any of these rows. The
 * upcoming-bookings read below IS guarded, because that one carries people.
 */
export async function adminOverview(agentId: string): Promise<BookingStoreResult<AdminOverview>> {
  const res = await rpc<any>('booking_admin_overview', {
    p_agent_id: agentId,
    p_operator_secret: foxcaOperatorSecret(),
  })
  if (!res.configured || !res.ok) return res as BookingStoreResult<AdminOverview>
  const raw = res.data ?? {}
  const h = raw.host
  return {
    configured: true,
    ok: true,
    data: {
      host: h
        ? {
            agentId: String(h.agentId),
            slug: String(h.slug),
            displayName: String(h.displayName ?? ''),
            timezone: String(h.timezone ?? 'America/Toronto'),
            active: h.active !== false,
          }
        : null,
      hours: Array.isArray(raw.hours)
        ? raw.hours.map((r: any) => ({ weekday: Number(r.weekday), windows: mapWindows(r.windows) }))
        : [],
      overrides: Array.isArray(raw.overrides)
        ? raw.overrides.map((r: any) => ({
            date: String(r.date),
            closed: r.closed !== false,
            windows: mapWindows(r.windows),
            note: typeof r.note === 'string' ? r.note : null,
          }))
        : [],
      eventTypes: Array.isArray(raw.eventTypes)
        ? raw.eventTypes.map((r: any) => ({
            slug: String(r.slug),
            name: String(r.name ?? ''),
            description: typeof r.description === 'string' ? r.description : null,
            durationMinutes: Number(r.durationMinutes) || 30,
            bufferBeforeMinutes: Number(r.bufferBeforeMinutes) || 0,
            bufferAfterMinutes: Number(r.bufferAfterMinutes) || 0,
            minNoticeHours: Number(r.minNoticeHours) || 0,
            maxAdvanceDays: Number(r.maxAdvanceDays) || 30,
            maxPerDay: Number(r.maxPerDay) || 8,
            slotIncrementMinutes: Number(r.slotIncrementMinutes) || 15,
            intakeQuestions: mapIntakeQuestions(r.intakeQuestions),
            active: r.active !== false,
          }))
        : [],
    },
  }
}

export interface AdminUpcomingRow {
  id: string
  startsAt: string
  endsAt: string
  eventTypeSlug: string
  eventTypeName: string | null
  clientName: string
  clientEmail: string
  clientPhone: string
  clientTimezone: string | null
  notes: string | null
  intakeAnswers: Record<string, string>
  smsConsent: boolean
  status: string
  calendarStatus: string
  source: string
}

/**
 * The upcoming list. DEMO-GUARDED, unlike the overview above: these rows carry
 * a real person's name, email, and number, so demo mode returns nothing at all
 * rather than a fixture that could be mistaken for a real client.
 */
export async function adminUpcoming(
  agentId: string,
  limit = 50,
): Promise<BookingStoreResult<AdminUpcomingRow[]>> {
  if (isDemoMode()) return { configured: true, ok: true, data: [] }
  const res = await rpc<any[]>('booking_admin_upcoming', {
    p_agent_id: agentId,
    p_limit: limit,
    p_operator_secret: foxcaOperatorSecret(),
  })
  if (!res.configured || !res.ok) return res as BookingStoreResult<AdminUpcomingRow[]>
  const rows = Array.isArray(res.data) ? res.data : []
  return {
    configured: true,
    ok: true,
    data: rows.map((r: any) => ({
      id: String(r.id),
      startsAt: String(r.startsAt),
      endsAt: String(r.endsAt),
      eventTypeSlug: String(r.eventTypeSlug ?? ''),
      eventTypeName: typeof r.eventTypeName === 'string' ? r.eventTypeName : null,
      clientName: String(r.clientName ?? ''),
      clientEmail: String(r.clientEmail ?? ''),
      clientPhone: String(r.clientPhone ?? ''),
      clientTimezone: typeof r.clientTimezone === 'string' ? r.clientTimezone : null,
      notes: typeof r.notes === 'string' ? r.notes : null,
      intakeAnswers: r.intakeAnswers && typeof r.intakeAnswers === 'object' ? r.intakeAnswers : {},
      smsConsent: r.smsConsent === true,
      status: String(r.status ?? 'booked'),
      calendarStatus: String(r.calendarStatus ?? 'not_attempted'),
      source: String(r.source ?? 'public'),
    })),
  }
}

export type AdminWriteResult =
  | { configured: false }
  | { configured: true; ok: true }
  | { configured: true; ok: false; error: string }

function writeResult(res: BookingStoreResult<unknown>): AdminWriteResult {
  if (!res.configured) return { configured: false }
  if (!res.ok) return { configured: true, ok: false, error: res.error }
  return { configured: true, ok: true }
}

const DEMO_REFUSAL: AdminWriteResult = {
  configured: true,
  ok: false,
  error: 'Demo mode is read only.',
}

/** One weekday's hours. An empty windows list means closed, and the function
 *  deletes the row rather than storing an empty one. */
export async function setHours(
  agentId: string,
  weekday: number,
  windows: HoursWindow[],
): Promise<AdminWriteResult> {
  if (isDemoMode()) return DEMO_REFUSAL
  return writeResult(
    await rpc<boolean>('booking_hours_set', {
      p_agent_id: agentId,
      p_weekday: weekday,
      p_windows: windows,
      p_operator_secret: foxcaOperatorSecret(),
    }),
  )
}

export async function setOverride(
  agentId: string,
  draft: OverrideDraft,
): Promise<AdminWriteResult> {
  if (isDemoMode()) return DEMO_REFUSAL
  return writeResult(
    await rpc<boolean>('booking_override_set', {
      p_agent_id: agentId,
      p_date: draft.date,
      p_closed: draft.closed,
      p_windows: draft.windows,
      p_note: draft.note,
      p_operator_secret: foxcaOperatorSecret(),
    }),
  )
}

export async function deleteOverride(agentId: string, date: string): Promise<AdminWriteResult> {
  if (isDemoMode()) return DEMO_REFUSAL
  return writeResult(
    await rpc<boolean>('booking_override_delete', {
      p_agent_id: agentId,
      p_date: date,
      p_operator_secret: foxcaOperatorSecret(),
    }),
  )
}

export async function updateEventType(
  agentId: string,
  draft: EventTypeDraft,
): Promise<AdminWriteResult> {
  if (isDemoMode()) return DEMO_REFUSAL
  const res = await rpc<boolean>('booking_event_type_update', {
    p_agent_id: agentId,
    p_slug: draft.slug,
    p_name: draft.name,
    p_description: draft.description,
    p_duration_minutes: draft.durationMinutes,
    p_buffer_before_minutes: draft.bufferBeforeMinutes,
    p_buffer_after_minutes: draft.bufferAfterMinutes,
    p_min_notice_hours: draft.minNoticeHours,
    p_max_advance_days: draft.maxAdvanceDays,
    p_max_per_day: draft.maxPerDay,
    p_slot_increment_minutes: draft.slotIncrementMinutes,
    p_intake_questions: draft.intakeQuestions,
    p_active: draft.active,
    p_operator_secret: foxcaOperatorSecret(),
  })
  if (res.configured && res.ok && res.data !== true) {
    return { configured: true, ok: false, error: 'That meeting type no longer exists.' }
  }
  return writeResult(res)
}

export async function markZohoLinked(input: {
  id: string
  detail: string
  contactId?: string | null
  dealId?: string | null
  leadId?: string | null
}): Promise<void> {
  if (isDemoMode()) return
  await rpc<boolean>('booking_mark_zoho', {
    p_id: input.id,
    p_detail: input.detail.slice(0, 500),
    p_contact_id: input.contactId ?? null,
    p_deal_id: input.dealId ?? null,
    p_lead_id: input.leadId ?? null,
    p_operator_secret: foxcaOperatorSecret(),
  }).catch(() => undefined)
}
