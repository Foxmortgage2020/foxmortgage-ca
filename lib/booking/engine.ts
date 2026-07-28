// The booking service layer. SERVER-ONLY. Both public routes call this and
// nothing else, so the rules live in one place and the page, the slots endpoint,
// and the confirm endpoint cannot drift apart.
//
// THE CONFIRM ORDER, which is the whole safety story:
//   1. Re-read config and availability inputs (never trust the browser).
//   2. Re-read provider busy. If it cannot be read, REFUSE — see below.
//   3. Re-run the pure engine and check this exact slot is still offered.
//   4. Insert, where SQL re-checks conflicts and a partial unique index closes
//      the last instant of the race.
//   5. Only then attempt the calendar write, and stamp the outcome.
//
// Steps 3 and 4 are deliberately redundant. Step 3 enforces every rule (notice,
// advance, hours, buffers, per-day, provider busy). Step 4 enforces the two rules
// that must hold under concurrency. Neither alone is enough.
//
// STEP 5 CANNOT FAIL A BOOKING. The row is already committed when the calendar is
// touched. A provider failure sets calendar_status 'pending_retry' with a reason
// and the visitor still gets their confirmation, because the booking is real —
// the calendar entry is a copy of it. Session two adds the reconcile job that
// drains pending_retry.
//
// FAIL-CLOSED ON AN UNREADABLE CALENDAR, stated loudly because it is a real
// tradeoff: if Graph cannot be read, this offers NO times and refuses a confirm.
// The alternative is offering times we cannot verify are free, and double-booking
// a client onto something already in Michael's calendar. A quiet honest line
// costs a booking. A double-booked client costs trust, twice.

import { CONTACT } from '@/lib/contact'
import type {
  AvailabilityInputs,
  BookingConfig,
  BookingRefusal,
  BusyInterval,
  Interval,
  PrefillClaims,
  Slot,
} from '@/lib/booking/types'
import { computeSlots, slotIsOffered } from '@/lib/booking/availability'
import { addDaysYMD, isoMs, toUtcIso, wallClockToUtc, zonedYMD } from '@/lib/booking/time'
import type { CalendarProvider } from '@/lib/booking/calendar'
import { outlookProvider } from '@/lib/booking/outlook'
import { googleProvider } from '@/lib/booking/google'
import {
  availabilityInputs,
  bookingById,
  bookingByRescheduleToken,
  bookingConfigFor,
  cancelBookingRow,
  createBooking,
  markCalendarAttempt,
  markSent,
  markZohoLinked,
  rescheduleBookingRow,
} from '@/lib/booking/store'
import type { CleanBooking } from '@/lib/booking/validate'
import { hashToken, isRescheduleTokenShape, mintRescheduleToken } from '@/lib/booking/tokens'
import { buildCalendarDescription, factsFrom, manageUrlFor, sendBookingMail } from '@/lib/booking/email'
import { whenLine } from '@/lib/booking/email-copy'
import { linkBookingToZoho } from '@/lib/booking/zoho-link'
import type { TokenBooking } from '@/lib/booking/types'

/** The provider registry. Adding Google is registering it here and nowhere else. */
const PROVIDERS: Record<string, CalendarProvider> = {
  outlook: outlookProvider,
  google: googleProvider,
}

/**
 * Session one has exactly one host with one connection, seeded as Outlook. Rather
 * than read calendar_connections on every public request for a value that cannot
 * vary yet, the provider is resolved here. Session four's dashboard turns this
 * into a per-agent lookup, and the interface above is what makes that a one-file
 * change.
 */
export function providerForAgent(_agentId: string): CalendarProvider {
  return PROVIDERS.outlook
}

export async function loadConfig(
  hostSlug: string,
  eventSlug: string,
): Promise<BookingConfig | null> {
  const res = await bookingConfigFor(hostSlug, eventSlug)
  if (!res.configured || !res.ok) return null
  return res.data
}

export interface SlotsOutcome {
  ok: boolean
  slots: Slot[]
  reason?: BookingRefusal
}

interface RangeBounds {
  fromYMD: string
  toYMD: string
  fromInstant: string
  toInstant: string
  days: number
}

