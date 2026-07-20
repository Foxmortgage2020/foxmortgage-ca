// Practice-timezone date helpers and shared display formatters for the
// admin command center. All "today" math anchors to America/Toronto so a
// late-evening Vercel lambda in us-east never rolls the business day early.

import { ADMIN_TZ } from '@/config/targets'

// YYYY-MM-DD for "now" in the practice timezone (en-CA formats ISO-style).
export function torontoTodayYMD(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ADMIN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

// The Toronto calendar date as a UTC-midnight Date — the contract
// lib/pacing.ts expects for its pure day-of-year math.
export function torontoAsOfDate(now: Date = new Date()): Date {
  const [y, m, d] = torontoTodayYMD(now).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function ymdAddDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  t.setUTCDate(t.getUTCDate() + days)
  return t.toISOString().slice(0, 10)
}

export function hoursSince(iso: string, now: Date = new Date()): number {
  return (now.getTime() - new Date(iso).getTime()) / 3_600_000
}

// Whole days from today to a YYYY-MM-DD target (negative = past), computed at
// UTC midnight over the two calendar dates. The portal-wide replacement for
// the per-surface day-diff helpers scattered across the app (compliance's
// daysUntil, the deals-surface inline math). Callers pass todayYMD so the
// function stays pure and testable.
export function daysUntilYMD(targetYMD: string, todayYMD: string): number {
  const t = Date.parse(`${targetYMD}T00:00:00Z`)
  const n = Date.parse(`${todayYMD}T00:00:00Z`)
  if (Number.isNaN(t) || Number.isNaN(n)) return 0
  return Math.round((t - n) / 86_400_000)
}

// The urgency tone a relative date carries. NEVER maps to the decision (lime)
// token — that token is reserved for queued human decisions. Components map
// these to red/amber/green/gray.
export type RelativeTone = 'danger' | 'caution' | 'neutral' | 'success'

export interface RelativeDay {
  days: number
  tone: RelativeTone
  // Plain-words phrases. `label` is neutral ("today", "in 3 days", "5 days
  // ago"); `dueLabel` frames a deadline ("due today", "5 days overdue").
  label: string
  dueLabel: string
}

// A relative-date phrase plus its urgency tone, for portal-wide reuse (the
// Today tasks and closings chips today; any surface tomorrow). `soonDays` is
// the caution threshold: days < 0 → danger, 0..soonDays → caution, beyond →
// neutral. Never emits the lime/decision token.
export function relativeDay(targetYMD: string, todayYMD: string, soonDays = 7): RelativeDay {
  const days = daysUntilYMD(targetYMD, todayYMD)
  const tone: RelativeTone = days < 0 ? 'danger' : days <= soonDays ? 'caution' : 'neutral'
  const abs = Math.abs(days)
  let label: string
  let dueLabel: string
  if (days === 0) {
    label = 'today'
    dueLabel = 'due today'
  } else if (days === 1) {
    label = 'tomorrow'
    dueLabel = 'due tomorrow'
  } else if (days === -1) {
    label = 'yesterday'
    dueLabel = '1 day overdue'
  } else if (days > 1) {
    label = `in ${days} days`
    dueLabel = `due in ${days} days`
  } else {
    label = `${abs} days ago`
    dueLabel = `${abs} days overdue`
  }
  return { days, tone, label, dueLabel }
}

// Offset of the practice timezone at a given instant, in minutes (EDT -240,
// EST -300). Probed at noon UTC of the target day so the DST boundary
// itself cannot flip the probe.
function torontoOffsetMinutes(probe: Date): number {
  const part = new Intl.DateTimeFormat('en-US', {
    timeZone: ADMIN_TZ,
    timeZoneName: 'longOffset',
  })
    .formatToParts(probe)
    .find(p => p.type === 'timeZoneName')?.value
  const m = part?.match(/GMT([+-])(\d{2}):(\d{2})/)
  if (!m) return -300
  const sign = m[1] === '-' ? -1 : 1
  return sign * (Number(m[2]) * 60 + Number(m[3]))
}

// UTC instant of Toronto midnight for a YYYY-MM-DD — the audit viewer's
// date filters are day-bounded in practice time, not UTC.
export function torontoDayStartISO(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const offset = torontoOffsetMinutes(new Date(Date.UTC(y, m - 1, d, 12)))
  return new Date(Date.UTC(y, m - 1, d) - offset * 60_000).toISOString()
}

// Last instant of the Toronto day (start of the next day minus 1ms).
export function torontoDayEndISO(ymd: string): string {
  const start = new Date(torontoDayStartISO(ymd))
  return new Date(start.getTime() + 24 * 3_600_000 - 1).toISOString()
}

// "Jul 14" from a YYYY-MM-DD or ISO datetime. Date-only strings are parsed
// from their literal parts so they never shift a day across UTC boundaries.
export function fmtShortDate(value: string | null | undefined): string {
  if (!value) return ''
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return ''
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

// "Jul 9, 3:42 PM" in practice time, from an ISO datetime.
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('en-CA', {
    timeZone: ADMIN_TZ,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// "$1,234,568" — whole dollars.
export function fmtMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-CA')
}

// "$1.2M" / "$450K" / "$980".
export function fmtMoneyCompact(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`
  return `${sign}$${Math.round(abs)}`
}
