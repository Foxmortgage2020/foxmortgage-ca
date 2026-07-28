// The booking engine's timezone math. This is the only place a wall clock
// becomes an instant, so it is the only place a DST bug can hide, and these are
// the tests that keep it honest. No network, no ambient clock.

import { describe, it, expect } from 'vitest'
import {
  addDaysYMD,
  daysBetweenYMD,
  fmtHHMM,
  isoMs,
  normalizeWindows,
  parseHHMM,
  toUtcIso,
  wallClockToUtc,
  weekdayOfYMD,
  ymdSeries,
  zoneOffsetMinutes,
  zonedMinutesOfDay,
  zonedYMD,
} from '@/lib/booking/time'

const TZ = 'America/Toronto'

describe('zoneOffsetMinutes', () => {
  it('reads standard time and daylight time for Toronto', () => {
    expect(zoneOffsetMinutes(new Date('2026-01-15T12:00:00Z'), TZ)).toBe(-300)
    expect(zoneOffsetMinutes(new Date('2026-07-15T12:00:00Z'), TZ)).toBe(-240)
  })

  it('handles a zone with a half hour offset', () => {
    expect(zoneOffsetMinutes(new Date('2026-07-15T12:00:00Z'), 'Asia/Kolkata')).toBe(330)
  })

  it('reads UTC as zero', () => {
    expect(zoneOffsetMinutes(new Date('2026-07-15T12:00:00Z'), 'UTC')).toBe(0)
  })
})

describe('wallClockToUtc', () => {
  it('maps 9am local to the right instant in winter and in summer', () => {
    expect(toUtcIso(wallClockToUtc('2026-01-15', 9 * 60, TZ))).toBe('2026-01-15T14:00:00Z')
    expect(toUtcIso(wallClockToUtc('2026-07-15', 9 * 60, TZ))).toBe('2026-07-15T13:00:00Z')
  })

  it('round trips 9am local on every day across the spring transition', () => {
    // The range deliberately spans the March change. Rather than hardcode the
    // transition date, the test asserts the round trip holds for every day AND
    // that the offset genuinely moves inside the range, so it can never pass
    // vacuously on a range where nothing happens.
    const days = ymdSeries('2026-03-01', 15)
    const offsets = new Set<number>()
    for (const ymd of days) {
      const instant = wallClockToUtc(ymd, 9 * 60, TZ)
      expect(zonedYMD(instant, TZ)).toBe(ymd)
      expect(zonedMinutesOfDay(instant, TZ)).toBe(9 * 60)
      offsets.add(zoneOffsetMinutes(instant, TZ))
    }
    expect(offsets.size).toBe(2)
  })

  it('round trips 9am local on every day across the autumn transition', () => {
    const days = ymdSeries('2026-10-26', 12)
    const offsets = new Set<number>()
    for (const ymd of days) {
      const instant = wallClockToUtc(ymd, 9 * 60, TZ)
      expect(zonedYMD(instant, TZ)).toBe(ymd)
      expect(zonedMinutesOfDay(instant, TZ)).toBe(9 * 60)
      offsets.add(zoneOffsetMinutes(instant, TZ))
    }
    expect(offsets.size).toBe(2)
  })

  it('stays total on a wall clock the spring transition skips (regression)', () => {
    // 2:30am does not exist on the spring-forward day. It must resolve to a real
    // instant rather than throw or return an invalid date, because the engine is
    // allowed to ask about any minute of any day.
    const instant = wallClockToUtc('2026-03-08', 2 * 60 + 30, TZ)
    expect(Number.isFinite(instant.getTime())).toBe(true)
  })

  it('is midnight-safe', () => {
    const instant = wallClockToUtc('2026-07-15', 0, TZ)
    expect(zonedYMD(instant, TZ)).toBe('2026-07-15')
    expect(zonedMinutesOfDay(instant, TZ)).toBe(0)
  })
})

describe('zonedYMD', () => {
  it('reports the local date, not the UTC one (regression)', () => {
    // 01:30Z on the 16th is still the evening of the 15th in Toronto. A UTC read
    // would put this booking on the wrong day and every per-day rule with it.
    expect(zonedYMD(new Date('2026-07-16T01:30:00Z'), TZ)).toBe('2026-07-15')
  })
})

