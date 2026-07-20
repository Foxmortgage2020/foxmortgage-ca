// Pure task-action helpers for the Today Tasks card write path. No I/O.
// Unit-tested in tests/tasks.test.ts.

export type TaskAction = 'complete' | 'reopen'

// The status a reopen restores to when the recorded prior is unknown. A safe,
// non-terminal Zoho Tasks picklist value.
export const TASK_DEFAULT_REOPEN_STATUS = 'Not Started'

export function isTaskAction(x: unknown): x is TaskAction {
  return x === 'complete' || x === 'reopen'
}

// Given the task's action events (most-recent-first), the status a reopen
// should restore = the prior status the most recent complete recorded. Falls
// back to a safe default when no complete was recorded or its prior is unknown,
// so a reopen never leaves the task in an invented terminal state.
export function reopenTargetFrom(
  events: { action: string; prevStatus: string | null }[],
): string {
  for (const e of events) {
    if (e.action === 'complete' && e.prevStatus) return e.prevStatus
  }
  return TASK_DEFAULT_REOPEN_STATUS
}
