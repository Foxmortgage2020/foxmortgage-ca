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
import type {
  AvailabilityInputs,
  BookingConfig,
  BookingRecord,
  ExistingBooking,
  IntakeQuestion,
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

function mapIntakeQuestions(raw: unknown): IntakeQuestion[] {
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
// these rows. `bookingsInRange` is different and IS guarded below.

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
