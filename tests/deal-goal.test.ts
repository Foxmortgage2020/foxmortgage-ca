// Header honesty: a deal-record type that conflicts with the Finmo goal shows the
// Finmo goal with a marker, never the record type as unqualified fact. A conflict
// requires BOTH sides to be KNOWN and DIFFERENT shapes.
import { describe, it, expect } from 'vitest'
import { dealGoalDisplay, dealShapeOf } from '@/lib/deal-goal'

describe('dealShapeOf', () => {
  it('maps the goal/type families', () => {
    expect(dealShapeOf('refinance')).toBe('refinance')
    expect(dealShapeOf('purchase')).toBe('purchase')
    expect(dealShapeOf('renewal')).toBe('renewal')
    expect(dealShapeOf('switch')).toBe('renewal')
    expect(dealShapeOf('equity take-out')).toBe('refinance')
    expect(dealShapeOf('construction')).toBe('other')
    expect(dealShapeOf(null)).toBe('other')
  })
})

describe('dealGoalDisplay', () => {
  it('F053107 case: record purchase vs Finmo refinance is a CONFLICT; primary label is the Finmo goal', () => {
    const g = dealGoalDisplay('purchase', 'refinance')
    expect(g.conflict).toBe(true)
    expect(g.primaryLabel).toBe('Refinance')
    expect(g.dealTypeLabel).toBe('Purchase')
    expect(g.goalLabel).toBe('Refinance')
  })

  it('matching shapes are NOT a conflict (primary = the record type)', () => {
    const g = dealGoalDisplay('refi', 'refinance')
    expect(g.conflict).toBe(false)
    expect(g.primaryLabel).toBe('Refi')
  })

  it('an UNKNOWN goal is not a conflict (never flag on ambiguity)', () => {
    expect(dealGoalDisplay('purchase', 'construction').conflict).toBe(false)
    expect(dealGoalDisplay('purchase', null).conflict).toBe(false)
    expect(dealGoalDisplay('purchase', '').conflict).toBe(false)
  })

  it('an unknown DEAL TYPE is not a conflict either', () => {
    expect(dealGoalDisplay('unknown', 'refinance').conflict).toBe(false)
  })
})
