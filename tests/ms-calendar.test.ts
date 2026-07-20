// The Microsoft calendar band (2026-07-20). Three things are proven here:
//   1. The pure mapper — ordering, status (past/now/upcoming/all-day),
//      time formatting, and the DST-safe "now in Toronto" — deterministically.
//   2. msCalendarConfigured — all four env vars present (trimmed) vs absent.
//   3. Server-only: the module and its secrets never reach a client bundle.
// No network is touched; getTodayCalendar's live path is proven by the live
// render, its fail-soft paths by the deterministic logic here + the demo test.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  mapCalendarEvents,
  localMinutes,
  localOffsetMinutes,
  fmtClock,
  torontoNowMinutes,
  msCalendarConfigured,
  type GraphEventLite,
} from '@/lib/ms-calendar'

const TODAY = '2026-07-20'

// ─── Pure time helpers ───────────────────────────────────────────────────────

describe('fmtClock', () => {
  it('formats minutes-since-midnight into a 12-hour clock', () => {
    expect(fmtClock(0)).toBe('12:00 AM')
    expect(fmtClock(9 * 60)).toBe('9:00 AM')
    expect(fmtClock(11 * 60 + 30)).toBe('11:30 AM')
    expect(fmtClock(12 * 60)).toBe('12:00 PM')
    expect(fmtClock(13 * 60 + 5)).toBe('1:05 PM')
    expect(fmtClock(23 * 60 + 59)).toBe('11:59 PM')
  })
})

describe('localMinutes', () => {
  it('parses a naive local datetime clock; null when unparseable', () => {
    expect(localMinutes('2026-07-20T09:05:00')).toBe(545)
    expect(localMinutes('2026-07-20T00:00:00.0000000')).toBe(0)
    expect(localMinutes(null)).toBeNull()
    expect(localMinutes('2026-07-20')).toBeNull() // no time part
    expect(localMinutes('garbage')).toBeNull()
  })
})

describe('localOffsetMinutes (date-aware)', () => {
  it('is minutes-into-today; negative before today, over 1440 after', () => {
    expect(localOffsetMinutes('2026-07-20T09:05:00', TODAY)).toBe(545)
    expect(localOffsetMinutes('2026-07-21T01:00:00', TODAY)).toBe(1440 + 60) // tomorrow 1am
    expect(localOffsetMinutes('2026-07-19T22:00:00', TODAY)).toBe(-1440 + 1320) // yesterday 10pm
    expect(localOffsetMinutes(null, TODAY)).toBeNull()
    expect(localOffsetMinutes('garbage', TODAY)).toBeNull()
  })
})

describe('torontoNowMinutes (DST-safe)', () => {
  it('projects a UTC instant into Toronto minutes-since-midnight', () => {
    // 15:30 UTC in July is 11:30 EDT (UTC-4).
    expect(torontoNowMinutes(new Date('2026-07-20T15:30:00Z'))).toBe(11 * 60 + 30)
    // 15:30 UTC in January is 10:30 EST (UTC-5).
    expect(torontoNowMinutes(new Date('2026-01-15T15:30:00Z'))).toBe(10 * 60 + 30)
  })
})

// ─── The mapper ──────────────────────────────────────────────────────────────

const LITES: GraphEventLite[] = [
  { subject: 'C', startLocal: '2026-07-20T11:00:00', endLocal: '2026-07-20T11:45:00', isAllDay: false, location: null, isOnline: true },
  { subject: 'A', startLocal: '2026-07-20T08:30:00', endLocal: '2026-07-20T09:00:00', isAllDay: false, location: 'Room 1', isOnline: false },
  { subject: 'Team offsite', startLocal: '2026-07-20T00:00:00', endLocal: '2026-07-21T00:00:00', isAllDay: true, location: null, isOnline: false },
  { subject: 'B', startLocal: '2026-07-20T09:30:00', endLocal: '2026-07-20T10:15:00', isAllDay: false, location: null, isOnline: false },
]