function boundsFor(config: BookingConfig, now: Date, days?: number): RangeBounds {
  const tz = config.host.timezone
  const todayYMD = zonedYMD(now, tz)
  const walk = Math.max(1, Math.min(days ?? config.eventType.maxAdvanceDays + 1, config.eventType.maxAdvanceDays + 1))
  const toYMD = addDaysYMD(todayYMD, walk - 1)
  return {
    fromYMD: todayYMD,
    toYMD,
    // Widen the instant window by a day on each side so an event that starts the
    // evening before or ends the morning after is still seen as busy.
    fromInstant: toUtcIso(wallClockToUtc(addDaysYMD(todayYMD, -1), 0, tz)),
    toInstant: toUtcIso(wallClockToUtc(addDaysYMD(toYMD, 2), 0, tz)),
    days: walk,
  }
}

/** Slots for the public picker. */
export async function getSlots(
  config: BookingConfig,
  opts: { now: Date; days?: number },
): Promise<SlotsOutcome> {
  const bounds = boundsFor(config, opts.now, opts.days)

  const inputsRes = await availabilityInputs({
    agentId: config.host.agentId,
    fromDate: bounds.fromYMD,
    toDate: bounds.toYMD,
    fromInstant: bounds.fromInstant,
    toInstant: bounds.toInstant,
  })
  if (!inputsRes.configured || !inputsRes.ok) {
    return { ok: false, slots: [], reason: 'calendar_unreadable' }
  }

  const provider = providerForAgent(config.host.agentId)
  const busyRes = await provider.getBusy({
    startUtc: bounds.fromInstant,
    endUtc: bounds.toInstant,
  })

  // Fail closed. No visibility, no offers.
  if (!busyRes.ok) {
    console.error(`[booking-engine] busy read failed reason=${busyRes.reason}`)
    return { ok: false, slots: [], reason: 'calendar_unreadable' }
  }

  const busy: Interval[] = busyRes.busy
  const slots = computeSlots({
    timezone: config.host.timezone,
    eventType: config.eventType,
    inputs: inputsRes.data,
    busy,
    busyReadable: true,
    now: opts.now,
    fromYMD: bounds.fromYMD,
    days: bounds.days,
  })

  return { ok: true, slots }
}

export type ConfirmOutcome =
  | {
      ok: true
      bookingId: string
      startsAt: string
      endsAt: string
      calendarWritten: boolean
      rescheduleToken: string
    }
  | { ok: false; reason: BookingRefusal | string; slots?: Slot[] }

/** Subject and body for the calendar entry. The phone number is the point. */
export function calendarEventContent(input: {
  config: BookingConfig
  clean: CleanBooking
  startsAt: string
  endsAt: string
}): { subject: string; body: string } {
  const { config, clean } = input
  const facts = factsFrom({
    clientName: clean.name,
    clientEmail: clean.email,
    clientPhoneDisplay: clean.phoneDisplay,
    clientTimezone: clean.timezone,
    hostName: config.host.displayName,
    hostTimezone: config.host.timezone,
    eventName: config.eventType.name,
    durationMinutes: config.eventType.durationMinutes,
    startUtc: input.startsAt,
    endUtc: input.endsAt,
  })
  // Answers are keyed by question label rather than by slug, because Michael
  // reads this and "situation" means nothing on a calendar card.
  const answers: Record<string, string> = {}
  for (const q of config.eventType.intakeQuestions) {
    const answer = clean.answers[q.key]
    if (answer) answers[q.label] = answer
  }
  return {
    subject: `${config.eventType.name} with ${clean.name}`,
    body: buildCalendarDescription(facts, {
      notes: clean.notes,
      answers,
      smsConsent: clean.smsConsent,
    }),
  }
}

/** Question label keyed answers, for the mail and the note. */
function labelledAnswers(config: BookingConfig, answers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const q of config.eventType.intakeQuestions) {
    const a = answers[q.key]
    if (a) out[q.label] = a
  }
  return out
}

