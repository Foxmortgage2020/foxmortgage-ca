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
  { rate: 4.19, rateType: 'fixed', termMonths: 60, productClass: 'insurable', asOfDate: '2026-07-09', status: 'approved', lenderSlug: 'scotia', primeVariance: null },
  { rate: 4.09, rateType: 'fixed', termMonths: 60, productClass: 'conventional', asOfDate: '2026-07-09', status: 'approved', lenderSlug: 'mcap', primeVariance: null },
]

describe('analyzeMortgage', () => {
  it('maps insurance type to product class and picks the class comparable', () => {
    const { analysis, productClass, classAssumed } = analyzeMortgage(row({}), book, TODAY)
    expect(productClass).toBe('insurable')
    expect(classAssumed).toBe(false)
    expect(analysis.comparable?.rate).toBe(4.19) // the insurable comparable, not the cheaper conventional one
  })

  it('flags a high-rate long-term mortgage as act_now', () => {
    const { analysis } = analyzeMortgage(row({}), book, TODAY)
    expect(analysis.bucket).toBe('act_now')
    expect(analysis.netBenefit ?? 0).toBeGreaterThan(0)
    expect(analysis.monthlySaving ?? 0).toBeGreaterThan(0)
  })

  it('is insufficient when the book is empty', () => {
    const { analysis } = analyzeMortgage(row({}), [], TODAY)
    expect(analysis.bucket).toBe('insufficient')
    expect(analysis.comparable).toBeNull()
  })

  it('does not manufacture a saving for a sub-market rate near maturity (wait)', () => {
    // A 3.49% mortgage with 3 months left: the comparable does not beat it, and
    // even if it did the penalty would dominate — must not be act_now.
    const { analysis } = analyzeMortgage(
      row({ 'Mortgage rate': '3.49%', 'Mortgage maturity date': '2026-10-01' }),
      book,
      TODAY,
    )
    expect(analysis.bucket).not.toBe('act_now')
  })
})
