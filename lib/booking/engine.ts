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
  BookingConfig,
  BookingRefusal,
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
  bookingConfigFor,
  createBooking,
  markCalendarOutcome,
} from '@/lib/booking/store'
import type { CleanBooking } from '@/lib/booking/validate'
import { hashToken, mintRescheduleToken } from '@/lib/booking/tokens'

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
}): { subject: string; body: string } {
  const { config, clean } = input
  const lines = [
    `${config.eventType.name} with ${clean.name}`,
    '',
    `Call them at ${clean.phoneDisplay}`,
    `Email ${clean.email}`,
  ]
  if (clean.timezone) lines.push(`Their timezone ${clean.timezone}`)
  for (const q of config.eventType.intakeQuestions) {
    const answer = clean.answers[q.key]
    if (answer) lines.push(`${q.label} ${answer}`)
  }
  if (clean.notes) {
    lines.push('', 'What they wrote:', clean.notes)
  }
  lines.push('', clean.smsConsent ? 'They said yes to updates by text and email.' : 'They did not opt in to updates.')
  lines.push('Booked on foxmortgage.ca')
  return {
    subject: `${config.eventType.name} with ${clean.name}`,
    body: lines.join('\n'),
  }
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

  // 5. The calendar write. It can fail. The booking cannot un-happen.
  const { subject, body } = calendarEventContent({ config, clean })
  const write = await provider.createEvent({
    calendarId: null,
    subject,
    body,
    startUtc: startsAt,
    endUtc: endsAt,
    location: `Phone call to ${clean.phoneDisplay}`,
  })

  if (write.ok) {
    await markCalendarOutcome({
      id: bookingId,
      calendarEventId: write.eventId,
      calendarStatus: 'written',
      detail: null,
    })
  } else {
    console.error(`[booking-engine] calendar write not landed permanent=${write.permanent}`)
    await markCalendarOutcome({
      id: bookingId,
      calendarEventId: null,
      calendarStatus: 'pending_retry',
      detail: write.reason.slice(0, 300),
    })
  }

  return {
    ok: true,
    bookingId,
    startsAt,
    endsAt,
    calendarWritten: write.ok,
    rescheduleToken,
  }
}

/** The fallback every honest failure points at. */
export const FALLBACK_CONTACT = {
  phoneDisplay: CONTACT.phone.display,
  phoneHref: CONTACT.phone.href,
  email: CONTACT.email.address,
  emailHref: CONTACT.email.href,
}
