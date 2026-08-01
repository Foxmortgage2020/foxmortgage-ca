// The Today page's pure logic (A2, 2026-08-01). No fetching, no React, no
// clock — every function here takes what it needs and is unit-tested in
// tests/today-tasks.test.ts.
//
// The load-bearing rules this module encodes, all from the A1 contract
// (fox-underwriting docs/gates-api.md, "The native task system"):
//
//   1. A COUNT IS THE TRUE BUCKET SIZE; the array may be shorter. A1 shipped
//      and fixed the opposite defect — counts computed after a 200-row cap,
//      so a 276-row overdue bucket reported "200". Every count rendered on
//      this page comes from `counts`, never from `rows.length`, and
//      `bucketShortfall` is how a bucket says how many it is not showing.
//   2. `as_of` and `due_this_week_through` are the SERVER'S dates, resolved
//      in America/Toronto. Nothing here reads a clock; the relative-day copy
//      is computed against the passed as_of.
//   3. "This week" is a ROLLING SEVEN DAYS. `weekWindowLabel` renders the
//      window's real end date so nobody infers a Sunday boundary that is not
//      there.

import type { TaskBucket, TaskRow } from '@/lib/gates'

// ─── Bucket presentation ────────────────────────────────────────────────────

export const BUCKET_ORDER: readonly TaskBucket[] = [
  'overdue',
  'due_today',
  'due_this_week',
  'no_date',
]

export const BUCKET_LABELS: Record<TaskBucket, string> = {
  overdue: 'Overdue',
  due_today: 'Due today',
  due_this_week: 'Due this week',
  no_date: 'No date',
}

/** The server's own per-bucket ceiling (fox-underwriting BUCKET_LIMIT). Named
 * here so the paging affordance can say what the cap actually was. */
export const SERVER_BUCKET_LIMIT = 200

/** Rows per request when paging the overdue bucket past that ceiling. Small
 * enough to stay fast on a phone, large enough that the 76-row remainder of a
 * 276-row bucket arrives in one tap. Lives here rather than in the route
 * because a Next.js route file may only export route fields. */
export const OVERDUE_PAGE_ROWS = 100

/** How many rows a bucket is NOT showing. Zero when the array is whole — a
 * bucket at exactly its count has nothing hidden even if it sits at the cap. */
export function bucketShortfall(count: number, shown: number): number {
  return Math.max(0, count - shown)
}

/** Whether the page must offer a way past what arrived. `truncated` from the
 * response is the server's own statement and is trusted first; the count/rows
 * comparison is the belt-and-braces arm, so a bucket the server forgot to name
 * still gets its affordance. */
export function needsMore(
  bucket: TaskBucket,
  counts: Record<TaskBucket, number>,
  shown: number,
  truncated: readonly TaskBucket[],
): boolean {
  return truncated.includes(bucket) || bucketShortfall(counts[bucket] ?? 0, shown) > 0
}

// ─── Dates ──────────────────────────────────────────────────────────────────

/** YYYY-MM-DD arithmetic that never rolls into a neighbouring day (noon UTC
 * anchor), mirroring fox-underwriting's addDays so defer presets agree with
 * the bucketing that will judge them. */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Plain-language day for a due date, RELATIVE TO THE SERVER'S as_of — never
 * to the browser's clock. Returns null for a task with no date. */
export function dueLabel(dueDate: string | null, asOf: string): string | null {
  if (!dueDate) return null
  if (dueDate === asOf) return 'today'
  if (dueDate === addDays(asOf, 1)) return 'tomorrow'
  if (dueDate === addDays(asOf, -1)) return 'yesterday'
  const days = daysBetween(asOf, dueDate)
  if (days < 0) return `${Math.abs(days)} days ago`
  return `in ${days} days`
}

/** Whole days from `a` to `b`, both YYYY-MM-DD. Negative when b is earlier. */
export function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)
  return Math.round(ms / 86_400_000)
}

/** How far overdue, for the age chip. Null when the task is not overdue. */
export function overdueDays(dueDate: string | null, asOf: string): number | null {
  if (!dueDate) return null
  const days = daysBetween(asOf, dueDate)
  return days < 0 ? Math.abs(days) : null
}

/** Renders the rolling window honestly: its real last day, not "this week". */
export function weekWindowLabel(asOf: string, through: string): string {
  const fmt = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(Number)
    return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).toLocaleDateString('en-CA', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    })
  }
  return `${fmt(addDays(asOf, 1))} to ${fmt(through)}`
}

