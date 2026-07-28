// The availability engine. PURE: hours in, slots out. No network, no database,
// no ambient clock — `now` and the host timezone are arguments, which is what
// makes every rule here testable the way the rest of this repo tests its models.
//
// THE PIPELINE, in order:
//   1. Walk each local date in the bookable range.
//   2. Take that date's windows: an override replaces the weekday's hours
//      entirely, a `closed` override removes the day, a missing weekday is closed.
//   3. Step through each window by `slotIncrementMinutes`, keeping every start
//      whose full duration still fits inside the window.
//   4. Convert to UTC instants in the host's zone (DST-correct, lib/booking/time).
//   5. Drop anything inside the minimum notice or past the maximum advance.
//   6. Drop anything whose PADDED interval overlaps a live booking's PADDED
//      interval, or overlaps provider busy.
//   7. Drop whole days already at `maxPerDay` for this event type.
//
// BUFFER SEMANTICS, stated because they are a real choice: a candidate is padded
// by the buffers of the type BEING BOOKED, and each existing booking is padded by
// the buffers of the type IT was booked under. Two ten-minute-after bookings
// therefore keep ten minutes apart, not twenty. Provider busy is padded by the
// candidate's buffers too — a buffer exists so Michael is not walking out of one
// thing into another, and a meeting in Outlook is exactly that.
//
// FAIL-CLOSED, load-bearing: if provider busy could not be read, the caller passes
// `busyReadable: false` and this returns NO slots. A booking page that cannot see
// the calendar must not offer times it cannot honour. Showing nothing with an
// honest line is recoverable; double-booking a client is not.

import type { AvailabilityInputs, EventType, ExistingBooking, Interval, Slot } from '@/lib/booking/types'
import {
  addDaysYMD,
  daysBetweenYMD,
  isoMs,
  normalizeWindows,
  toUtcIso,
  wallClockToUtc,
  weekdayOfYMD,
  zonedYMD,
} from '@/lib/booking/time'

export interface ComputeSlotsInput {
  timezone: string
  eventType: EventType
  inputs: AvailabilityInputs
  /** Provider busy intervals, already in UTC. Ignored when busyReadable is false. */
  busy: Interval[]
  /** False when the provider read failed. Forces an empty result. */
  busyReadable: boolean
  now: Date
  /** First local date to consider. Defaults to the host-local date of `now`. */
  fromYMD?: string
  /** How many local dates to walk. Bounded by the event type's maxAdvanceDays. */
  days?: number
}

const MAX_WALK_DAYS = 120

/** Half-open overlap. Touching endpoints do NOT overlap: [9,10) and [10,11) are fine. */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart
}

interface PaddedInterval {
  start: number
  end: number
}

function padExisting(b: ExistingBooking): PaddedInterval | null {
  const start = isoMs(b.start)
  const end = isoMs(b.end)
  if (start === null || end === null) return null
  return {
    start: start - Math.max(0, b.bufferBefore) * 60_000,
    end: end + Math.max(0, b.bufferAfter) * 60_000,
  }
}

function padPlain(i: Interval): PaddedInterval | null {
  const start = isoMs(i.start)
  const end = isoMs(i.end)
  if (start === null || end === null) return null
  return { start, end }
}

/**
 * The windows that apply to one local date, as merged minute ranges.
 * Precedence: a `closed` override removes the day; any other override REPLACES
 * the weekday hours; otherwise the weekday's own windows; a missing weekday row
 * is closed.
 */
export function windowsForDate(
  ymd: string,
  inputs: Pick<AvailabilityInputs, 'hours' | 'overrides'>,
): Array<{ start: number; end: number }> {
  const override = inputs.overrides.find(o => o.date === ymd)
  if (override) {
    if (override.closed) return []
    return normalizeWindows(override.windows)
  }
  const weekday = weekdayOfYMD(ymd)
  const row = inputs.hours.find(h => h.weekday === weekday)
  if (!row) return []
  return normalizeWindows(row.windows)
}

/** Candidate starts inside one window, in minutes of day. */
export function startsInWindow(
  window: { start: number; end: number },
  durationMinutes: number,
  incrementMinutes: number,
): number[] {
  const out: number[] = []
  if (durationMinutes <= 0 || incrementMinutes <= 0) return out
  // Align to the increment grid measured from midnight, so 9:00-17:00 at a
  // 15-minute increment offers :00 :15 :30 :45 rather than drifting off an odd
  // window start.
  const first = Math.ceil(window.start / incrementMinutes) * incrementMinutes
  for (let m = first; m + durationMinutes <= window.end; m += incrementMinutes) {
    out.push(m)
  }
  return out
}

