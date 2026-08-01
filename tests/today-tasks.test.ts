// The Today page's pure logic (A2, 2026-08-01).
//
// The tests that matter most here pin the two defects the A1 contract warns
// about by name: a count computed after a cap (A1 shipped and fixed exactly
// that — "200 overdue" when the truth was 276), and a browser that recomputes
// "today" instead of using the server's Toronto-resolved as_of.

import { describe, expect, it } from 'vitest'
import {
  BUCKET_LABELS,
  BUCKET_ORDER,
  DISMISS_REASON_MIN,
  SERVER_BUCKET_LIMIT,
  addDays,
  bucketShortfall,
  bulkSummaryLine,
  daysBetween,
  deferPresets,
  dueLabel,
  isMachineWritten,
  isValidDismissReason,
  isValidDueDate,
  isValidTitle,
  linkedDealZohoId,
  needsMore,
  overdueDays,
  priorityRank,
  summarizeBulk,
  weekWindowLabel,
  type BulkOutcome,
} from '../lib/today-tasks'
import type { TaskBucket, TaskRow } from '../lib/gates'

const task = (over: Partial<TaskRow> = {}): TaskRow => ({
  id: 't1',
  title: 'Collect the T4',
  body: null,
  status: 'open',
  due_date: '2026-07-25',
  priority: 'normal',
  source: 'zoho_import',
  zoho_task_id: 'z1',
  zoho_status: 'Not Started',
  linked_module: 'Deals',
  linked_zoho_id: 'deal-1',
  linked_native_id: null,
  completed_at: null,
  dismissed_at: null,
  dismissed_reason: null,
  deferred_from: null,
  created_by: 'system',
  created_at: '2026-06-01T12:00:00Z',
  updated_at: '2026-06-01T12:00:00Z',
  ...over,
})

// ─── The A1 defect, pinned ──────────────────────────────────────────────────

describe('true counts vs. capped arrays', () => {
  it('a bucket capped at 200 against a count of 276 reports 76 missing', () => {
    // The exact live numbers from A1's first read.
    expect(bucketShortfall(276, SERVER_BUCKET_LIMIT)).toBe(76)
  })

  it('a whole bucket has nothing missing, even sitting exactly at the cap', () => {
    expect(bucketShortfall(200, 200)).toBe(0)
    expect(bucketShortfall(31, 31)).toBe(0)
  })

  it('never reports a negative shortfall when more rows arrived than counted', () => {
    expect(bucketShortfall(5, 9)).toBe(0)
  })

  it('needsMore trusts the server truncated list first', () => {
    const counts: Record<TaskBucket, number> = {
      overdue: 276,
      due_today: 31,
      due_this_week: 18,
      no_date: 49,
    }
    expect(needsMore('overdue', counts, 200, ['overdue'])).toBe(true)
    // Belt-and-braces: a bucket the server forgot to name still gets its
    // affordance when the count and the array disagree.
    expect(needsMore('no_date', counts, 40, [])).toBe(true)
    expect(needsMore('due_today', counts, 31, [])).toBe(false)
  })

  it('a fully loaded overdue bucket stops offering more', () => {
    const counts: Record<TaskBucket, number> = {
      overdue: 276,
      due_today: 0,
      due_this_week: 0,
      no_date: 0,
    }
    // truncated still names the bucket (it came from the capped read), but all
    // 276 rows are now loaded, so the shortfall arm closes the affordance.
    expect(bucketShortfall(276, 276)).toBe(0)
    expect(needsMore('overdue', counts, 276, ['overdue'])).toBe(true)
    // The page ANDs needsMore with a positive shortfall, which is what makes
    // the button disappear; assert that combination explicitly.
    expect(needsMore('overdue', counts, 276, ['overdue']) && bucketShortfall(276, 276) > 0).toBe(
      false,
    )
  })
})

// ─── Dates are the server's ─────────────────────────────────────────────────

