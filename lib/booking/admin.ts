// Validation for the Availability page. PURE — no I/O, no env, no clock. The
// route calls it before the store, and the editor calls the same functions for
// inline feedback, so the two cannot disagree about what a valid week is.
//
// WHY THIS EXISTS RATHER THAN REUSING normalizeWindows. That helper is the READ
// path's, and it deliberately DROPS anything malformed or inverted: on the way
// out of the database a bad row must never widen availability, so silently
// removing itself is the correct failure. On the way IN that behaviour is a
// trap. Someone who types nine to eight and gets a green save has been told
// their Tuesday is open when it is not. Every function here is LOUD: it reports
// what is wrong and refuses, and it never quietly repairs input into something
// the person did not ask for.
//
// The one thing it does normalise is ORDER, because two windows on one day are
// the same day whichever way round they are typed.
//
// These strings are ADMIN-facing, so they are professional plain language
// rather than the client copy gate. Nothing here is ever rendered to a client.

import { fmtHHMM, parseHHMM } from '@/lib/booking/time'
import type { IntakeQuestion } from '@/lib/booking/types'

export interface HoursWindow {
  start: string
  end: string
}

export const WEEKDAYS: Array<{ index: number; label: string; short: string }> = [
  { index: 0, label: 'Sunday', short: 'Sun' },
  { index: 1, label: 'Monday', short: 'Mon' },
  { index: 2, label: 'Tuesday', short: 'Tue' },
  { index: 3, label: 'Wednesday', short: 'Wed' },
  { index: 4, label: 'Thursday', short: 'Thu' },
  { index: 5, label: 'Friday', short: 'Fri' },
  { index: 6, label: 'Saturday', short: 'Sat' },
]

export type Validated<T> = { ok: true; value: T } | { ok: false; errors: string[] }

// ─── Windows ─────────────────────────────────────────────────────────────────

/**
 * Validate one day's time windows.
 *
 * An EMPTY array is valid and means closed. That is the same thing a missing
 * row means, and the store turns one into the other, so there is exactly one
 * representation of a closed day in the database.
 */
export function validateWindows(raw: unknown): Validated<HoursWindow[]> {
  if (!Array.isArray(raw)) return { ok: false, errors: ['Hours must be a list of time windows.'] }
  const errors: string[] = []
  const parsed: Array<{ start: number; end: number }> = []

  raw.forEach((w, i) => {
    const label = `Window ${i + 1}`
    const startRaw = (w as HoursWindow)?.start
    const endRaw = (w as HoursWindow)?.end
    const start = parseHHMM(startRaw)
    const end = parseHHMM(endRaw)
    if (start === null) {
      errors.push(`${label}: start time is not a valid 24 hour time.`)
      return
    }
    if (end === null) {
      errors.push(`${label}: end time is not a valid 24 hour time.`)
      return
    }
    if (end <= start) {
      errors.push(`${label}: the end time must be after the start time.`)
      return
    }
    parsed.push({ start, end })
  })

  if (errors.length > 0) return { ok: false, errors }

  // Sorted so two windows typed out of order still read as one day. Overlaps
  // are REFUSED rather than merged: merging would hand back a day the person
  // did not describe, and on a page about when the phone rings that matters.
  parsed.sort((a, b) => a.start - b.start)
  for (let i = 1; i < parsed.length; i += 1) {
    if (parsed[i].start < parsed[i - 1].end) {
      errors.push(
        `Windows ${fmtHHMM(parsed[i - 1].start)} to ${fmtHHMM(parsed[i - 1].end)} and ` +
          `${fmtHHMM(parsed[i].start)} to ${fmtHHMM(parsed[i].end)} overlap.`,
      )
      break
    }
  }
  if (errors.length > 0) return { ok: false, errors }

  return { ok: true, value: parsed.map(w => ({ start: fmtHHMM(w.start), end: fmtHHMM(w.end) })) }
}

// ─── Date overrides ──────────────────────────────────────────────────────────

export const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

export interface OverrideDraft {
  date: string
  closed: boolean
  windows: HoursWindow[]
  note: string | null
}

export function validateOverrideDraft(raw: unknown): Validated<OverrideDraft> {
  const d = (raw ?? {}) as Record<string, unknown>
  const errors: string[] = []

  const date = typeof d.date === 'string' ? d.date.trim() : ''
  if (!YMD_RE.test(date)) errors.push('Pick a date.')
  else if (Number.isNaN(Date.parse(`${date}T00:00:00Z`))) errors.push('That date does not exist.')

  const closed = d.closed !== false

  let windows: HoursWindow[] = []
  if (!closed) {
    const w = validateWindows(Array.isArray(d.windows) ? d.windows : [])
    if (!w.ok) errors.push(...w.errors)
    else if (w.value.length === 0) errors.push('An open day needs at least one time window.')
    else windows = w.value
  }

  const note = typeof d.note === 'string' ? d.note.trim().slice(0, 200) : ''

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: { date, closed, windows, note: note || null } }
}

// ─── Event types ─────────────────────────────────────────────────────────────

/**
 * The bounds, in ONE place. Migration 20260727160000 puts the same numbers in
 * column checks, so the database is the backstop and this is what the page
 * shows and refuses on. If a bound ever changes, both move together and the
 * test below fails until they do.
 */
export const EVENT_TYPE_BOUNDS = {
  durationMinutes: { min: 5, max: 480 },
  bufferBeforeMinutes: { min: 0, max: 240 },
  bufferAfterMinutes: { min: 0, max: 240 },
  minNoticeHours: { min: 0, max: 720 },
  maxAdvanceDays: { min: 1, max: 365 },
  maxPerDay: { min: 1, max: 50 },
  slotIncrementMinutes: { min: 5, max: 120 },
} as const

