// Shared booking types. A LEAF MODULE: it imports nothing, so the store, the
// providers, the pure engine, the routes, and the client component can all read
// the same shapes without an import cycle (the lib/lender-contacts.ts precedent).

export type ProviderId = 'outlook' | 'google'

export interface BookingHost {
  agentId: string
  slug: string
  displayName: string
  timezone: string
}

export type IntakeQuestionType = 'text' | 'textarea' | 'select'

export interface IntakeQuestion {
  key: string
  label: string
  type: IntakeQuestionType
  required: boolean
  options: string[]
}

export interface EventType {
  slug: string
  name: string
  description: string | null
  durationMinutes: number
  bufferBeforeMinutes: number
  bufferAfterMinutes: number
  minNoticeHours: number
  maxAdvanceDays: number
  maxPerDay: number
  slotIncrementMinutes: number
  intakeQuestions: IntakeQuestion[]
}

export interface BookingConfig {
  host: BookingHost
  eventType: EventType
}

/** A half-open interval [start, end) as ISO-8601 UTC instants. */
export interface Interval {
  start: string
  end: string
}

/**
 * Provider busy, carrying the provider's own event id where it has one.
 *
 * The id is load-bearing for a RESCHEDULE: a booking's own calendar entry sits
 * in the busy list, so without it the engine would treat the booking as an
 * obstacle to its own move and withhold every slot next to the time the client
 * already holds. Excluding the row from the bookings table is not enough,
 * because the same meeting is in the calendar too.
 */
export interface BusyInterval extends Interval {
  id?: string
}

/** A live booking, carrying the buffers of the event type it was made under. */
export interface ExistingBooking extends Interval {
  localDate: string
  eventTypeSlug: string
  bufferBefore: number
  bufferAfter: number
}

export interface DayHours {
  weekday: number
  windows: unknown
}

export interface DateOverride {
  date: string
  closed: boolean
  windows: unknown
}

export interface AvailabilityInputs {
  hours: DayHours[]
  overrides: DateOverride[]
  bookings: ExistingBooking[]
}

/** One offerable start. `start` is the UTC instant; the browser renders it local. */
export interface Slot {
  start: string
  end: string
  localDate: string
}

/**
 * Prefill identity carried by a signed booking link. IDS ONLY — no name, no
 * email, no phone. See lib/booking/prefill.ts for why.
 */
export interface PrefillClaims {
  zohoContactId: string | null
  dealId: string | null
  touchId: string | null
}

export interface BookingRecord {
  id: string
  agentId: string
  eventTypeSlug: string
  eventTypeName: string | null
  startsAt: string
  endsAt: string
  localDate: string
  clientName: string
  clientEmail: string
  clientPhone: string
  clientTimezone: string | null
  notes: string | null
  intakeAnswers: Record<string, string>
  status: 'booked' | 'cancelled' | 'rescheduled' | 'no_show'
  smsConsent: boolean
  consentedAt: string | null
  source: string
  calendarStatus: 'written' | 'pending_retry' | 'not_attempted'
  calendarDetail: string | null
  hostTimezone: string
  hostDisplayName: string
}

/**
 * A booking resolved from its reschedule token, carrying just enough host and
 * event context for the manage page to re-run availability without a second read.
 */
export interface TokenBooking {
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
  localDate: string
  clientName: string
  clientEmail: string
  clientPhone: string
  clientTimezone: string | null
  notes: string | null
  status: 'booked' | 'cancelled' | 'rescheduled' | 'no_show'
  calendarEventId: string | null
  rescheduledCount: number
}

/**
 * Why an attempt did not land. Each maps to one plain sentence in
 * lib/booking/validate.ts REFUSAL_COPY.
 *
 * 'store_unavailable' and 'demo_mode' are members now rather than riding the
 * loose `| string` arm they used in session one, so a new reason cannot be
 * introduced without also giving it copy.
 */
export type BookingRefusal =
  | 'slot_taken'
  | 'duplicate_pending'
  | 'day_full'
  | 'host_inactive'
  | 'event_inactive'
  | 'bad_range'
  | 'slot_not_offered'
  | 'calendar_unreadable'
  | 'rate_limited'
  | 'store_unavailable'
  | 'demo_mode'
  | 'not_found'
  | 'already_cancelled'
  | 'not_active'
  | 'too_late'