describe('dates come from as_of, never from a clock', () => {
  it('addDays never rolls into a neighbouring day across a DST boundary', () => {
    // 2026-03-08 is the North American spring-forward Sunday.
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08')
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09')
    // And the autumn fall-back.
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('dueLabel is relative to as_of, not to the machine running the test', () => {
    const asOf = '2026-08-01'
    expect(dueLabel(asOf, asOf)).toBe('today')
    expect(dueLabel('2026-08-02', asOf)).toBe('tomorrow')
    expect(dueLabel('2026-07-31', asOf)).toBe('yesterday')
    expect(dueLabel('2026-07-25', asOf)).toBe('7 days ago')
    expect(dueLabel('2026-08-06', asOf)).toBe('in 5 days')
    expect(dueLabel(null, asOf)).toBeNull()
  })

  it('overdueDays is null for anything not in the past', () => {
    const asOf = '2026-08-01'
    expect(overdueDays('2026-07-25', asOf)).toBe(7)
    expect(overdueDays(asOf, asOf)).toBeNull()
    expect(overdueDays('2026-08-09', asOf)).toBeNull()
    expect(overdueDays(null, asOf)).toBeNull()
  })

  it('daysBetween is symmetric and signed', () => {
    expect(daysBetween('2026-08-01', '2026-08-08')).toBe(7)
    expect(daysBetween('2026-08-08', '2026-08-01')).toBe(-7)
    expect(daysBetween('2026-08-01', '2026-08-01')).toBe(0)
  })

  it('the week label renders the rolling window, not a calendar week', () => {
    // as_of Saturday 2026-08-01 -> the window runs to 08-08, a Saturday. A
    // calendar week would have collapsed to nothing here.
    const label = weekWindowLabel('2026-08-01', '2026-08-08')
    expect(label).toContain('Aug 2')
    expect(label).toContain('Aug 8')
  })

  it('defer presets derive from as_of', () => {
    expect(deferPresets('2026-08-01').map(p => p.date)).toEqual([
      '2026-08-02',
      '2026-08-04',
      '2026-08-08',
    ])
  })
})

// ─── Validation mirrors the server's zod bodies ─────────────────────────────

describe('input validation', () => {
  it('accepts real YYYY-MM-DD dates and rejects well-shaped impossible ones', () => {
    expect(isValidDueDate('2026-08-01')).toBe(true)
    expect(isValidDueDate('2026-02-28')).toBe(true)
    expect(isValidDueDate('2026-02-31')).toBe(false)
    expect(isValidDueDate('2026-13-01')).toBe(false)
    expect(isValidDueDate('01-08-2026')).toBe(false)
    expect(isValidDueDate('')).toBe(false)
    expect(isValidDueDate('2026-08-01T00:00:00Z')).toBe(false)
  })

  it('dismiss needs a real reason, not whitespace', () => {
    expect(DISMISS_REASON_MIN).toBe(3)
    expect(isValidDismissReason('dup')).toBe(true)
    expect(isValidDismissReason('  dup  ')).toBe(true)
    expect(isValidDismissReason('ab')).toBe(false)
    expect(isValidDismissReason('   ')).toBe(false)
    expect(isValidDismissReason('')).toBe(false)
  })

  it('a title cannot be whitespace', () => {
    expect(isValidTitle('Call the lender')).toBe(true)
    expect(isValidTitle('   ')).toBe(false)
  })
})

// ─── Bulk triage reports honestly ───────────────────────────────────────────

describe('bulk triage', () => {
  const ok = (id: string): BulkOutcome => ({ taskId: id, ok: true })
  const already = (id: string): BulkOutcome => ({
    taskId: id,
    ok: false,
    alreadyDone: true,
    message: 'Already decided.',
  })
  const failed = (id: string, message = 'Not found or not yours.'): BulkOutcome => ({
    taskId: id,
    ok: false,
    alreadyDone: false,
    message,
  })

  it('a clean run counts every success', () => {
    const s = summarizeBulk([ok('a'), ok('b'), ok('c')])
    expect(s).toEqual({ total: 3, succeeded: 3, alreadyDone: 0, failed: 0, failures: [] })
    expect(bulkSummaryLine(s, 'completed')).toBe('3 completed.')
  })

  it('409 counts as already-done, never as a failure', () => {
    const s = summarizeBulk([ok('a'), already('b')])
    expect(s.succeeded).toBe(1)
    expect(s.alreadyDone).toBe(1)
    expect(s.failed).toBe(0)
    expect(bulkSummaryLine(s, 'completed')).toBe('1 completed, 1 already done.')
  })

  it('a mixed run leads with the failures and names them', () => {
    const s = summarizeBulk([ok('a'), failed('b'), already('c'), failed('d', 'Session expired.')])
    expect(s).toMatchObject({ total: 4, succeeded: 1, alreadyDone: 1, failed: 2 })
    expect(s.failures).toEqual([
      { taskId: 'b', message: 'Not found or not yours.' },
      { taskId: 'd', message: 'Session expired.' },
    ])
    expect(bulkSummaryLine(s, 'completed')).toBe('2 could not be completed, 1 completed, 1 already done.')
  })

  it('a run where everything failed never reads as success', () => {
    const s = summarizeBulk([failed('a'), failed('b')])
    expect(s.succeeded).toBe(0)
    const line = bulkSummaryLine(s, 'dismissed')
    expect(line).toBe('2 could not be dismissed.')
    // And crucially never claims a count as dismissed ("2 dismissed").
    expect(line).not.toMatch(/\b\d+ dismissed\b/)
    expect(line.startsWith('2 could not be')).toBe(true)
  })

  it('an empty selection says so rather than claiming a clean run', () => {
    expect(bulkSummaryLine(summarizeBulk([]), 'completed')).toBe('Nothing was selected.')
  })
})

// ─── Row helpers ────────────────────────────────────────────────────────────

describe('row helpers', () => {
  it('reports a Deals link only when both halves are present', () => {
    expect(linkedDealZohoId(task())).toBe('deal-1')
    expect(linkedDealZohoId(task({ linked_zoho_id: null }))).toBeNull()
    expect(linkedDealZohoId(task({ linked_module: 'Contacts' }))).toBeNull()
  })

  it('flags machine-written tasks by actor or by the [AI] subject prefix', () => {
    expect(isMachineWritten(task({ created_by: 'system' }))).toBe(true)
    expect(isMachineWritten(task({ created_by: 'portal', title: '[AI] Follow up' }))).toBe(true)
    expect(isMachineWritten(task({ created_by: 'portal', title: 'Follow up' }))).toBe(false)
  })

  it('an off-picklist priority sorts with normal rather than being dropped', () => {
    // A1 found nine live rows carrying Zoho's undefined "Medium", stored as
    // normal; anything else unknown must not float to an end and mislead.
    expect(priorityRank('highest')).toBeLessThan(priorityRank('normal'))
    expect(priorityRank('lowest')).toBeGreaterThan(priorityRank('normal'))
    expect(priorityRank('medium')).toBe(priorityRank('normal'))
    expect(priorityRank('')).toBe(priorityRank('normal'))
  })

  it('every bucket has a label and the order is the contract’s', () => {
    expect(BUCKET_ORDER).toEqual(['overdue', 'due_today', 'due_this_week', 'no_date'])
    for (const b of BUCKET_ORDER) expect(BUCKET_LABELS[b].length).toBeGreaterThan(0)
  })
})