export async function confirmBooking(input: {
  config: BookingConfig
  clean: CleanBooking
  prefill: PrefillClaims | null
  now: Date
  source: string
}): Promise<ConfirmOutcome> {
  const { config, clean, now } = input
  const tz = config.host.timezone

  const startMs = isoMs(clean.start)
  if (startMs === null) return { ok: false, reason: 'bad_range' }
  const endMs = startMs + config.eventType.durationMinutes * 60_000
  const startsAt = toUtcIso(new Date(startMs))
  const endsAt = toUtcIso(new Date(endMs))
  const localDate = zonedYMD(new Date(startMs), tz)

  // 1 + 2. Re-read everything. The browser's opinion of what is free is a hint.
  const bounds = boundsFor(config, now)
  const inputsRes = await availabilityInputs({
    agentId: config.host.agentId,
    fromDate: bounds.fromYMD,
    toDate: bounds.toYMD,
    fromInstant: bounds.fromInstant,
    toInstant: bounds.toInstant,
  })
  if (!inputsRes.configured || !inputsRes.ok) {
    return { ok: false, reason: 'store_unavailable' }
  }

  const provider = providerForAgent(config.host.agentId)
  const busyRes = await provider.getBusy({ startUtc: bounds.fromInstant, endUtc: bounds.toInstant })
  if (!busyRes.ok) {
    return { ok: false, reason: 'calendar_unreadable' }
  }

  // 3. Is this exact slot still one this engine would offer?
  const engineInput = {
    timezone: tz,
    eventType: config.eventType,
    inputs: inputsRes.data,
    busy: busyRes.busy,
    busyReadable: true,
    now,
  }
  if (!slotIsOffered(engineInput, startsAt)) {
    const slots = computeSlots({ ...engineInput, fromYMD: bounds.fromYMD, days: bounds.days })
    return { ok: false, reason: 'slot_not_offered', slots }
  }

  // 4. Insert. SQL re-checks and the unique index closes the race.
  const rescheduleToken = mintRescheduleToken()
  const created = await createBooking({
    agentId: config.host.agentId,
    eventTypeSlug: config.eventType.slug,
    startsAt,
    endsAt,
    localDate,
    clientName: clean.name,
    clientEmail: clean.email,
    clientPhone: clean.phone,
    clientTimezone: clean.timezone,
    notes: clean.notes,
    intakeAnswers: clean.answers,
    rescheduleTokenHash: hashToken(rescheduleToken),
    smsConsent: clean.smsConsent,
    source: input.source,
    zohoContactId: input.prefill?.zohoContactId ?? null,
    dealId: input.prefill?.dealId ?? null,
    touchId: input.prefill?.touchId ?? null,
  })

  if (!created.configured || !created.ok) {
    return { ok: false, reason: 'store_unavailable' }
  }
  if (!created.data.ok) {
    const reason = created.data.reason
    if (reason === 'slot_taken' || reason === 'day_full') {
      const slots = computeSlots({ ...engineInput, fromYMD: bounds.fromYMD, days: bounds.days })
      return { ok: false, reason, slots }
    }
    return { ok: false, reason }
  }

  const bookingId = created.data.id

  // 5. Everything after the row exists. NONE of it can un-book the booking.
  const calendarWritten = await writeCalendarFor({
    bookingId,
    config,
    clean,
    startsAt,
    endsAt,
  })

  // 6. Tell the client and Michael, and link it into Zoho. Both are awaited
  //    rather than fired and forgotten, because a serverless function that has
  //    already returned may be frozen before background work runs — a lost
  //    confirmation email is worse than a slower confirm.
  await notifyAndLink({
    kind: 'booked',
    bookingId,
    config,
    clean,
    startsAt,
    endsAt,
    prefill: input.prefill,
    rescheduleToken,
    calendarWritten,
    sequence: 0,
    now,
  })

  return {
    ok: true,
    bookingId,
    startsAt,
    endsAt,
    calendarWritten,
    rescheduleToken,
  }
}

// ─── Shared side effects ─────────────────────────────────────────────────────

/** Create the provider event and stamp the outcome. Returns whether it landed. */
async function writeCalendarFor(input: {
  bookingId: string
  config: BookingConfig
  clean: CleanBooking
  startsAt: string
  endsAt: string
}): Promise<boolean> {
  const provider = providerForAgent(input.config.host.agentId)
  const { subject, body } = calendarEventContent({
    config: input.config,
    clean: input.clean,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
  })
  const write = await provider.createEvent({
    calendarId: null,
    subject,
    body,
    startUtc: input.startsAt,
    endUtc: input.endsAt,
    location: `Phone call to ${input.clean.phoneDisplay}`,
  })
  if (write.ok) {
    await markCalendarAttempt({
      id: input.bookingId,
      calendarEventId: write.eventId,
      calendarStatus: 'written',
      detail: null,
      permanent: false,
    })
    return true
  }
  console.error(`[booking-engine] calendar write not landed permanent=${write.permanent}`)
  await markCalendarAttempt({
    id: input.bookingId,
    calendarEventId: null,
    calendarStatus: 'pending_retry',
    detail: write.reason.slice(0, 300),
    permanent: write.permanent,
  })
  return false
}