describe('calendar helpers', () => {
  it('knows weekdays', () => {
    // 2026-07-27 is a Monday.
    expect(weekdayOfYMD('2026-07-27')).toBe(1)
    expect(weekdayOfYMD('2026-07-26')).toBe(0)
    expect(weekdayOfYMD('2026-08-01')).toBe(6)
  })

  it('adds days across a month and a year boundary', () => {
    expect(addDaysYMD('2026-07-31', 1)).toBe('2026-08-01')
    expect(addDaysYMD('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysYMD('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('counts days between dates in both directions', () => {
    expect(daysBetweenYMD('2026-07-01', '2026-07-31')).toBe(30)
    expect(daysBetweenYMD('2026-07-31', '2026-07-01')).toBe(-30)
    expect(daysBetweenYMD('2026-07-01', '2026-07-01')).toBe(0)
  })

  it('builds a series', () => {
    expect(ymdSeries('2026-07-27', 3)).toEqual(['2026-07-27', '2026-07-28', '2026-07-29'])
  })
})

describe('parseHHMM', () => {
  it('parses valid clock strings', () => {
    expect(parseHHMM('09:00')).toBe(540)
    expect(parseHHMM('9:05')).toBe(545)
    expect(parseHHMM('00:00')).toBe(0)
    expect(parseHHMM('24:00')).toBe(1440)
  })

  it('returns null rather than zero on anything malformed', () => {
    // Zero would read as midnight and quietly open the whole night.
    expect(parseHHMM('')).toBeNull()
    expect(parseHHMM('9')).toBeNull()
    expect(parseHHMM('09:60')).toBeNull()
    expect(parseHHMM('25:00')).toBeNull()
    expect(parseHHMM('24:30')).toBeNull()
    expect(parseHHMM(null)).toBeNull()
    expect(parseHHMM(540)).toBeNull()
  })

  it('round trips with fmtHHMM', () => {
    expect(fmtHHMM(540)).toBe('09:00')
    expect(fmtHHMM(1020)).toBe('17:00')
    expect(parseHHMM(fmtHHMM(742))).toBe(742)
  })
})

describe('normalizeWindows', () => {
  it('parses, sorts, and merges overlapping windows', () => {
    expect(
      normalizeWindows([
        { start: '13:00', end: '17:00' },
        { start: '09:00', end: '12:00' },
        { start: '11:30', end: '13:30' },
      ]),
    ).toEqual([{ start: 540, end: 1020 }])
  })

  it('keeps windows that only touch as one merged range', () => {
    expect(
      normalizeWindows([
        { start: '09:00', end: '12:00' },
        { start: '12:00', end: '17:00' },
      ]),
    ).toEqual([{ start: 540, end: 1020 }])
  })

  it('keeps a genuine gap apart', () => {
    expect(
      normalizeWindows([
        { start: '09:00', end: '12:00' },
        { start: '13:00', end: '17:00' },
      ]),
    ).toEqual([
      { start: 540, end: 720 },
      { start: 780, end: 1020 },
    ])
  })

  it('drops malformed and inverted rows instead of widening the day', () => {
    // A bad stored row must never OPEN time. The worst it may do is remove itself.
    expect(
      normalizeWindows([
        { start: '17:00', end: '09:00' },
        { start: 'nonsense', end: '17:00' },
        { start: '09:00', end: '09:00' },
        { start: '10:00', end: '11:00' },
      ]),
    ).toEqual([{ start: 600, end: 660 }])
  })

  it('treats a non array as no availability', () => {
    expect(normalizeWindows(null)).toEqual([])
    expect(normalizeWindows(undefined)).toEqual([])
    expect(normalizeWindows('09:00-17:00')).toEqual([])
  })
})

describe('instants', () => {
  it('formats to a second-precision Z string', () => {
    expect(toUtcIso(new Date('2026-07-27T13:00:00.123Z'))).toBe('2026-07-27T13:00:00Z')
  })

  it('parses or reports null', () => {
    expect(isoMs('2026-07-27T13:00:00Z')).toBe(Date.parse('2026-07-27T13:00:00Z'))
    expect(isoMs('not a date')).toBeNull()
  })
})
