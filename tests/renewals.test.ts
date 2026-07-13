// Renewal Radar model tests. Anchors to the live figures (2026-07-12): the
// nine 2026-matured lapsed files sum to $3,569,023.30 and the eight before-
// year-end files to $4,368,600; the payment shock computes from the validated
// engine with a stated 25-year amortization; the status actions only ever
// carry valid Zoho picklist values; Term_Years renders as months with the
// anomalies flagged.

import { describe, expect, it } from 'vitest'
import {
  bestApprovedFixed,
  bucketFor,
  bucketRenewals,
  daysToMaturity,
  isResolved,
  paymentShock,
  RENEWAL_ACTIONS,
  renewalBook,
  termAnomaly,
  termYearsLabel,
  type ApprovedFixedQuote,
  type RenewalDeal,
} from '@/lib/renewals'

const TODAY = '2026-07-12'
const VALID_STATUSES = new Set([
  'Attempted To Contact Once',
  'Attempted To Contact Twice',
  'Attempted To Contact Three Times',
  'Renewed Elsewhere',
  'No Longer Needs Mortgage',
  'Ready To Renew - Sent New Application',
])

function deal(over: Partial<RenewalDeal>): RenewalDeal {
  return {
    id: 'x',
    dealName: 'TEST',
    contactName: null,
    amount: 500_000,
    maturityDate: '2026-09-01',
    mortgageRate: null,
    rateType: 'Fixed',
    termYears: 60,
    amortizationYears: null,
    paymentAmount: null,
    renewalStatus: null,
    renewalInProgress: false,
    renewalOptedOut: false,
    lenderName: null,
    ...over,
  }
}

// The nine real 2026-matured lapsed files.
const LAPSED_2026: RenewalDeal[] = [
  ['2026-01-10', 500_000],
  ['2026-01-10', 85_000],
  ['2026-01-15', 120_000],
  ['2026-03-07', 685_000],
  ['2026-04-03', 600_000],
  ['2026-04-05', 91_523.3],
  ['2026-04-22', 450_000],
  ['2026-05-15', 357_500],
  ['2026-05-21', 680_000],
].map(([m, a], i) => deal({ id: `lap-${i}`, maturityDate: m as string, amount: a as number }))

// The eight real before-year-end (action window) files.
const ACTION: RenewalDeal[] = [
  ['2026-08-22', 800_000],
  ['2026-08-27', 410_000],
  ['2026-09-15', 738_000],
  ['2026-09-23', 60_000],
  ['2026-09-29', 624_800],
  ['2026-10-01', 267_500],
  ['2026-10-06', 833_300],
  ['2026-11-18', 635_000],
].map(([m, a], i) => deal({ id: `act-${i}`, maturityDate: m as string, amount: a as number }))

describe('bucketing', () => {
  it('places by days to maturity with the window edges at 130 and 150', () => {
    expect(bucketFor(deal({ maturityDate: '2025-01-01' }), TODAY)).toBe('lapsed')
    // 130 days from 2026-07-12 is 2026-11-19; 129 days is action, 131 is monitoring.
    expect(bucketFor(deal({ maturityDate: '2026-11-18' }), TODAY)).toBe('action')
    expect(bucketFor(deal({ maturityDate: '2026-11-20' }), TODAY)).toBe('monitoring')
    // 150 days is 2026-12-09.
    expect(bucketFor(deal({ maturityDate: '2026-12-09' }), TODAY)).toBe('monitoring')
    expect(bucketFor(deal({ maturityDate: '2026-12-10' }), TODAY)).toBe('watching')
  })

  it('resolves on a terminal status or opt-out regardless of maturity', () => {
    expect(bucketFor(deal({ maturityDate: '2025-01-01', renewalStatus: 'Renewed Elsewhere' }), TODAY)).toBe('resolved')
    expect(bucketFor(deal({ maturityDate: '2025-01-01', renewalOptedOut: true }), TODAY)).toBe('resolved')
    expect(isResolved(deal({ renewalStatus: 'No Longer Needs Mortgage' }))).toBe(true)
    // A non-terminal status (still being worked) is NOT resolved.
    expect(isResolved(deal({ renewalStatus: 'Attempted To Contact Once' }))).toBe(false)
  })

  it('reconciles the 2026 lapsed subtotal to $3,569,023.30 and sorts by amount desc', () => {
    const b = bucketRenewals(LAPSED_2026, TODAY)
    expect(b.lapsed.count).toBe(9)
    expect(b.lapsed.volume).toBeCloseTo(3_569_023.3, 2)
    const amounts = b.lapsed.deals.map(d => d.amount)
    expect(amounts).toEqual([...amounts].sort((a, z) => z - a))
    expect(amounts[0]).toBe(685_000)
  })

  it('reconciles the action window to $4,368,600 and sorts by maturity asc', () => {
    const b = bucketRenewals(ACTION, TODAY)
    expect(b.action.count).toBe(8)
    expect(b.action.volume).toBeCloseTo(4_368_600, 2)
    const dates = b.action.deals.map(d => d.maturityDate)
    expect(dates).toEqual([...dates].sort())
  })
})

