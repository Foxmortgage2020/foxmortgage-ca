// Current-vs-history for the calc stacks (B6.2 Task 5): one current per natural
// key, prior recomputes folded away, a superseded implausible value never beside
// the live one.

import { describe, it, expect } from 'vitest'
import { currentAndHistory } from '@/lib/calc-history'

interface Row {
  id: string
  key: string
  at: string
  value: number
}
const build = (rows: Row[]) => currentAndHistory(rows, r => r.key, r => r.at)

describe('currentAndHistory', () => {
  it('empty input yields no groups', () => {
    expect(build([])).toEqual([])
  })

  it('a superseded implausible recompute goes to history; the latest is current', () => {
    const groups = build([
      { id: 'bad', key: 'file', at: '2026-07-01T00:00:00Z', value: 99999999 },
      { id: 'good', key: 'file', at: '2026-07-06T00:00:00Z', value: 480000 },
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]!.current.id).toBe('good')
    expect(groups[0]!.history.map(r => r.id)).toEqual(['bad'])
  })

  it('distinct keys are parallel currents, not history (two borrowers)', () => {
    const groups = build([
      { id: 'a1', key: 'borrowerA', at: '2026-07-05T00:00:00Z', value: 80000 },
      { id: 'b1', key: 'borrowerB', at: '2026-07-05T00:00:00Z', value: 60000 },
    ])
    expect(groups).toHaveLength(2)
    expect(groups.every(g => g.history.length === 0)).toBe(true)
  })

  it('groups are ordered by their current, newest first', () => {
    const groups = build([
      { id: 'old', key: 'x', at: '2026-07-01T00:00:00Z', value: 1 },
      { id: 'new', key: 'y', at: '2026-07-09T00:00:00Z', value: 2 },
    ])
    expect(groups.map(g => g.key)).toEqual(['y', 'x'])
  })

  it('history within a group is newest-first', () => {
    const groups = build([
      { id: 'v1', key: 'k', at: '2026-07-01T00:00:00Z', value: 1 },
      { id: 'v2', key: 'k', at: '2026-07-02T00:00:00Z', value: 2 },
      { id: 'v3', key: 'k', at: '2026-07-03T00:00:00Z', value: 3 },
    ])
    expect(groups[0]!.current.id).toBe('v3')
    expect(groups[0]!.history.map(r => r.id)).toEqual(['v2', 'v1'])
  })
})