export function computeSlots(input: ComputeSlotsInput): Slot[] {
  const { timezone, eventType, inputs, now } = input

  // Fail-closed: no calendar visibility means no offers.
  if (!input.busyReadable) return []

  const todayYMD = zonedYMD(now, timezone)
  const fromYMD = input.fromYMD ?? todayYMD

  // Never walk past the event type's own advance limit, and never past a hard
  // ceiling regardless of what is configured.
  const advanceLastYMD = addDaysYMD(todayYMD, Math.max(0, eventType.maxAdvanceDays))
  const requested = input.days ?? eventType.maxAdvanceDays + 1
  const walk = Math.min(Math.max(0, requested), MAX_WALK_DAYS)

  const earliestMs = now.getTime() + Math.max(0, eventType.minNoticeHours) * 3_600_000
  const latestMs = wallClockToUtc(advanceLastYMD, 24 * 60, timezone).getTime()

  const paddedBookings = inputs.bookings.map(padExisting).filter((x): x is PaddedInterval => x !== null)
  const paddedBusy = input.busy.map(padPlain).filter((x): x is PaddedInterval => x !== null)

  // Per-day counts of live bookings OF THIS EVENT TYPE, for the maxPerDay cap.
  const perDay = new Map<string, number>()
  for (const b of inputs.bookings) {
    if (b.eventTypeSlug !== eventType.slug) continue
    perDay.set(b.localDate, (perDay.get(b.localDate) ?? 0) + 1)
  }

  const padBefore = Math.max(0, eventType.bufferBeforeMinutes) * 60_000
  const padAfter = Math.max(0, eventType.bufferAfterMinutes) * 60_000
  const durationMs = eventType.durationMinutes * 60_000

  const slots: Slot[] = []

  for (let i = 0; i < walk; i++) {
    const ymd = addDaysYMD(fromYMD, i)
    if (daysBetweenYMD(todayYMD, ymd) < 0) continue
    if (daysBetweenYMD(ymd, advanceLastYMD) < 0) break

    if ((perDay.get(ymd) ?? 0) >= eventType.maxPerDay) continue

    const windows = windowsForDate(ymd, inputs)
    if (windows.length === 0) continue

    let bookedThisDay = perDay.get(ymd) ?? 0

    for (const w of windows) {
      const starts = startsInWindow(w, eventType.durationMinutes, eventType.slotIncrementMinutes)
      for (const minutes of starts) {
        if (bookedThisDay >= eventType.maxPerDay) break

        const startMs = wallClockToUtc(ymd, minutes, timezone).getTime()
        const endMs = startMs + durationMs

        if (startMs < earliestMs) continue
        if (startMs >= latestMs) continue

        const paddedStart = startMs - padBefore
        const paddedEnd = endMs + padAfter

        let blocked = false
        for (const b of paddedBookings) {
          if (overlaps(paddedStart, paddedEnd, b.start, b.end)) {
            blocked = true
            break
          }
        }
        if (!blocked) {
          for (const b of paddedBusy) {
            if (overlaps(paddedStart, paddedEnd, b.start, b.end)) {
              blocked = true
              break
            }
          }
        }
        if (blocked) continue

        slots.push({
          start: toUtcIso(new Date(startMs)),
          end: toUtcIso(new Date(endMs)),
          localDate: ymd,
        })
      }
    }
  }

  slots.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
  return slots
}

/**
 * The confirm-time re-check. Answers one question: is THIS exact start still a
 * slot this engine would offer? Re-running the whole computation is deliberate —
 * it means the confirm path and the display path can never disagree about a rule,
 * because there is only one implementation of the rules.
 *
 * The remaining race (two confirms for the same slot in the same instant) is
 * closed in SQL by booking_create's re-check plus the partial unique index.
 */
export function slotIsOffered(input: ComputeSlotsInput, startIso: string): boolean {
  const startMs = isoMs(startIso)
  if (startMs === null) return false
  const ymd = zonedYMD(new Date(startMs), input.timezone)
  const slots = computeSlots({ ...input, fromYMD: ymd, days: 1 })
  return slots.some(s => isoMs(s.start) === startMs)
}

/** Slots grouped by their host-local date, in order, for the date picker. */
export function groupByLocalDate(slots: Slot[]): Array<{ date: string; slots: Slot[] }> {
  const map = new Map<string, Slot[]>()
  for (const s of slots) {
    const list = map.get(s.localDate)
    if (list) list.push(s)
    else map.set(s.localDate, [s])
  }
  return Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, list]) => ({ date, slots: list }))
}