/** The defer presets, all derived from the server's as_of. */
export function deferPresets(asOf: string): { label: string; date: string }[] {
  return [
    { label: 'Tomorrow', date: addDays(asOf, 1) },
    { label: 'In 3 days', date: addDays(asOf, 3) },
    { label: 'Next week', date: addDays(asOf, 7) },
  ]
}

// ─── Input validation (mirrored from the server's zod bodies) ───────────────
// Mirrored so garbage never burns a token round trip; the server is still the
// enforcement — these are not a substitute for it.

export const DISMISS_REASON_MIN = 3

export function isValidDueDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  // Reject a well-shaped impossible date (2026-02-31): round-tripping through
  // Date normalizes it, so a mismatch means the input was not a real day.
  const d = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

export function isValidDismissReason(value: string): boolean {
  return value.trim().length >= DISMISS_REASON_MIN
}

export function isValidTitle(value: string): boolean {
  return value.trim().length > 0
}

// ─── Bulk triage ────────────────────────────────────────────────────────────
// 276 overdue rows means one-at-a-time is unusable on day one. The bulk verbs
// call the EXISTING per-task endpoints in sequence — no bulk endpoint was
// invented, so every row still gets its own audit entry with Michael's
// identity on it, which is the whole point of guardrail 19.

export type BulkOutcome =
  | { taskId: string; ok: true }
  // `alreadyDone` is 409 — the contract's already-decided, not a failure.
  // Reporting it as an error would teach Michael to distrust the counts.
  | { taskId: string; ok: false; alreadyDone: boolean; message: string }

export interface BulkSummary {
  total: number
  succeeded: number
  alreadyDone: number
  failed: number
  failures: { taskId: string; message: string }[]
}

/** Honest partial-failure reporting: never assume success, never collapse a
 * mixed run into one word. */
export function summarizeBulk(outcomes: readonly BulkOutcome[]): BulkSummary {
  const summary: BulkSummary = {
    total: outcomes.length,
    succeeded: 0,
    alreadyDone: 0,
    failed: 0,
    failures: [],
  }
  for (const o of outcomes) {
    if (o.ok) summary.succeeded++
    else if (o.alreadyDone) summary.alreadyDone++
    else {
      summary.failed++
      summary.failures.push({ taskId: o.taskId, message: o.message })
    }
  }
  return summary
}

/** The sentence shown after a bulk run. States every non-zero outcome; a run
 * with any failure says so first, because that is the part that needs acting
 * on. */
export function bulkSummaryLine(summary: BulkSummary, verb: 'completed' | 'dismissed'): string {
  if (summary.total === 0) return 'Nothing was selected.'
  const parts: string[] = []
  if (summary.failed > 0) {
    parts.push(`${summary.failed} could not be ${verb}`)
  }
  if (summary.succeeded > 0) parts.push(`${summary.succeeded} ${verb}`)
  if (summary.alreadyDone > 0) parts.push(`${summary.alreadyDone} already done`)
  if (parts.length === 0) return `Nothing was ${verb}.`
  return `${parts.join(', ')}.`
}

// ─── Row helpers ────────────────────────────────────────────────────────────

/** The deal room a linked task points at, when it points at one. Zoho ids are
 * kept verbatim on the row; the portal resolves the room by file ref
 * elsewhere, so this only reports what the link says. */
export function linkedDealZohoId(task: TaskRow): string | null {
  return task.linked_module === 'Deals' && task.linked_zoho_id ? task.linked_zoho_id : null
}

/** `[AI]`-prefixed tasks come from the call and email pipelines. Worth showing
 * as a chip: a machine wrote it, and A3 will repoint those writers. */
export function isMachineWritten(task: TaskRow): boolean {
  return task.created_by === 'system' || task.title.trimStart().startsWith('[AI]')
}

const PRIORITY_RANK: Record<string, number> = {
  highest: 0,
  high: 1,
  normal: 2,
  low: 3,
  lowest: 4,
}

/** Priority rank for display ordering. Unknown values (A1 found nine live rows
 * carrying Zoho's off-picklist "Medium", stored as `normal`) sort with normal
 * rather than being dropped or floated to an end. */
export function priorityRank(priority: string): number {
  return PRIORITY_RANK[priority] ?? PRIORITY_RANK.normal
}
