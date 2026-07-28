// Timezone math for the booking engine. PURE — no I/O, no ambient clock, every
// function takes what it needs. This is the only place a wall clock becomes an
// instant, so it is the only place a DST bug can live, and it is fully tested.
//
// WHY HAND-ROLLED: this repo vendors no date library (no date-fns, no luxon, no
// Temporal polyfill) and deliberately keeps it that way. lib/dates.ts already
// solves the single-timezone case for America/Toronto by probing the offset with
// Intl. This module generalises that to an arbitrary IANA zone, because a host
// row carries its own `timezone` and agent two may not sit in Toronto.
//
// THE CONVENTION, stated once: "minutes of day" is always minutes since LOCAL
// midnight in the named zone (0..1439, and a window may name 1440 for end-of-day).
// An "instant" is always a Date / ISO string in UTC. A "ymd" is always
// 'YYYY-MM-DD' naming a calendar date in the named zone.

export interface TimeWindow {
  start: string // 'HH:MM' local wall clock
  end: string // 'HH:MM' local wall clock
}

// ─── Zone primitives ─────────────────────────────────────────────────────────

interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

// The wall clock in `tz` at a given instant. hour12:false gives 00..23, but some
// engines emit '24' at midnight, so it is folded back to 0.
function zonedParts(instant: Date, tz: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(instant)
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? '0')
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  }
}

/**
 * Offset of `tz` at `instant`, in minutes east of UTC. Toronto is -300 in winter
 * and -240 in summer. Derived by formatting the instant in the zone and reading
 * the result back as if it were UTC — the difference IS the offset, which works
 * for every zone including half-hour and 45-minute ones.
 */
export function zoneOffsetMinutes(instant: Date, tz: string): number {
  const p = zonedParts(instant, tz)
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asIfUtc - instant.getTime()) / 60_000)
}

/**
 * The UTC instant of a local wall clock. Two-pass, which is what makes it
 * DST-correct: the first pass guesses the offset from the naive instant, the
 * second re-reads the offset at the corrected instant and re-applies it if the
 * guess straddled a transition.
 *
 * SPRING-FORWARD GAP: a wall clock that does not exist (02:30 on the spring
 * transition) resolves to a real, deterministic instant rather than throwing.
 * The availability engine never generates such a slot in practice, because
 * business hours do not span 2am, but the function stays total on purpose.
 *
 * FALL-BACK REPEAT: an ambiguous wall clock (01:30 twice) resolves to the FIRST
 * occurrence, which is the earlier instant. Deterministic and documented.
 */
export function wallClockToUtc(ymd: string, minutesOfDay: number, tz: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  const naive = Date.UTC(y, m - 1, d, 0, 0, 0) + minutesOfDay * 60_000
  const firstOffset = zoneOffsetMinutes(new Date(naive), tz)
  const firstPass = naive - firstOffset * 60_000
  const secondOffset = zoneOffsetMinutes(new Date(firstPass), tz)
  if (secondOffset === firstOffset) return new Date(firstPass)
  return new Date(naive - secondOffset * 60_000)
}

/** The calendar date in `tz` at `instant`, as 'YYYY-MM-DD'. */
export function zonedYMD(instant: Date, tz: string): string {
  const p = zonedParts(instant, tz)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** Minutes since local midnight in `tz` at `instant`. */
export function zonedMinutesOfDay(instant: Date, tz: string): number {
  const p = zonedParts(instant, tz)
  return p.hour * 60 + p.minute
}

// ─── Calendar-date helpers ───────────────────────────────────────────────────
// A calendar date's weekday and its neighbours do not depend on a timezone, so
// these are plain UTC arithmetic over the date parts.

/** 0 = Sunday .. 6 = Saturday, for a 'YYYY-MM-DD'. */
export function weekdayOfYMD(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** 'YYYY-MM-DD' shifted by whole days. */
export function addDaysYMD(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000)
  return next.toISOString().slice(0, 10)
}

/** Inclusive list of dates from `fromYMD`, `count` long. */
export function ymdSeries(fromYMD: string, count: number): string[] {
  const out: string[] = []
  for (let i = 0; i < count; i++) out.push(addDaysYMD(fromYMD, i))
  return out
}

/** Whole days from `fromYMD` to `toYMD` (negative if `toYMD` is earlier). */
export function daysBetweenYMD(fromYMD: string, toYMD: string): number {
  const [ay, am, ad] = fromYMD.split('-').map(Number)
  const [by, bm, bd] = toYMD.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

// ─── Wall-clock strings ──────────────────────────────────────────────────────

/**
 * 'HH:MM' to minutes of day. Returns null on anything malformed — the caller
 * decides what a bad stored window means, rather than silently getting 0 (which
 * would read as midnight and quietly open the whole night).
 */
export function parseHHMM(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h < 0 || h > 24 || min < 0 || min > 59) return null
  const total = h * 60 + min
  // 24:00 is a legitimate end-of-day marker; anything past it is not.
  if (total > 1440) return null
  return total
}

/** Minutes of day to 'HH:MM'. */
export function fmtHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * A stored windows array to validated minute ranges, dropping anything malformed
 * or inverted and merging overlaps. Sorted. A bad row can therefore never widen
 * availability — the worst it can do is remove itself.
 */
export function normalizeWindows(windows: unknown): Array<{ start: number; end: number }> {
  if (!Array.isArray(windows)) return []
  const parsed: Array<{ start: number; end: number }> = []
  for (const w of windows) {
    const start = parseHHMM((w as TimeWindow)?.start)
    const end = parseHHMM((w as TimeWindow)?.end)
    if (start === null || end === null) continue
    if (end <= start) continue
    parsed.push({ start, end })
  }
  parsed.sort((a, b) => a.start - b.start)
  const merged: Array<{ start: number; end: number }> = []
  for (const w of parsed) {
    const last = merged[merged.length - 1]
    if (last && w.start <= last.end) {
      last.end = Math.max(last.end, w.end)
    } else {
      merged.push({ ...w })
    }
  }
  return merged
}

// ─── Instants ────────────────────────────────────────────────────────────────

/** ISO-8601 UTC with a trailing Z, seconds precision. The wire format. */
export function toUtcIso(instant: Date): string {
  return `${instant.toISOString().slice(0, 19)}Z`
}

/** Milliseconds of an ISO instant, or null if unparseable. */
export function isoMs(iso: string): number | null {
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : null
}
