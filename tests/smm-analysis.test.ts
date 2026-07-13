// The shared per-mortgage analysis (used by both the Opportunities board and
// the savings PDF route). Synthetic data. Proves it wires the parsed row to the
// approved book and produces the right bucket, and that the two callers get the
// identical result from one code path.

import { describe, expect, it } from 'vitest'
import { parseSmmRow } from '@/lib/smm'
import type { BookQuote } from '@/lib/smm-match'
import { analyzeMortgage } from '@/lib/smm-analysis'

const TODAY = '2026-07-12'

function row(over: Record<string, string>) {
  return parseSmmRow({
    'Household ID': 'H', 'File reference': 'F', 'First name': 'A', 'Last name': 'B', 'Client type': 'CLIENT',
    Email: 'a@b.com', Phone: '1', 'Property address': '1 St', 'Property type': 'detached', 'Property occupancy': 'owner_occupied',
    'Estimated home value': '$700,000.00', 'Mortgage amount': '$500,000.00', 'Mortgage outstanding balance': '$480,000.00',
    'Mortgage rate': '6.49%', 'Mortgage rate type': 'fixed', 'Mortgage closing date': '2024-02-07', 'Mortgage start date': '2024-02-07',
    'Mortgage maturity date': '2030-02-07', 'Mortgage amortization (months)': '300', 'Mortgage term (months)': '60',
    'Mortgage lender': 'MCAP', 'Mortgage insurance type': 'Insurable', 'Savings potential': '$800.00',
    'Payment relief (monthly)': '$400.00', 'Accessible equity': '$150,000.00', 'Purchasing power': '$100,000.00',
    ...over,
  })
}

const book: BookQuote[] = [
  { rate: 4.19, rateType: 'fixed', termMonths: 60, productClass: 'insurable', asOfDate: '2026-07-09', status: 'approved', lenderSlug: 'scotia', primeVariance: null, eligibilitySource: 'variant:(none)' },
  { rate: 4.09, rateType: 'fixed', termMonths: 60, productClass: 'conventional', asOfDate: '2026-07-09', status: 'approved', lenderSlug: 'mcap', primeVariance: null, eligibilitySource: 'variant:(none)' },
]

describe('analyzeMortgage (Part 1c transaction → product class)', () => {
  it('a far-maturity break is a REFINANCE priced against CONVENTIONAL, never the insured/insurable rate', () => {
    // Insurable client, maturity 2030 (far) → refinance → conventional only.
    const { analysis, productClass, transaction } = analyzeMortgage(row({}), book, TODAY)
    expect(transaction).toBe('refinance')
    expect(productClass).toBe('conventional')
    expect(analysis.comparable?.rate).toBe(4.09) // the conventional comparable, not insurable 4.19
    expect(analysis.requalification).toBe(true)
    expect(analysis.penaltyApplies).toBe(true)
  })

  it('a near-maturity file is a SWITCH: original class ports, no penalty, no requalification', () => {
    const { analysis, productClass, transaction } = analyzeMortgage(
      row({ 'Mortgage maturity date': '2026-09-15' }), // < 120 days out
      book,
      TODAY,
    )
    expect(transaction).toBe('switch')
    expect(productClass).toBe('insurable') // ported original class
    expect(analysis.comparable?.rate).toBe(4.19) // the insurable comparable
    expect(analysis.penalty).toBeNull()
    expect(analysis.requalification).toBe(false)
  })

  it('flags a high-rate refinance as act_now on the conventional comparable', () => {
    const { analysis } = analyzeMortgage(row({}), book, TODAY)
    expect(analysis.bucket).toBe('act_now')
    expect(analysis.netBenefit ?? 0).toBeGreaterThan(0)
    expect(analysis.monthlySaving ?? 0).toBeGreaterThan(0)
  })

  it('80% LTV cap hard-blocks a refinance and it is not act_now', () => {
    // balance 660k / value 700k = 94.3% LTV, a far maturity (refinance).
    const { analysis } = analyzeMortgage(
      row({ 'Mortgage outstanding balance': '$660,000.00', 'Estimated home value': '$700,000.00' }),
      book,
      TODAY,
    )
    expect(analysis.ltvBlocked).toBe(true)
    expect(analysis.bucket).toBe('insufficient')
    expect(analysis.blockReason).toContain('80% LTV')
  })

  it('a refinance with no home value is insufficient (LTV cannot be computed)', () => {
    const { analysis } = analyzeMortgage(row({ 'Estimated home value': '-' }), book, TODAY)
    expect(analysis.bucket).toBe('insufficient')
    expect(analysis.blockReason).toContain('LTV')
  })

  it('is insufficient when no eligible conventional comparable is approved', () => {
    // Only an insured quote in the book → a refinance (conventional) finds none.
    const insuredOnly: BookQuote[] = [
      { rate: 3.99, rateType: 'fixed', termMonths: 60, productClass: 'insured', asOfDate: '2026-07-09', status: 'approved', lenderSlug: 'scotia', primeVariance: null, eligibilitySource: 'variant:(none)' },
    ]
    const { analysis } = analyzeMortgage(row({}), insuredOnly, TODAY)
    expect(analysis.comparable).toBeNull()
    expect(analysis.bucket).toBe('insufficient')
  })

  it('never picks a garbage-negative floating variance as the comparable (data-error guard)', () => {
    const withBadVariance: BookQuote[] = [
      // A data-entry slip: variance -5.0 -> effective -0.55%. Must be discarded.
      { rate: null, rateType: 'adjustable', termMonths: 60, productClass: 'conventional', asOfDate: '2026-07-09', status: 'approved', lenderSlug: 'mcap', primeVariance: -5.0, eligibilitySource: 'variant:(none)' },
      { rate: 4.09, rateType: 'fixed', termMonths: 60, productClass: 'conventional', asOfDate: '2026-07-09', status: 'approved', lenderSlug: 'rfa', primeVariance: null, eligibilitySource: 'variant:(none)' },
    ]
    const { analysis } = analyzeMortgage(row({}), withBadVariance, TODAY)
    // The 4.09 fixed wins; the nonsense negative rate is never the comparable.
    expect(analysis.comparable?.rate).toBe(4.09)
    expect((analysis.newPayment ?? 0)).toBeGreaterThan(0) // never a negative payment
  })

  it('excludes a BC credit union and a physician rate from the comparable', () => {
    const withRestricted: BookQuote[] = [
      { rate: 3.2, rateType: 'fixed', termMonths: 60, productClass: 'conventional', asOfDate: '2026-07-09', status: 'approved', lenderSlug: 'kootenay', primeVariance: null, eligibilitySource: 'variant:(none)' }, // BC
      { rate: 3.4, rateType: 'fixed', termMonths: 60, productClass: 'conventional', asOfDate: '2026-07-09', status: 'approved', lenderSlug: 'scotia', primeVariance: null, borrowerRequirement: 'physician', clientCommitment: 'banking_bundle', eligibilitySource: 'variant:physician' }, // restricted (workbench columns)
      { rate: 4.09, rateType: 'fixed', termMonths: 60, productClass: 'conventional', asOfDate: '2026-07-09', status: 'approved', lenderSlug: 'mcap', primeVariance: null, eligibilitySource: 'variant:(none)' },
    ]
    const { analysis } = analyzeMortgage(row({}), withRestricted, TODAY)
    // Neither the 3.20 BC nor the 3.40 physician wins; the honest 4.09 does.
    expect(analysis.comparable?.rate).toBe(4.09)
  })
})