describe('renewal book KPI', () => {
  it('splits under-management, maturing-next-12, and lapsed honestly', () => {
    const deals = [
      ...LAPSED_2026, // 9 matured
      ...ACTION, // 8 within 12 months
      deal({ id: 'far', maturityDate: '2030-01-01', amount: 1_000_000 }), // future, beyond 12m
      deal({ id: 'resolved', maturityDate: '2025-01-01', amount: 999_999, renewalStatus: 'Renewed Elsewhere' }),
    ]
    const book = renewalBook(deals, TODAY)
    // under management = not-yet-matured, not resolved = 8 action + 1 far
    expect(book.underManagement.count).toBe(9)
    expect(book.underManagement.volume).toBeCloseTo(4_368_600 + 1_000_000, 2)
    expect(book.maturingNext12.count).toBe(8)
    expect(book.maturingNext12.volume).toBeCloseTo(4_368_600, 2)
    // lapsed excludes the resolved one
    expect(book.lapsed.count).toBe(9)
    expect(book.lapsed.volume).toBeCloseTo(3_569_023.3, 2)
  })
})

describe('payment shock', () => {
  it('computes from the validated engine at a 25-year amortization (cent anchor)', () => {
    const s = paymentShock(deal({ amount: 500_000, mortgageRate: 5.0 }), { rate: 4.0, asOf: '2026-07-09', termMonths: 60 })
    // 500,000 @ 5.00 over 25yr semi-annual = 2908.02 (the shared engine anchor).
    expect(s.currentPayment).toBeCloseTo(2908.02, 2)
    expect(s.currentRateKnown).toBe(true)
    expect(s.newPayment!).toBeLessThan(s.currentPayment!)
    expect(s.monthlyDelta!).toBeCloseTo(s.newPayment! - s.currentPayment!, 6)
    expect(s.newRateAsOf).toBe('2026-07-09')
  })

  it('states honestly when the current rate is not on file', () => {
    const s = paymentShock(deal({ amount: 500_000, mortgageRate: null }), { rate: 4.0, asOf: '2026-07-09', termMonths: 60 })
    expect(s.currentRateKnown).toBe(false)
    expect(s.currentPayment).toBeNull()
    expect(s.monthlyDelta).toBeNull()
    expect(s.newRate).toBe(4.0)
  })

  it('has no new rate when the approved book is empty', () => {
    const s = paymentShock(deal({ amount: 500_000, mortgageRate: 5.0 }), null)
    expect(s.newRate).toBeNull()
    expect(s.newPayment).toBeNull()
    expect(s.monthlyDelta).toBeNull()
    expect(s.currentPayment).toBeCloseTo(2908.02, 2)
  })
})

describe('best approved fixed rate', () => {
  const q = (over: Partial<ApprovedFixedQuote>): ApprovedFixedQuote => ({
    rate: 4.5,
    rateType: 'fixed',
    termMonths: 60,
    asOfDate: '2026-07-09',
    status: 'approved',
    lenderSlug: 'scotia',
    // Classified-unrestricted: the workbench columns as the backfill writes
    // them for a plain row. A missing source fail-closes (asserted in
    // tests/eligibility.test.ts, the surface sweep).
    eligibilityUnknown: false,
    eligibilitySource: 'variant:(none)',
    ...over,
  })
  it('picks the lowest approved fixed 60-month rate, excluding test slugs, superseded, and dateless quotes', () => {
    const best = bestApprovedFixed([
      q({ rate: 4.5 }),
      q({ rate: 3.99, lenderSlug: 'mcap' }),
      q({ rate: 1.0, lenderSlug: 'test-portal' }), // excluded
      q({ rate: 3.5, status: 'superseded' }), // excluded
      q({ rate: 4.2, rateType: 'variable' }), // excluded (not fixed)
      q({ rate: 3.2, asOfDate: null }), // excluded — no sheet date, never the benchmark
    ])
    expect(best).toEqual({ rate: 3.99, asOf: '2026-07-09', termMonths: 60 })
  })
  it('falls back to the lowest fixed of any term when no 60-month exists', () => {
    const best = bestApprovedFixed([q({ rate: 5.1, termMonths: 36 }), q({ rate: 4.8, termMonths: 24 })])
    expect(best).toEqual({ rate: 4.8, asOf: '2026-07-09', termMonths: 24 })
  })
  it('returns null on an empty book', () => {
    expect(bestApprovedFixed([])).toBeNull()
  })
})

describe('status actions (enumerated, valid Zoho values only)', () => {
  it('every action writes only a real picklist value and/or the booleans', () => {
    for (const a of Object.values(RENEWAL_ACTIONS)) {
      const status = a.fields.Renewal_Status
      if (status !== undefined) expect(VALID_STATUSES.has(String(status))).toBe(true)
      for (const k of Object.keys(a.fields)) {
        expect(['Renewal_Status', 'Renewal_In_Progress', 'Renewal_Opted_Out']).toContain(k)
      }
    }
  })
  it('has no free-text or arbitrary-field escape', () => {
    // in_discussion writes only the boolean (no picklist term exists).
    expect(RENEWAL_ACTIONS.in_discussion.fields).toEqual({ Renewal_In_Progress: true })
  })
})

describe('Term_Years rendering and anomalies', () => {
  it('renders as months with the year equivalent', () => {
    expect(termYearsLabel(60)).toBe('60 months (5 yr)')
    expect(termYearsLabel(12)).toBe('12 months (1 yr)')
    expect(termYearsLabel(null)).toBe('term not on file')
  })
  it('flags the amortization-in-the-term-field and the year-count anomalies', () => {
    expect(termAnomaly(300)).toMatch(/amortization/)
    expect(termAnomaly(5)).toMatch(/year count/)
    expect(termAnomaly(60)).toBeNull()
  })
})

describe('daysToMaturity', () => {
  it('is a UTC day difference from a YMD string', () => {
    expect(daysToMaturity('2026-07-12', TODAY)).toBe(0)
    expect(daysToMaturity('2026-07-13', TODAY)).toBe(1)
    expect(daysToMaturity('2026-07-11', TODAY)).toBe(-1)
  })
})
