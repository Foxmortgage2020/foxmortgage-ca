// Client constraints + cost-of-constraint tests. The cost engine is checked
// against a known case computed by the shared mortgage engine; the constraint
// model is checked for excluded/required/preferred precedence and the
// required-but-ineligible empty state.

import { describe, expect, it } from 'vitest'
import { monthlyPayment } from '@/lib/mortgage-engine'
import { computeCostOfConstraint, costSentence } from '@/lib/constraint-cost'
import { applyConstraints, activeConstraints, type Constraint } from '@/lib/constraints'

const C = (over: Partial<Constraint>): Constraint => ({
  id: 'c1', clientKey: 'K', lenderSlug: 'scotia', lenderLabel: 'Scotiabank', type: 'excluded',
  reason: 'prior bad experience', actingEmail: 'm@x.com', createdAt: '2026-07-12T00:00:00Z',
  retiredAt: null, retiredBy: null, ...over,
})

describe('cost of a constraint (shared engine)', () => {
  it('computes the monthly and term delta against the cent-validated engine', () => {
    // 500,000 over 25 years: 3.74% best vs 4.19% constrained.
    const cost = computeCostOfConstraint(
      { rate: 3.74, lender: 'First National' },
      { rate: 4.19, lender: 'Scotiabank' },
      500_000, 25, 60,
    )!
    const uPay = monthlyPayment(500_000, 3.74, 'semi-annually', 300)
    const cPay = monthlyPayment(500_000, 4.19, 'semi-annually', 300)
    expect(cost.unconstrained.monthlyPayment).toBe(Math.round(uPay * 100) / 100)
    expect(cost.constrained.monthlyPayment).toBe(Math.round(cPay * 100) / 100)
    expect(cost.rateDeltaPct).toBeCloseTo(0.45, 2)
    expect(cost.monthlyDelta).toBeGreaterThan(0)
    expect(cost.termDelta).toBeCloseTo(cost.monthlyDelta * 60, 1)
  })

  it('the sentence names the cost plainly', () => {
    const cost = computeCostOfConstraint({ rate: 3.74, lender: 'First National' }, { rate: 4.19, lender: 'Scotiabank' }, 500_000, 25, 60)!
    const s = costSentence(cost)
    expect(s).toContain('Scotiabank')
    expect(s).toContain('4.19%')
    expect(s).toContain('3.74%')
    expect(s).toContain('a month')
  })

  it('a preference that costs nothing says so, never a negative "cost"', () => {
    const cost = computeCostOfConstraint({ rate: 4.19, lender: 'A' }, { rate: 4.09, lender: 'B' }, 500_000, 25, 60)!
    expect(cost.monthlyDelta).toBeLessThan(0)
    expect(costSentence(cost)).toContain('costs nothing')
  })

  it('returns null when it cannot price', () => {
    expect(computeCostOfConstraint({ rate: 4, lender: 'A' }, { rate: 4.2, lender: 'B' }, null, 25, 60)).toBeNull()
  })
})

describe('applyConstraints precedence', () => {
  const eligible = ['first-national', 'scotia', 'neo', 'rfa']

  it('excluded hides a lender with its reason', () => {
    const r = applyConstraints(eligible, [C({ lenderSlug: 'scotia', type: 'excluded', reason: 'declined previously' })])
    expect(r.visible).not.toContain('scotia')
    expect(r.excluded.find(e => e.slug === 'scotia')?.reason).toBe('declined previously')
  })

  it('required shows only the required lender(s); others are excluded', () => {
    const r = applyConstraints(eligible, [C({ lenderSlug: 'neo', type: 'required', reason: 'existing banking relationship' })])
    expect(r.visible).toEqual(['neo'])
    expect(r.required).toEqual(['neo'])
    expect(r.excluded.length).toBe(3)
  })

  it('preferred brings a lender to the front without excluding others', () => {
    const r = applyConstraints(eligible, [C({ lenderSlug: 'rfa', type: 'preferred', reason: 'client asked for them' })])
    expect(r.visible[0]).toBe('rfa')
    expect(r.visible).toContain('scotia')
    expect(r.preferred).toEqual(['rfa'])
  })

  it('a required lender that eligibility already removed yields the honest empty state', () => {
    // 'kootenay' is province-ineligible, so it is NOT in the eligible input.
    const r = applyConstraints(eligible, [C({ lenderSlug: 'kootenay', type: 'required', reason: 'client insists' })])
    expect(r.visible).toEqual([]) // nothing shown, not a wrong result
    expect(r.requiredButUnavailable.map(x => x.slug)).toEqual(['kootenay'])
  })

  it('retired constraints do not apply but are retained', () => {
    const all = [C({ id: 'r', lenderSlug: 'scotia', type: 'excluded', retiredAt: '2026-07-13T00:00:00Z' })]
    expect(activeConstraints(all)).toHaveLength(0)
    expect(applyConstraints(eligible, activeConstraints(all)).visible).toContain('scotia')
  })
})