export type EventTypeNumericField = keyof typeof EVENT_TYPE_BOUNDS

export const EVENT_TYPE_FIELD_LABELS: Record<EventTypeNumericField, string> = {
  durationMinutes: 'Length',
  bufferBeforeMinutes: 'Buffer before',
  bufferAfterMinutes: 'Buffer after',
  minNoticeHours: 'Minimum notice',
  maxAdvanceDays: 'Book up to',
  maxPerDay: 'Maximum per day',
  slotIncrementMinutes: 'Slot increment',
}

export interface EventTypeDraft {
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
  active: boolean
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,48}$/

function validateIntakeQuestions(raw: unknown, errors: string[]): IntakeQuestion[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) {
    errors.push('Intake questions must be a list.')
    return []
  }
  const out: IntakeQuestion[] = []
  const seen = new Set<string>()
  raw.forEach((q, i) => {
    const label = `Question ${i + 1}`
    const r = (q ?? {}) as Record<string, unknown>
    const key = typeof r.key === 'string' ? r.key.trim() : ''
    const text = typeof r.label === 'string' ? r.label.trim() : ''
    if (!key) {
      errors.push(`${label}: needs a key.`)
      return
    }
    if (!/^[a-z0-9_]{1,40}$/.test(key)) {
      errors.push(`${label}: the key may use lower case letters, numbers, and underscores only.`)
      return
    }
    if (seen.has(key)) {
      errors.push(`${label}: the key "${key}" is used more than once.`)
      return
    }
    if (!text) {
      errors.push(`${label}: needs a label, which is the wording the client reads.`)
      return
    }
    const type = r.type === 'textarea' || r.type === 'select' ? r.type : 'text'
    const options = Array.isArray(r.options)
      ? r.options.filter((o): o is string => typeof o === 'string' && o.trim().length > 0).map(o => o.trim())
      : []
    if (type === 'select' && options.length === 0) {
      errors.push(`${label}: a choice question needs at least one option.`)
      return
    }
    seen.add(key)
    out.push({ key, label: text, type, required: r.required === true, options })
  })
  return out
}

export function validateEventTypeDraft(raw: unknown): Validated<EventTypeDraft> {
  const d = (raw ?? {}) as Record<string, unknown>
  const errors: string[] = []

  const slug = typeof d.slug === 'string' ? d.slug.trim().toLowerCase() : ''
  if (!SLUG_RE.test(slug)) errors.push('That meeting type could not be identified.')

  const name = typeof d.name === 'string' ? d.name.trim().slice(0, 120) : ''
  if (!name) errors.push('Name is required.')

  const description =
    typeof d.description === 'string' && d.description.trim() ? d.description.trim().slice(0, 2000) : null

  const nums = {} as Record<EventTypeNumericField, number>
  for (const field of Object.keys(EVENT_TYPE_BOUNDS) as EventTypeNumericField[]) {
    const bound = EVENT_TYPE_BOUNDS[field]
    const value = Number(d[field])
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      errors.push(`${EVENT_TYPE_FIELD_LABELS[field]} must be a whole number.`)
      continue
    }
    if (value < bound.min || value > bound.max) {
      errors.push(
        `${EVENT_TYPE_FIELD_LABELS[field]} must be between ${bound.min} and ${bound.max}.`,
      )
      continue
    }
    nums[field] = value
  }

  const intakeQuestions = validateIntakeQuestions(d.intakeQuestions, errors)

  // A CROSS-FIELD RULE the column checks cannot express: a slot increment
  // larger than the meeting itself offers times that cannot all be taken, and
  // an increment that does not divide the hour produces a ragged grid. The
  // first is refused; the second is allowed, because a 20 minute increment is
  // legitimate and this is not the place to have opinions.
  if (nums.slotIncrementMinutes && nums.durationMinutes && nums.slotIncrementMinutes > nums.durationMinutes) {
    errors.push('Slot increment cannot be longer than the meeting itself.')
  }

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    value: {
      slug,
      name,
      description,
      durationMinutes: nums.durationMinutes,
      bufferBeforeMinutes: nums.bufferBeforeMinutes,
      bufferAfterMinutes: nums.bufferAfterMinutes,
      minNoticeHours: nums.minNoticeHours,
      maxAdvanceDays: nums.maxAdvanceDays,
      maxPerDay: nums.maxPerDay,
      slotIncrementMinutes: nums.slotIncrementMinutes,
      intakeQuestions,
      active: d.active !== false,
    },
  }
}

// ─── Rendering helpers the page and its tests share ──────────────────────────

/** "9:00 AM to 5:00 PM" from a stored window. Admin-facing. */
export function windowLabel(w: HoursWindow): string {
  return `${clockLabel(w.start)} to ${clockLabel(w.end)}`
}

function clockLabel(hhmm: string): string {
  const mins = parseHHMM(hhmm)
  if (mins === null) return hhmm
  const h24 = Math.floor(mins / 60)
  const m = mins % 60
  const suffix = h24 >= 12 && h24 < 24 ? 'PM' : 'AM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

/** Total open minutes in a week, for the summary strip. */
export function weeklyOpenMinutes(hours: Array<{ weekday: number; windows: HoursWindow[] }>): number {
  let total = 0
  for (const day of hours) {
    for (const w of day.windows) {
      const start = parseHHMM(w.start)
      const end = parseHHMM(w.end)
      if (start === null || end === null || end <= start) continue
      total += end - start
    }
  }
  return total
}
