// The availability engine. Every rule the booking page enforces is proven here,
// because this is the module the display path and the confirm path share — if a
// rule is right here it is right in both, and if it is wrong here it is wrong in
// both. No network, no ambient clock: `now` is always injected.

import { describe, it, expect } from 'vitest'
import {
  computeSlots,
  groupByLocalDate,
  overlaps,
  slotIsOffered,
  startsInWindow,
  windowsForDate,
} from '@/lib/booking/availability'
import type { AvailabilityInputs, EventType, ExistingBooking, Interval } from '@/lib/booking/types'

const TZ = 'America/Toronto'
// A Monday, 8:00am Toronto (12:00Z in July).
const NOW = new Date('2026-07-27T12:00:00Z')

function eventType(partial: Partial<EventType> = {}): EventType {
  return {
    slug: 'strategy-session',
    name: 'Strategy session',
    description: null,
    durationMinutes: 45,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    minNoticeHours: 0,
    maxAdvanceDays: 7,
    maxPerDay: 20,
    slotIncrementMinutes: 15,
    intakeQuestions: [],
    ...partial,
  }
}

// Every weekday open 9 to 5, so a test never depends on which day NOW lands on.
function allWeekHours(windows = [{ start: '09:00', end: '17:00' }]) {
  return [0, 1, 2, 3, 4, 5, 6].map(weekday => ({ weekday, windows }))
}

function inputs(partial: Partial<AvailabilityInputs> = {}): AvailabilityInputs {
  return {
    hours: allWeekHours(),
    overrides: [],
    bookings: [],
    ...partial,
  }
}

function booking(partial: Partial<ExistingBooking> & { start: string; end: string }): ExistingBooking {
  return {
    localDate: '2026-07-27',
    eventTypeSlug: 'strategy-session',
    bufferBefore: 0,
    bufferAfter: 0,
    ...partial,
  }
}

function run(opts: {
  eventType?: EventType
  inputs?: AvailabilityInputs
  busy?: Interval[]
  busyReadable?: boolean
  now?: Date
  days?: number
  fromYMD?: string
}) {
  return computeSlots({
    timezone: TZ,
    eventType: opts.eventType ?? eventType(),
    inputs: opts.inputs ?? inputs(),
    busy: opts.busy ?? [],
    busyReadable: opts.busyReadable ?? true,
    now: opts.now ?? NOW,
    days: opts.days ?? 1,
    fromYMD: opts.fromYMD,
  })
}

describe('overlaps', () => {
  it('treats intervals as half open, so touching endpoints do not clash', () => {
    expect(overlaps(0, 10, 10, 20)).toBe(false)
    expect(overlaps(10, 20, 0, 10)).toBe(false)
    expect(overlaps(0, 11, 10, 20)).toBe(true)
    expect(overlaps(5, 6, 0, 20)).toBe(true)
  })
})

describe('startsInWindow', () => {
  it('offers starts on the increment grid and never runs past the window', () => {
    // 9:00 to 10:00, 45 minutes, 15 minute grid: only 9:00 and 9:15 fit.
    expect(startsInWindow({ start: 540, end: 600 }, 45, 15)).toEqual([540, 555])
  })

  it('aligns to the grid measured from midnight, not from the window start', () => {
    // A window opening at 9:10 still offers 9:15, not 9:10.
    expect(startsInWindow({ start: 550, end: 700 }, 30, 15)[0]).toBe(555)
  })

  it('returns nothing when the duration cannot fit', () => {
    expect(startsInWindow({ start: 540, end: 560 }, 45, 15)).toEqual([])
  })
})

describe('windowsForDate', () => {
  it('uses the weekday hours by default', () => {
    expect(windowsForDate('2026-07-27', { hours: allWeekHours(), overrides: [] })).toEqual([
      { start: 540, end: 1020 },
    ])
  })

  it('treats a missing weekday row as closed', () => {
    // Monday is weekday 1; only Sunday is configured here.
    const hours = [{ weekday: 0, windows: [{ start: '09:00', end: '17:00' }] }]
    expect(windowsForDate('2026-07-27', { hours, overrides: [] })).toEqual([])
  })

  it('lets a closed override remove the day', () => {
    const out = windowsForDate('2026-07-27', {
      hours: allWeekHours(),
      overrides: [{ date: '2026-07-27', closed: true, windows: [] }],
    })
    expect(out).toEqual([])
  })

  it('lets an open override replace the day entirely, not add to it', () => {
    const out = windowsForDate('2026-07-27', {
      hours: allWeekHours(),
      overrides: [{ date: '2026-07-27', closed: false, windows: [{ start: '13:00', end: '15:00' }] }],
    })
    expect(out).toEqual([{ start: 780, end: 900 }])
  })

  it('leaves other dates alone', () => {
    const overrides = [{ date: '2026-07-28', closed: true, windows: [] }]
    expect(windowsForDate('2026-07-27', { hours: allWeekHours(), overrides })).toEqual([
      { start: 540, end: 1020 },
    ])
  })
})