/**
 * The confirmation mail plus the Zoho link. Both best effort, both awaited, and
 * neither can throw to the caller.
 */
async function notifyAndLink(input: {
  kind: 'booked' | 'rescheduled' | 'cancelled'
  bookingId: string
  config: BookingConfig
  clean: CleanBooking
  startsAt: string
  endsAt: string
  prefill: PrefillClaims | null
  rescheduleToken: string | null
  calendarWritten: boolean
  sequence: number
  now: Date
  previousStartUtc?: string | null
}): Promise<void> {
  const { config, clean } = input
  const facts = factsFrom({
    clientName: clean.name,
    clientEmail: clean.email,
    clientPhoneDisplay: clean.phoneDisplay,
    clientTimezone: clean.timezone,
    hostName: config.host.displayName,
    hostTimezone: config.host.timezone,
    eventName: config.eventType.name,
    durationMinutes: config.eventType.durationMinutes,
    startUtc: input.startsAt,
    endUtc: input.endsAt,
    manageUrl: manageUrlFor(input.rescheduleToken),
    previousStartUtc: input.previousStartUtc ?? null,
  })
  const answers = labelledAnswers(config, clean.answers)

  try {
    const mail = await sendBookingMail({
      kind: input.kind,
      bookingId: input.bookingId,
      facts,
      notes: clean.notes,
      answers,
      smsConsent: clean.smsConsent,
      sequence: input.sequence,
      rescheduleToken: input.rescheduleToken,
      calendarWritten: input.calendarWritten,
      now: input.now,
    })
    if (mail.clientSent) await markSent(input.bookingId, 'confirmation')
  } catch (err) {
    console.error('[booking-engine] mail step threw', err)
  }

  try {
    const linked = await linkBookingToZoho({
      kind: input.kind,
      zohoContactId: input.prefill?.zohoContactId ?? null,
      dealId: input.prefill?.dealId ?? null,
      clientName: clean.name,
      clientEmail: clean.email,
      clientPhoneDisplay: clean.phoneDisplay,
      eventName: config.eventType.name,
      whenText: whenLine(input.startsAt, config.host.timezone),
      notes: clean.notes,
      smsConsent: clean.smsConsent,
      consentedAt: clean.smsConsent ? input.now.toISOString() : null,
      consentLanguage: CONSENT_LANGUAGE,
    })
    await markZohoLinked({
      id: input.bookingId,
      detail: linked.detail,
      contactId: input.prefill?.zohoContactId ?? null,
      dealId: input.prefill?.dealId ?? null,
      leadId: linked.leadId,
    })
  } catch (err) {
    console.error('[booking-engine] zoho step threw', err)
  }
}

/**
 * The EXACT words a person agrees to when they tick the consent box. Stored on
 * the Contact as the consent record, so what a regulator would be shown is the
 * sentence that was actually on screen, not a paraphrase of it.
 *
 * IT MUST MATCH the checkbox label in app/book/[host]/[eventType]/BookingFlow.tsx.
 * A test asserts they stay identical.
 */
export const CONSENT_LANGUAGE =
  'Yes, Fox Mortgage can text and email me about my mortgage and about rate changes that could save me money. I can say stop any time.'

// ─── Manage: resolve, reschedule, cancel ─────────────────────────────────────

/**
 * Resolve a raw reschedule token to its booking. The token is shape-gated BEFORE
 * any lookup (the client_links discipline), then hashed, and only the hash is
 * ever sent to the database.
 */
/**
 * Remove a booking from the availability inputs, so it does not block its own
 * move. Shared by the reschedule engine and the manage slots endpoint, which
 * must agree on what is offerable or the page shows times the server refuses.
 */
export function withoutBooking(inputs: AvailabilityInputs, booking: TokenBooking): AvailabilityInputs {
  return { ...inputs, bookings: inputs.bookings.filter(b => b.start !== booking.startsAt) }
}

/** Remove the booking's own calendar entry from provider busy. */
export function withoutOwnEvent(busy: BusyInterval[], calendarEventId: string | null): BusyInterval[] {
  if (!calendarEventId) return busy
  return busy.filter(b => b.id !== calendarEventId)
}

export async function bookingForToken(rawToken: string): Promise<TokenBooking | null> {
  if (!isRescheduleTokenShape(rawToken)) return null
  const res = await bookingByRescheduleToken(hashToken(rawToken))
  if (!res.configured || !res.ok) return null
  return res.data
}

