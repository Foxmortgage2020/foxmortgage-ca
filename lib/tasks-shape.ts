// The native task row shape (A2, 2026-08-01) — a LEAF module with no imports.
//
// It is separate from lib/gates.ts on purpose. Both the gates client (which
// reads the Today endpoint) and lib/underwriting.ts (which pages the overdue
// bucket past that endpoint's cap through portal_readonly) need this exact
// projection, and they must not drift. Putting it in gates.ts and importing
// that from underwriting.ts would work, but it would pull the whole gates
// client into the server import graph of the PUBLIC client-file page, which
// reaches lib/underwriting.ts through lib/client-file.ts. A leaf costs
// nothing and keeps that graph where it was.
//
// Contract: fox-underwriting src/tasks/types.ts (TASK_SELECT) and
// docs/gates-api.md, "The native task system".

export type TaskBucket = 'overdue' | 'due_today' | 'due_this_week' | 'no_date'
export const TASK_BUCKETS: readonly TaskBucket[] = [
  'overdue',
  'due_today',
  'due_this_week',
  'no_date',
]

export type TaskPriority = 'highest' | 'high' | 'normal' | 'low' | 'lowest'
export const TASK_PRIORITIES: readonly TaskPriority[] = [
  'highest',
  'high',
  'normal',
  'low',
  'lowest',
]

// The TASK_SELECT projection in fox-underwriting src/tasks/types.ts, verbatim.
// Also the column list lib/underwriting.ts selects when it pages the overdue
// bucket, so both read paths return the identical shape.
export const TASK_ROW_SELECT =
  'id,title,body,status,due_date,priority,source,zoho_task_id,zoho_status,' +
  'linked_module,linked_zoho_id,linked_native_id,completed_at,dismissed_at,' +
  'dismissed_reason,deferred_from,created_by,created_at,updated_at'

export interface TaskRow {
  id: string
  title: string
  body: string | null
  status: 'open' | 'completed' | 'dismissed'
  due_date: string | null
  priority: TaskPriority | string
  source: string
  zoho_task_id: string | null
  zoho_status: string | null
  linked_module: string | null
  linked_zoho_id: string | null
  linked_native_id: string | null
  completed_at: string | null
  dismissed_at: string | null
  dismissed_reason: string | null
  deferred_from: string | null
  created_by: 'system' | 'portal' | string
  created_at: string
  updated_at: string
}

export interface TasksTodayResponse {
  // Resolved in America/Toronto by the workbench. NEVER recompute this in the
  // browser: at 20:00 Toronto it is already tomorrow in UTC, so a browser
  // "today" marks every task due today as overdue for the last four hours of
  // every working day.
  as_of: string
  timezone: string
  // The rolling seven-day window's last day — NOT a calendar week. Render this
  // date; do not relabel the bucket "this week" and let a Sunday boundary be
  // inferred that is not there.
  due_this_week_through: string
  // TRUE bucket sizes, taken before the 200-row cap. The arrays may be shorter.
  counts: Record<TaskBucket, number> & { open_total: number }
  buckets: Record<TaskBucket, TaskRow[]>
  // Buckets whose ARRAY is capped. On the first live read this was ['overdue']
  // at 276 against 200 rows.
  truncated: TaskBucket[]
}

// Every write returns this shape. auditId is the append-only audit entry that
// records WHO did it — the identity record (guardrail 19); the row itself
// carries no completed_by/dismissed_by column by design.
export interface TaskWriteResponse {
  taskId: string
  action: string
  task: TaskRow
  auditId: string
}