describe('computeSlots', () => {
  it('offers every slot that fits the day', () => {
    const slots = run({})
    // 9:00 to 17:00, 45 minutes, 15 minute grid. Last start that fits is 16:15.
    expect(slots[0].start).toBe('2026-07-27T13:00:00Z') // 9:00 Toronto
    expect(slots[slots.length - 1].start).toBe('2026-07-27T20:15:00Z') // 16:15 Toronto
    expect(slots.every(s => s.localDate === '2026-07-27')).toBe(true)
  })

  it('returns nothing at all when the calendar could not be read (fail closed)', () => {
    // The load-bearing safety rule: no visibility, no offers. If this ever
    // returns slots, the page starts promising times it cannot honour.
    expect(run({ busyReadable: false })).toEqual([])
  })

  it('respects the minimum notice', () => {
    // NOW is 8:00 Toronto. Four hours of notice rules out anything before noon.
    const slots = run({ eventType: eventType({ minNoticeHours: 4 }) })
    expect(slots[0].start).toBe('2026-07-27T16:00:00Z') // 12:00 Toronto
  })

  it('never offers a time in the past', () => {
    const noon = new Date('2026-07-27T16:00:00Z') // 12:00 Toronto
    const slots = run({ now: noon })
    expect(slots.every(s => Date.parse(s.start) >= noon.getTime())).toBe(true)
  })

  it('stops at the maximum advance', () => {
    const slots = run({ eventType: eventType({ maxAdvanceDays: 2 }), days: 10 })
    const dates = Array.from(new Set(slots.map(s => s.localDate)))
    expect(dates).toEqual(['2026-07-27', '2026-07-28', '2026-07-29'])
  })

  it('skips a day with no hours', () => {
    const hours = [{ weekday: 1, windows: [{ start: '09:00', end: '17:00' }] }] // Mondays only
    const slots = run({ inputs: inputs({ hours }), days: 3 })
    expect(Array.from(new Set(slots.map(s => s.localDate)))).toEqual(['2026-07-27'])
  })

  it('honours two windows in one day and the gap between them', () => {
    const hours = allWeekHours([
      { start: '09:00', end: '10:00' },
      { start: '14:00', end: '15:00' },
    ])
    const slots = run({ inputs: inputs({ hours }), eventType: eventType({ durationMinutes: 60 }) })
    expect(slots.map(s => s.start)).toEqual(['2026-07-27T13:00:00Z', '2026-07-27T18:00:00Z'])
  })

  it('blocks a slot that clashes with an existing booking', () => {
    const existing = booking({ start: '2026-07-27T13:00:00Z', end: '2026-07-27T13:45:00Z' })
    const slots = run({ inputs: inputs({ bookings: [existing] }) })
    expect(slots.some(s => s.start === '2026-07-27T13:00:00Z')).toBe(false)
    // The one starting exactly when it ends is still fine.
    expect(slots.some(s => s.start === '2026-07-27T13:45:00Z')).toBe(true)
  })

  it('blocks a slot that clashes with provider busy', () => {
    const busy = [{ start: '2026-07-27T13:00:00Z', end: '2026-07-27T14:00:00Z' }]
    const slots = run({ busy })
    expect(slots.some(s => Date.parse(s.start) < Date.parse('2026-07-27T14:00:00Z'))).toBe(false)
    expect(slots[0].start).toBe('2026-07-27T14:00:00Z')
  })

  it('pads the candidate by its own buffers against provider busy', () => {
    const busy = [{ start: '2026-07-27T14:00:00Z', end: '2026-07-27T15:00:00Z' }]
    const et = eventType({ durationMinutes: 30, bufferAfterMinutes: 15 })
    const slots = run({ busy, eventType: et })
    // 13:15 to 13:45 plus 15 minutes of buffer reaches 14:00, which only touches
    // the busy block and is allowed. 13:30 to 14:00 plus buffer would overlap.
    expect(slots.some(s => s.start === '2026-07-27T13:15:00Z')).toBe(true)
    expect(slots.some(s => s.start === '2026-07-27T13:30:00Z')).toBe(false)
  })

  it('pads an existing booking by the buffers it was booked under, not the new ones', () => {
    // The existing booking carries a 30 minute tail. The type being booked has
    // none. The gap after the existing booking must still be respected.
    const existing = booking({
      start: '2026-07-27T13:00:00Z',
      end: '2026-07-27T13:30:00Z',
      bufferAfter: 30,
    })
    const slots = run({ inputs: inputs({ bookings: [existing] }) })
    expect(slots.some(s => s.start === '2026-07-27T13:30:00Z')).toBe(false)
    expect(slots.some(s => s.start === '2026-07-27T14:00:00Z')).toBe(true)
  })

  it('closes a day that has hit the per day cap for this event type', () => {
    const bookings = [
      booking({ start: '2026-07-27T13:00:00Z', end: '2026-07-27T13:45:00Z' }),
      booking({ start: '2026-07-27T15:00:00Z', end: '2026-07-27T15:45:00Z' }),
    ]
    const slots = run({ eventType: eventType({ maxPerDay: 2 }), inputs: inputs({ bookings }) })
    expect(slots).toEqual([])
  })

  it('counts the per day cap per event type, not across all of them', () => {
    const bookings = [
      booking({
        start: '2026-07-27T13:00:00Z',
        end: '2026-07-27T13:45:00Z',
        eventTypeSlug: 'discovery-call',
      }),
    ]
    const slots = run({ eventType: eventType({ maxPerDay: 1 }), inputs: inputs({ bookings }) })
    expect(slots.length).toBeGreaterThan(0)
  })

  it('keeps every slot at the same local clock time across a DST change (regression)', () => {
    // Walking March 1 to March 15 crosses the spring change. If the engine did
    // its arithmetic on raw UTC offsets, half these days would slide by an hour.
    const et = eventType({ maxAdvanceDays: 20, durationMinutes: 60, slotIncrementMinutes: 60 })
    const march = new Date('2026-03-01T14:00:00Z') // 9:00 Toronto, standard time
    const slots = computeSlots({
      timezone: TZ,
      eventType: et,
      inputs: inputs(),
      busy: [],
      busyReadable: true,
      now: march,
      days: 15,
    })
    const firstPerDay = new Map<string, string>()
    for (const s of slots) if (!firstPerDay.has(s.localDate)) firstPerDay.set(s.localDate, s.start)
    const clocks = new Set(
      Array.from(firstPerDay.values()).map(iso =>
        new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(
          new Date(iso),
        ),
      ),
    )
    expect(Array.from(clocks)).toEqual(['09:00'])
    // Prove the range really did cross the change, so this cannot pass vacuously.
    const offsets = new Set(
      Array.from(firstPerDay.values()).map(iso => new Date(iso).getUTCHours()),
    )
    expect(offsets.size).toBe(2)
  })

  it('returns slots in order', () => {
    const slots = run({ days: 3, eventType: eventType({ maxAdvanceDays: 7 }) })
    const sorted = [...slots].sort((a, b) => (a.start < b.start ? -1 : 1))
    expect(slots).toEqual(sorted)
  })
})