/**
 * The same booking by id, for the Availability page.
 *
 * THE POINT IS WHAT IT DOES NOT DO. It returns the identical TokenBooking the
 * token lookup returns, so an admin cancel is `cancelBooking({ by: 'admin' })`
 * and nothing else. The client's cancellation email and the calendar removal
 * live inside that function, so an admin cancelling from the desk cannot
 * accidentally take a quieter path than the client's own link takes. The ONLY
 * difference between the two doors is the `by` field on the audit trail.
 *
 * Deliberately NOT time-gated. SELF_SERVE_CUTOFF_HOURS exists because a client
 * changing a call with an hour's notice needs a person; Michael IS that person,
 * so the desk can cancel a call that starts in ten minutes.
 */
export async function bookingForAdmin(id: string): Promise<TokenBooking | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null
  const res = await bookingById(id)
  if (!res.configured || !res.ok) return null
  return res.data
}

/**
 * How close to the start a client may still change things themselves. Inside
 * this window the page points them at the phone instead, because a change with
 * an hour's notice needs a person, not a form.
 */
export const SELF_SERVE_CUTOFF_HOURS = 2

function tooLate(startsAt: string, now: Date): boolean {
  const ms = isoMs(startsAt)
  if (ms === null) return true
  return ms - now.getTime() < SELF_SERVE_CUTOFF_HOURS * 3_600_000
}

export type ManageOutcome =
  | { ok: true; startsAt: string; endsAt: string; calendarWritten: boolean }
  | { ok: false; reason: BookingRefusal | string; slots?: Slot[] }

/**
 * Move a booking. Re-reads config and availability, re-runs the SAME engine
 * check a fresh booking runs, then moves the row atomically, then repoints the
 * calendar entry and tells everyone.
 */
export async function rescheduleBooking(input: {
  booking: TokenBooking
  startIso: string
  now: Date
}): Promise<ManageOutcome> {
  const { booking, now } = input

  if (booking.status === 'cancelled') return { ok: false, reason: 'already_cancelled' }
  if (booking.status !== 'booked') return { ok: false, reason: 'not_active' }
  if (tooLate(booking.startsAt, now)) return { ok: false, reason: 'too_late' }

  const config = await loadConfig(booking.hostSlug, booking.eventTypeSlug)
  if (!config) return { ok: false, reason: 'event_inactive' }

  const startMs = isoMs(input.startIso)
  if (startMs === null) return { ok: false, reason: 'bad_range' }
  const endMs = startMs + config.eventType.durationMinutes * 60_000
  const startsAt = toUtcIso(new Date(startMs))
  const endsAt = toUtcIso(new Date(endMs))
  const localDate = zonedYMD(new Date(startMs), config.host.timezone)

  // Re-read everything, exactly as a fresh booking does.
  const bounds = boundsFor(config, now)
  const inputsRes = await availabilityInputs({
    agentId: config.host.agentId,
    fromDate: bounds.fromYMD,
    toDate: bounds.toYMD,
    fromInstant: bounds.fromInstant,
    toInstant: bounds.toInstant,
  })
  if (!inputsRes.configured || !inputsRes.ok) return { ok: false, reason: 'store_unavailable' }

  const provider = providerForAgent(config.host.agentId)
  const busyRes = await provider.getBusy({ startUtc: bounds.fromInstant, endUtc: bounds.toInstant })
  if (!busyRes.ok) return { ok: false, reason: 'calendar_unreadable' }

  // A booking is not an obstacle to its own move, and it appears TWICE: once as
  // a row in the bookings table and once as an event in the calendar. Both have
  // to go, or the slots either side of the client's current time stay hidden
  // from the one person entitled to take them.
  const engineInput = {
    timezone: config.host.timezone,
    eventType: config.eventType,
    inputs: withoutBooking(inputsRes.data, booking),
    busy: withoutOwnEvent(busyRes.busy, booking.calendarEventId),
    busyReadable: true,
    now,
  }
  if (!slotIsOffered(engineInput, startsAt)) {
    const slots = computeSlots({ ...engineInput, fromYMD: bounds.fromYMD, days: bounds.days })
    return { ok: false, reason: 'slot_not_offered', slots }
  }

  const moved = await rescheduleBookingRow({ id: booking.id, startsAt, endsAt, localDate })
  if (!moved.configured || !moved.ok) return { ok: false, reason: 'store_unavailable' }
  if (!moved.data.ok) {
    const reason = moved.data.reason
    if (reason === 'slot_taken' || reason === 'day_full') {
      const slots = computeSlots({ ...engineInput, fromYMD: bounds.fromYMD, days: bounds.days })
      return { ok: false, reason, slots }
    }
    return { ok: false, reason }
  }

  // The calendar entry now names the wrong time. Remove the old one, then write
  // a fresh one, so a provider without an update path still ends up correct.
  if (booking.calendarEventId) {
    const removed = await provider.cancelEvent(null, booking.calendarEventId)
    if (!removed.ok) console.error(`[booking-engine] stale event not removed: ${removed.reason}`)
  }

  const clean = cleanFromBooking(booking, config)
  const calendarWritten = await writeCalendarFor({
    bookingId: booking.id,
    config,
    clean,
    startsAt,
    endsAt,
  })

  await notifyAndLink({
    kind: 'rescheduled',
    bookingId: booking.id,
    config,
    clean,
    startsAt,
    endsAt,
    prefill: null,
    rescheduleToken: null,
    calendarWritten,
    // SEQUENCE must rise or a calendar client ignores the update entirely.
    sequence: booking.rescheduledCount + 1,
    now,
    previousStartUtc: moved.data.previousStartsAt ?? booking.startsAt,
  })

  return { ok: true, startsAt, endsAt, calendarWritten }
}

