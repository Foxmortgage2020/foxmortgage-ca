import { describe, it, expect } from 'vitest'
import { daysUntilYMD, relativeDay } from '@/lib/dates'

const TODAY = '2026-07-20'

describe('daysUntilYMD', () => {
  it('counts whole days, negative in the past', () => {
    expect(daysUntilYMD('2026-07-20', TODAY)).toBe(0)
    expect(daysUntilYMD('2026-07-23', TODAY)).toBe(3)
    expect(daysUntilYMD('2026-07-15', TODAY)).toBe(-5)
    expect(daysUntilYMD('2026-08-19', TODAY)).toBe(30)
  })
  it('degrades to 0 on an unparseable input rather than NaN', () => {
    expect(daysUntilYMD('not-a-date', TODAY)).toBe(0)
    expect(daysUntilYMD('2026-07-20', 'garbage')).toBe(0)
  })
})

describe('relativeDay', () => {
  it('tints past dates danger and frames them as overdue', () => {
    const r = relativeDay('2026-07-15', TODAY)
    expect(r.days).toBe(-5)
    expect(r.tone).toBe('danger')
    expect(r.label).toBe('5 days ago')
    expect(r.dueLabel).toBe('5 days overdue')
  })
  it('handles the -1 day singular', () => {
    const r = relativeDay('2026-07-19', TODAY)
    expect(r.label).toBe('yesterday')
    expect(r.dueLabel).toBe('1 day overdue')
    expect(r.tone).toBe('danger')
  })
  it('tints today caution', () => {
    const r = relativeDay('2026-07-20', TODAY)
    expect(r.days).toBe(0)
    expect(r.tone).toBe('caution')
    expect(r.label).toBe('today')
    expect(r.dueLabel).toBe('due today')
  })
  it('handles tomorrow', () => {
    const r = relativeDay('2026-07-21', TODAY)
    expect(r.label).toBe('tomorrow')
    expect(r.dueLabel).toBe('due tomorrow')
    expect(r.tone).toBe('caution')
  })
  it('keeps dates inside the soon window caution', () => {
    const r = relativeDay('2026-07-25', TODAY) // 5 days, default soon=7
    expect(r.tone).toBe('caution')
    expect(r.label).toBe('in 5 days')
    expect(r.dueLabel).toBe('due in 5 days')
  })
  it('tints dates beyond the soon window neutral', () => {
    const r = relativeDay('2026-08-19', TODAY) // 30 days
    expect(r.tone).toBe('neutral')
    expect(r.label).toBe('in 30 days')
  })
  it('respects a custom soon threshold', () => {
    expect(relativeDay('2026-08-05', TODAY, 30).tone).toBe('caution') // 16 days, soon=30
    expect(relativeDay('2026-08-05', TODAY).tone).toBe('neutral') // default soon=7
  })
})