describe('slotIsOffered', () => {
  const base = {
    timezone: TZ,
    eventType: eventType(),
    inputs: inputs(),
    busy: [] as Interval[],
    busyReadable: true,
    now: NOW,
  }

  it('accepts a slot the engine would offer', () => {
    expect(slotIsOffered(base, '2026-07-27T13:00:00Z')).toBe(true)
  })

  it('refuses a slot that is not on the grid', () => {
    expect(slotIsOffered(base, '2026-07-27T13:07:00Z')).toBe(false)
  })

  it('refuses a slot outside the hours', () => {
    expect(slotIsOffered(base, '2026-07-27T05:00:00Z')).toBe(false)
  })

  it('refuses a slot that a booking has since taken', () => {
    const taken = {
      ...base,
      inputs: inputs({
        bookings: [booking({ start: '2026-07-27T13:00:00Z', end: '2026-07-27T13:45:00Z' })],
      }),
    }
    expect(slotIsOffered(taken, '2026-07-27T13:00:00Z')).toBe(false)
  })

  it('refuses everything when the calendar could not be read', () => {
    expect(slotIsOffered({ ...base, busyReadable: false }, '2026-07-27T13:00:00Z')).toBe(false)
  })

  it('refuses a malformed instant', () => {
    expect(slotIsOffered(base, 'tomorrow please')).toBe(false)
  })
})

describe('groupByLocalDate', () => {
  it('groups and orders by date', () => {
    const grouped = groupByLocalDate([
      { start: '2026-07-28T13:00:00Z', end: '2026-07-28T13:45:00Z', localDate: '2026-07-28' },
      { start: '2026-07-27T13:00:00Z', end: '2026-07-27T13:45:00Z', localDate: '2026-07-27' },
      { start: '2026-07-27T14:00:00Z', end: '2026-07-27T14:45:00Z', localDate: '2026-07-27' },
    ])
    expect(grouped.map(g => g.date)).toEqual(['2026-07-27', '2026-07-28'])
    expect(grouped[0].slots.length).toBe(2)
  })
})