/** Cancel a booking, remove its calendar entry, and tell everyone. */
export async function cancelBooking(input: {
  booking: TokenBooking
  reason: string | null
  now: Date
  by?: 'client' | 'admin' | 'system'
}): Promise<ManageOutcome> {
  const { booking, now } = input
  if (booking.status === 'cancelled') return { ok: false, reason: 'already_cancelled' }
  if (booking.status !== 'booked') return { ok: false, reason: 'not_active' }

  const cancelled = await cancelBookingRow({
    id: booking.id,
    reason: input.reason,
    by: input.by ?? 'client',
  })
  if (!cancelled.configured || !cancelled.ok) return { ok: false, reason: 'store_unavailable' }
  if (!cancelled.data.ok) return { ok: false, reason: cancelled.data.reason }

  const config = await loadConfig(booking.hostSlug, booking.eventTypeSlug)

  // Remove the provider event and clear the id, so nothing points at a meeting
  // that is not happening.
  const eventId = cancelled.data.calendarEventId ?? booking.calendarEventId
  if (eventId && config) {
    const provider = providerForAgent(config.host.agentId)
    const removed = await provider.cancelEvent(null, eventId)
    await markCalendarAttempt({
      id: booking.id,
      calendarEventId: null,
      calendarStatus: removed.ok ? 'not_attempted' : 'pending_retry',
      detail: removed.ok ? 'cancelled, event removed' : `cancel failed: ${removed.reason}`.slice(0, 300),
      permanent: false,
      clearEvent: removed.ok,
    })
  }

  if (config) {
    const clean = cleanFromBooking(booking, config)
    await notifyAndLink({
      kind: 'cancelled',
      bookingId: booking.id,
      config,
      clean,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      prefill: null,
      rescheduleToken: null,
      calendarWritten: false,
      sequence: booking.rescheduledCount + 2,
      now,
    })
  }

  return { ok: true, startsAt: booking.startsAt, endsAt: booking.endsAt, calendarWritten: false }
}

/**
 * A stored booking back into the CleanBooking shape the mail and calendar
 * builders expect. The stored phone is e164, so it is re-rendered for display.
 */
function cleanFromBooking(booking: TokenBooking, config: BookingConfig): CleanBooking {
  const digits = booking.clientPhone.replace(/\D+/g, '').slice(-10)
  const display =
    digits.length === 10
      ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
      : booking.clientPhone
  return {
    name: booking.clientName,
    email: booking.clientEmail,
    phone: booking.clientPhone,
    phoneDisplay: display,
    notes: booking.notes,
    timezone: booking.clientTimezone,
    // A stored booking's consent already lives on the row and in Zoho. Re-sending
    // it here would restate a consent that was not given again, so it is false.
    smsConsent: false,
    answers: {},
    start: booking.startsAt,
  }
}

/** The fallback every honest failure points at. */
export const FALLBACK_CONTACT = {
  phoneDisplay: CONTACT.phone.display,
  phoneHref: CONTACT.phone.href,
  email: CONTACT.email.address,
  emailHref: CONTACT.email.href,
}
