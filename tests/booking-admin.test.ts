// The Availability page's validation, and the two contracts that keep the admin
// surface honest: the bounds match the database, and an admin cancel is the
// client's own cancel with a different `by`.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  EVENT_TYPE_BOUNDS,
  EVENT_TYPE_FIELD_LABELS,
  WEEKDAYS,
  validateEventTypeDraft,
  validateOverrideDraft,
  validateWindows,
  weeklyOpenMinutes,
  windowLabel,
} from '@/lib/booking/admin'
import { clientCopyProblems, copyGateOffenders, passesCopyGate } from '@/lib/booking/copy-gate'
import { normalizeWindows } from '@/lib/booking/time'
import { PERMISSIONS, PERMISSION_LABELS } from '@/config/authority'
import { ADMIN_NAV } from '@/config/admin-nav'

// ─── Windows ─────────────────────────────────────────────────────────────────

describe('validateWindows is LOUD where normalizeWindows is quiet', () => {
  it('accepts a plain working day', () => {
    const r = validateWindows([{ start: '09:00', end: '17:00' }])
    expect(r).toEqual({ ok: true, value: [{ start: '09:00', end: '17:00' }] })
  })

  it('accepts an empty list, which means closed', () => {
    expect(validateWindows([])).toEqual({ ok: true, value: [] })
  })

  it('REFUSES an inverted window that normalizeWindows would silently drop', () => {
    const bad = [{ start: '17:00', end: '09:00' }]
    // The read path drops it, which is right on the way out and a trap on the
    // way in: a green save for a day that is actually closed.
    expect(normalizeWindows(bad)).toEqual([])
    const r = validateWindows(bad)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toMatch(/end time must be after the start time/)
  })

  it('REFUSES overlaps rather than merging them', () => {
    const overlapping = [
      { start: '09:00', end: '12:00' },
      { start: '11:00', end: '15:00' },
    ]
    // normalizeWindows merges into one 09:00 to 15:00 block. Handing that back
    // as "saved" would be a day the person never described.
    expect(normalizeWindows(overlapping)).toEqual([{ start: 540, end: 900 }])
    const r = validateWindows(overlapping)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toMatch(/overlap/)
  })

  it('sorts two windows typed out of order', () => {
    const r = validateWindows([
      { start: '13:00', end: '17:00' },
      { start: '09:00', end: '12:00' },
    ])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.map(w => w.start)).toEqual(['09:00', '13:00'])
  })

  it('refuses junk times', () => {
    expect(validateWindows([{ start: 'nine', end: '17:00' }]).ok).toBe(false)
    expect(validateWindows([{ start: '25:00', end: '26:00' }]).ok).toBe(false)
    expect(validateWindows('not a list').ok).toBe(false)
  })

  it('adjacent windows are fine, they only touch', () => {
    const r = validateWindows([
      { start: '09:00', end: '12:00' },
      { start: '12:00', end: '17:00' },
    ])
    expect(r.ok).toBe(true)
  })
})

describe('summary helpers', () => {
  it('counts a week of open minutes', () => {
    expect(
      weeklyOpenMinutes([
        { weekday: 1, windows: [{ start: '09:00', end: '17:00' }] },
        { weekday: 2, windows: [{ start: '09:00', end: '12:00' }, { start: '13:00', end: '17:00' }] },
      ]),
    ).toBe(480 + 180 + 240)
  })

  it('ignores a malformed window rather than counting it as a negative', () => {
    expect(weeklyOpenMinutes([{ weekday: 1, windows: [{ start: '17:00', end: '09:00' }] }])).toBe(0)
  })

  it('labels a window in words a person reads', () => {
    expect(windowLabel({ start: '09:00', end: '17:00' })).toBe('9:00 AM to 5:00 PM')
    expect(windowLabel({ start: '12:00', end: '13:30' })).toBe('12:00 PM to 1:30 PM')
    expect(windowLabel({ start: '00:30', end: '12:00' })).toBe('12:30 AM to 12:00 PM')
  })

  it('names all seven days', () => {
    expect(WEEKDAYS).toHaveLength(7)
    expect(WEEKDAYS[0].label).toBe('Sunday')
    expect(WEEKDAYS[6].label).toBe('Saturday')
  })
})

// ─── Overrides ───────────────────────────────────────────────────────────────

