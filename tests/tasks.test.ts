import { describe, it, expect } from 'vitest'
import { isTaskAction, reopenTargetFrom, TASK_DEFAULT_REOPEN_STATUS } from '@/lib/tasks'

describe('isTaskAction', () => {
  it('accepts only complete and reopen', () => {
    expect(isTaskAction('complete')).toBe(true)
    expect(isTaskAction('reopen')).toBe(true)
    expect(isTaskAction('delete')).toBe(false)
    expect(isTaskAction('')).toBe(false)
    expect(isTaskAction(undefined)).toBe(false)
    expect(isTaskAction(42)).toBe(false)
  })
})

describe('reopenTargetFrom', () => {
  it('restores the prior status the most recent complete recorded', () => {
    // most-recent-first ordering, as the store returns it
    const events = [
      { action: 'reopen', prevStatus: 'Completed' },
      { action: 'complete', prevStatus: 'In Progress' },
      { action: 'complete', prevStatus: 'Not Started' },
    ]
    expect(reopenTargetFrom(events)).toBe('In Progress')
  })
  it('falls back to the safe default when no complete is recorded', () => {
    expect(reopenTargetFrom([{ action: 'reopen', prevStatus: 'Completed' }])).toBe(
      TASK_DEFAULT_REOPEN_STATUS,
    )
    expect(reopenTargetFrom([])).toBe(TASK_DEFAULT_REOPEN_STATUS)
  })
  it('falls back when the complete recorded no prior status', () => {
    expect(reopenTargetFrom([{ action: 'complete', prevStatus: null }])).toBe(
      TASK_DEFAULT_REOPEN_STATUS,
    )
  })
})