describe('mapCalendarEvents', () => {
  it('sorts all-day first then by start time', () => {
    const out = mapCalendarEvents(LITES, 600, TODAY) // 10:00
    expect(out.map(e => e.subject)).toEqual(['Team offsite', 'A', 'B', 'C'])
  })

  it('derives status from nowMinutes: past / now / upcoming / all-day', () => {
    const out = mapCalendarEvents(LITES, 600, TODAY) // 10:00
    const byName = Object.fromEntries(out.map(e => [e.subject, e.status]))
    expect(byName['Team offsite']).toBe('allday')
    expect(byName['A']).toBe('past') // ended 09:00
    expect(byName['B']).toBe('now') // 09:30–10:15 spans 10:00
    expect(byName['C']).toBe('upcoming') // starts 11:00
  })

  it('re-derives status as the clock moves (only the network read is cached)', () => {
    // At 08:45, A is in progress and B is upcoming.
    const out = mapCalendarEvents(LITES, 8 * 60 + 45, TODAY)
    const byName = Object.fromEntries(out.map(e => [e.subject, e.status]))
    expect(byName['A']).toBe('now')
    expect(byName['B']).toBe('upcoming')
    // At 20:00, everything timed is past.
    const late = mapCalendarEvents(LITES, 20 * 60, TODAY)
    expect(late.filter(e => !e.isAllDay).every(e => e.status === 'past')).toBe(true)
  })

  it('places a cross-midnight event by date, not clock (regression)', () => {
    // 10:00 PM today -> 1:00 AM tomorrow: end.dateTime is on the NEXT date.
    const overnight: GraphEventLite[] = [
      { subject: 'Overnight', startLocal: '2026-07-20T22:00:00', endLocal: '2026-07-21T01:00:00', isAllDay: false, location: null, isOnline: false },
    ]
    // At 11:00 PM today it is in progress (a clock-only reading would call it past).
    const now = mapCalendarEvents(overnight, 23 * 60, TODAY)[0]
    expect(now.status).toBe('now')
    expect(now.timeLabel).toBe('10:00 PM')
    expect(now.rangeLabel).toBe('10:00 PM to 1:00 AM')
    // From TOMORROW's view at 12:30 AM it is still in progress (a clock-only
    // reading would call it upcoming and sort it last).
    const nextDay = mapCalendarEvents(overnight, 30, '2026-07-21')[0]
    expect(nextDay.status).toBe('now')
    // A multi-day timed event running into tomorrow is not "past" at today 5pm.
    const multiday: GraphEventLite[] = [
      { subject: 'Offsite', startLocal: '2026-07-20T09:00:00', endLocal: '2026-07-21T17:00:00', isAllDay: false, location: null, isOnline: false },
    ]
    expect(mapCalendarEvents(multiday, 17 * 60, TODAY)[0].status).toBe('now')
  })

  it('formats time and range labels', () => {
    const out = mapCalendarEvents(LITES, 600, TODAY)
    const b = out.find(e => e.subject === 'B')!
    expect(b.timeLabel).toBe('9:30 AM')
    expect(b.rangeLabel).toBe('9:30 AM to 10:15 AM')
    const all = out.find(e => e.subject === 'Team offsite')!
    expect(all.timeLabel).toBe('All day')
    expect(all.rangeLabel).toBe('All day')
  })

  it('preserves the location and online hint', () => {
    const out = mapCalendarEvents(LITES, 600, TODAY)
    expect(out.find(e => e.subject === 'A')!.location).toBe('Room 1')
    expect(out.find(e => e.subject === 'C')!.isOnline).toBe(true)
  })

  it('falls back to the neutral all-day treatment for an empty subject or unparseable start', () => {
    const out = mapCalendarEvents(
      [{ subject: '', startLocal: 'garbage', endLocal: null, isAllDay: false, location: null, isOnline: false }],
      600,
      TODAY,
    )
    expect(out[0].subject).toBe('Untitled event')
    expect(out[0].status).toBe('allday')
    expect(out[0].timeLabel).toBe('All day')
  })
})

// ─── Config presence ─────────────────────────────────────────────────────────

describe('msCalendarConfigured', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('is true only when all four vars are present, trimming whitespace', () => {
    vi.stubEnv('MS_TENANT_ID', ' tenant ') // leading/trailing space is trimmed
    vi.stubEnv('MS_CLIENT_ID', 'client')
    vi.stubEnv('MS_CLIENT_SECRET', 'secret')
    vi.stubEnv('MS_CALENDAR_UPN', 'mailbox@example.com')
    expect(msCalendarConfigured()).toBe(true)
  })

  it('is false when any var is missing or blank', () => {
    vi.stubEnv('MS_TENANT_ID', 'tenant')
    vi.stubEnv('MS_CLIENT_ID', 'client')
    vi.stubEnv('MS_CLIENT_SECRET', 'secret')
    vi.stubEnv('MS_CALENDAR_UPN', '') // blank
    expect(msCalendarConfigured()).toBe(false)
    vi.stubEnv('MS_CALENDAR_UPN', '   ') // whitespace-only
    expect(msCalendarConfigured()).toBe(false)
  })
})

// ─── Server-only: no secret code reaches the client ──────────────────────────

function walkSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walkSources(p, out)
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p)
  }
  return out
}

describe('the calendar integration is server-only', () => {
  const roots = ['app', 'components', 'lib', 'config']
  const files = roots.flatMap(r => walkSources(r))

  it('lib/ms-calendar.ts carries no client directive and reads no client-exposed env', () => {
    const src = readFileSync('lib/ms-calendar.ts', 'utf8')
    expect(src.includes("'use client'")).toBe(false)
    // Match the real declaration, not the word in a comment: a secret is only
    // exposed client-side via a NEXT_PUBLIC_ env READ.
    expect(/process\.env\.NEXT_PUBLIC/.test(src)).toBe(false)
    expect(/NEXT_PUBLIC_MS_/.test(src)).toBe(false)
  })

  it('no client component imports @/lib/ms-calendar', () => {
    const offenders = files.filter(f => {
      const src = readFileSync(f, 'utf8')
      const isClient = /^\s*['"]use client['"]/m.test(src)
      const importsIt = /from ['"]@\/lib\/ms-calendar['"]/.test(src)
      return isClient && importsIt
    })
    expect(offenders).toEqual([])
  })

  it('the MS_ secrets are never exposed under a NEXT_PUBLIC name', () => {
    const offenders = files.filter(f => /NEXT_PUBLIC_MS_/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})