describe('date overrides', () => {
  it('a closed day needs only a date', () => {
    const r = validateOverrideDraft({ date: '2026-12-25', closed: true })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toEqual({ date: '2026-12-25', closed: true, windows: [], note: null })
  })

  it('REFUSES an open day with no windows, because that silently means closed', () => {
    const r = validateOverrideDraft({ date: '2026-12-24', closed: false, windows: [] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors).toContain('An open day needs at least one time window.')
  })

  it('an open day with windows keeps them', () => {
    const r = validateOverrideDraft({
      date: '2026-12-24',
      closed: false,
      windows: [{ start: '09:00', end: '12:00' }],
      note: 'Half day',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.windows).toEqual([{ start: '09:00', end: '12:00' }])
      expect(r.value.note).toBe('Half day')
    }
  })

  it('refuses a missing or malformed date', () => {
    expect(validateOverrideDraft({ closed: true }).ok).toBe(false)
    expect(validateOverrideDraft({ date: '25-12-2026', closed: true }).ok).toBe(false)
  })
})

// ─── Event types ─────────────────────────────────────────────────────────────

function goodType(over: Record<string, unknown> = {}) {
  return {
    slug: 'discovery-call',
    name: 'Discovery call',
    description: 'A quick first call.',
    durationMinutes: 15,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 5,
    minNoticeHours: 4,
    maxAdvanceDays: 60,
    maxPerDay: 8,
    slotIncrementMinutes: 15,
    intakeQuestions: [],
    active: true,
    ...over,
  }
}

describe('meeting type settings', () => {
  it('accepts the shipped discovery call unchanged', () => {
    expect(validateEventTypeDraft(goodType()).ok).toBe(true)
  })

  it('enforces every bound, at both ends', () => {
    for (const field of Object.keys(EVENT_TYPE_BOUNDS) as Array<keyof typeof EVENT_TYPE_BOUNDS>) {
      const b = EVENT_TYPE_BOUNDS[field]
      // A slot increment above the meeting length trips its own rule first, so
      // shorten the meeting rather than lengthening the increment.
      const below = validateEventTypeDraft(goodType({ [field]: b.min - 1 }))
      expect(below.ok, `${field} below minimum`).toBe(false)
      // The computed key goes LAST so it wins over the two baseline overrides.
      // Putting it first silently let `durationMinutes: 480` overwrite the very
      // value under test, and the assertion passed for the wrong reason.
      const above = validateEventTypeDraft(
        goodType({ durationMinutes: 480, slotIncrementMinutes: 5, [field]: b.max + 1 }),
      )
      expect(above.ok, `${field} above maximum`).toBe(false)
    }
  })

  it('refuses a fractional or non-numeric setting', () => {
    expect(validateEventTypeDraft(goodType({ durationMinutes: 15.5 })).ok).toBe(false)
    expect(validateEventTypeDraft(goodType({ durationMinutes: 'fifteen' })).ok).toBe(false)
    expect(validateEventTypeDraft(goodType({ durationMinutes: NaN })).ok).toBe(false)
  })

  it('CROSS-FIELD: a slot increment longer than the meeting is refused', () => {
    const r = validateEventTypeDraft(goodType({ durationMinutes: 15, slotIncrementMinutes: 30 }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors).toContain('Slot increment cannot be longer than the meeting itself.')
  })

  it('requires a name', () => {
    expect(validateEventTypeDraft(goodType({ name: '   ' })).ok).toBe(false)
  })

  it('validates intake questions and refuses duplicate keys', () => {
    const dup = validateEventTypeDraft(
      goodType({
        intakeQuestions: [
          { key: 'situation', label: 'What is going on?', type: 'text', required: true },
          { key: 'situation', label: 'Again?', type: 'text' },
        ],
      }),
    )
    expect(dup.ok).toBe(false)
    if (!dup.ok) expect(dup.errors.some(e => e.includes('used more than once'))).toBe(true)
  })

  it('a choice question with no options is refused', () => {
    const r = validateEventTypeDraft(
      goodType({ intakeQuestions: [{ key: 'kind', label: 'Which?', type: 'select', options: [] }] }),
    )
    expect(r.ok).toBe(false)
  })

  it('every numeric field has a human label', () => {
    for (const field of Object.keys(EVENT_TYPE_BOUNDS)) {
      expect(EVENT_TYPE_FIELD_LABELS[field as keyof typeof EVENT_TYPE_BOUNDS]).toBeTruthy()
    }
  })
})

describe('THE BOUNDS MATCH THE DATABASE', () => {
  // If a column check and this table ever disagree, the page accepts something
  // Postgres then refuses, and the failure surfaces as a 502 rather than as the
  // helpful sentence the person needed.
  const sql = readFileSync('supabase/migrations/20260727160000_booking_engine.sql', 'utf8')
  const COLUMN: Record<keyof typeof EVENT_TYPE_BOUNDS, string> = {
    durationMinutes: 'duration_minutes',
    bufferBeforeMinutes: 'buffer_before_minutes',
    bufferAfterMinutes: 'buffer_after_minutes',
    minNoticeHours: 'min_notice_hours',
    maxAdvanceDays: 'max_advance_days',
    maxPerDay: 'max_per_day',
    slotIncrementMinutes: 'slot_increment_minutes',
  }

  for (const [field, column] of Object.entries(COLUMN) as Array<
    [keyof typeof EVENT_TYPE_BOUNDS, string]
  >) {
    it(`${column} between ${EVENT_TYPE_BOUNDS[field].min} and ${EVENT_TYPE_BOUNDS[field].max}`, () => {
      const re = new RegExp(`${column}[^,]*?between\\s+(\\d+)\\s+and\\s+(\\d+)`, 's')
      const m = re.exec(sql)
      expect(m, `no check constraint found for ${column}`).toBeTruthy()
      expect(Number(m![1])).toBe(EVENT_TYPE_BOUNDS[field].min)
      expect(Number(m![2])).toBe(EVENT_TYPE_BOUNDS[field].max)
    })
  }
})

// ─── The copy gate, now shared code rather than three copies ─────────────────

describe('the copy gate module', () => {
  it('catches every banned character', () => {
    expect(copyGateOffenders('Book now — today')).toEqual(['em dash'])
    expect(copyGateOffenders('Ranges 9–5')).toEqual(['en dash'])
    expect(copyGateOffenders('One thing; another')).toEqual(['semicolon'])
    expect(copyGateOffenders('Great news!')).toEqual(['exclamation point'])
    expect(copyGateOffenders('Ask your broker')).toEqual(['the word broker'])
    expect(copyGateOffenders('Ask your Brokers')).toEqual(['the word broker'])
  })

  it('passes clean client copy', () => {
    expect(passesCopyGate('A quick first call to hear what you are working on.')).toBe(true)
    expect(copyGateOffenders('')).toEqual([])
  })

  it('does not trip on a word that merely contains broker', () => {
    expect(passesCopyGate('The brokerage is BRX Mortgage.')).toBe(true)
  })

  it('phrases the problem for whoever is about to publish it', () => {
    expect(clientCopyProblems('Book now!')).toEqual(['contains an exclamation point.'])
    expect(clientCopyProblems('Talk to a broker')[0]).toMatch(/Mortgage Agent, Level 2/)
  })
})

// ─── The wiring contracts ────────────────────────────────────────────────────

describe('the Availability page is wired the way it claims', () => {
  it('booking.manage exists, is admin only, and has a plain-language label', () => {
    expect(PERMISSIONS['booking.manage']).toEqual(['admin'])
    expect(PERMISSION_LABELS['booking.manage']).toBeTruthy()
  })

  it('the nav item points at the page and rides that key', () => {
    const item = ADMIN_NAV.find(n => n.href === '/portal/admin/availability')
    expect(item).toBeTruthy()
    expect(item!.permission).toBe('booking.manage')
    expect(item!.label).toBe('Availability')
  })

  it('every write route gates on booking.manage', () => {
    const routes = [
      'app/api/portal/admin/booking/hours/route.ts',
      'app/api/portal/admin/booking/overrides/route.ts',
      'app/api/portal/admin/booking/event-types/route.ts',
      'app/api/portal/admin/booking/bookings/[id]/cancel/route.ts',
    ]
    for (const r of routes) {
      expect(readFileSync(r, 'utf8'), r).toContain("apiPermission('booking.manage')")
    }
  })

  it('NO write route takes an agent id from the request', () => {
    // A client-supplied agent id on an admin write is how one host would edit
    // another host's calendar. Every route resolves it server-side instead.
    const routes = [
      'app/api/portal/admin/booking/hours/route.ts',
      'app/api/portal/admin/booking/overrides/route.ts',
      'app/api/portal/admin/booking/event-types/route.ts',
    ]
    for (const r of routes) {
      const src = readFileSync(r, 'utf8')
      expect(src, r).toContain('bookingAgentId()')
      expect(src.includes('body?.agentId') || src.includes('body.agentId'), r).toBe(false)
    }
  })

  it('THE ADMIN CANCEL IS THE CLIENT CANCEL, with a different by', () => {
    // The whole point: no shortcut path that skips the client email or the
    // calendar removal, both of which live inside cancelBooking.
    const src = readFileSync('app/api/portal/admin/booking/bookings/[id]/cancel/route.ts', 'utf8')
    expect(src).toContain('cancelBooking(')
    expect(src).toContain("by: 'admin'")
    expect(src).not.toContain('cancelBookingRow')
    // And the by-id lookup returns the same shape the token lookup does.
    const store = readFileSync('lib/booking/store.ts', 'utf8')
    expect(store).toContain('mapTokenBooking')
    expect(store.match(/mapTokenBooking\(/g)?.length).toBeGreaterThanOrEqual(3)
  })

  it('the upcoming read is demo-guarded and the settings read is not', () => {
    const store = readFileSync('lib/booking/store.ts', 'utf8')
    const upcoming = store.slice(store.indexOf('export async function adminUpcoming'))
    expect(upcoming.slice(0, 400)).toContain('isDemoMode()')
    const overview = store.slice(
      store.indexOf('export async function adminOverview'),
      store.indexOf('export interface AdminUpcomingRow'),
    )
    expect(overview).not.toContain('isDemoMode()')
  })

  it('every admin booking write refuses in demo', () => {
    const store = readFileSync('lib/booking/store.ts', 'utf8')
    for (const fn of ['setHours', 'setOverride', 'deleteOverride', 'updateEventType']) {
      const at = store.indexOf(`export async function ${fn}`)
      expect(at, fn).toBeGreaterThan(-1)
      expect(store.slice(at, at + 500), fn).toContain('DEMO_REFUSAL')
    }
  })
})
