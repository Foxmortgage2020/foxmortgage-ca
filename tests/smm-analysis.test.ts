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
  // The adjustable book (effective 4.45 - 0.50 = 3.95 at the prime mirror):
  // the like-for-like headline for an adjustable client, and the labelled
  // cross-family alternative for a fixed one.
  { rate: null, rateType: 'adjustable', termMonths: 60, productClass: 'conventional', asOfDate: '2026-07-09', status: 'approved', lenderSlug: 'first-national', primeVariance: -0.5, eligibilitySource: 'variant:(none)' },
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
    // Amount and start date keep the balance ON schedule (four months in) so
    // the reconciliation gate passes and the LTV block is what fires.
    const { analysis } = analyzeMortgage(
      row({
        'Mortgage amount': '$665,000.00',
        'Mortgage outstanding balance': '$660,000.00',
        'Estimated home value': '$700,000.00',
        'Mortgage start date': '2026-03-01',
        'Mortgage closing date': '2026-03-01',
      }),
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
    // Nor does the garbage variance sneak in as the cross-family alternative.
    expect(analysis.alternative).toBeNull()
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

// The stated current payment reconstructs the ORIGINAL schedule, never the
// current balance re-amortized over the original period. The two methods agree
// EXACTLY on an unseasoned mortgage (which is why the Reinders anchor alone
// could never catch the bug) and diverge once a mortgage is seasoned — so the
// golden set carries one of each, plus the reconciliation gate both ways.
// Analysis date for the golden sets; the seasoned file is 24 months in.
const ASOF = '2026-07-13'

// Seasoned: $500,000 at 5.50% fixed over 300 months, started 2024-07-01.
// The schedule pays $3,051.96 a month and after 24 payments the balance is
// $480,116.51 against the feed's $480,116.59 — eight cents, confirmed.
const seasoned = (over: Record<string, string> = {}) =>
  row({
    'Mortgage amount': '$500,000.00',
    'Mortgage outstanding balance': '$480,116.59',
    'Mortgage rate': '5.50%',
    'Mortgage rate type': 'fixed',
    'Mortgage start date': '2024-07-01',
    'Mortgage closing date': '2024-07-01',
    'Mortgage maturity date': '2029-07-01',
    'Mortgage amortization (months)': '300',
    ...over,
  })

describe('the stated current payment (seasoned golden set + reconciliation gate)', () => {
  it('a seasoned mortgage states the ORIGINAL-schedule payment, not the re-amortized balance', () => {
    const { analysis } = analyzeMortgage(seasoned(), book, ASOF)
    // The client's actual payment (±$0.01 per rounding policy 5.1).
    expect(analysis.currentPayment).toBeCloseTo(3051.96, 2)
    // The two methods DIVERGE here: re-amortizing the current balance over the
    // original 300 months gives $2,930.59 — $121.37 a month short of what
    // actually leaves the client's account. Assert the wrong figure is far away.
    expect(Math.abs((analysis.currentPayment ?? 0) - 2930.59)).toBeGreaterThan(100)
    expect(analysis.monthsElapsed).toBe(24)
    expect(analysis.remainingAmortizationMonths).toBe(276)
    expect(analysis.reconciliation?.ok).toBe(true)
    expect(analysis.reconciliation?.driftPct ?? 1).toBeLessThan(0.01)
    // The rate-isolated comparison prices the balance over the months LEFT.
    expect(analysis.newPayment).toBeGreaterThan(0)
    expect(analysis.bucket).not.toBe('review')
  })

  it('a corrupt feed balance trips the reconciliation gate and routes to review', () => {
    const { analysis } = analyzeMortgage(
      seasoned({ 'Mortgage outstanding balance': '$455,000.00' }),
      book,
      ASOF,
    )
    expect(analysis.bucket).toBe('review')
    expect(analysis.reconciliation?.ok).toBe(false)
    expect(analysis.reconciliation?.driftPct ?? 0).toBeGreaterThan(0.5)
    // No figure is stated on a file that does not reconcile.
    expect(analysis.currentPayment).toBeNull()
    expect(analysis.newPayment).toBeNull()
    expect(analysis.netBenefit).toBeNull()
    // Both figures and the drift are shown for the review call.
    expect(analysis.blockReason).toContain('$480,117')
    expect(analysis.blockReason).toContain('$455,000')
    expect(analysis.blockReason).toMatch(/% drift/)
  })

  it('an unseasoned Reinders-shaped file still returns the commitment anchor $3,357.46', () => {
    // BRXM-F053724 shape: $635,000 at prime-0.40 = 4.05% adjustable, 25-year
    // amortization, closed 2026-06-18 — zero months elapsed as of the analysis
    // date, so balance still equals the original amount and both methods agree.
    const { analysis } = analyzeMortgage(
      row({
        'Mortgage amount': '$635,000.00',
        'Mortgage outstanding balance': '$635,000.00',
        'Mortgage rate': '4.05%',
        'Mortgage rate type': 'adjustable',
        'Mortgage start date': '2026-06-18',
        'Mortgage closing date': '2026-06-18',
        'Mortgage maturity date': '2031-06-18',
        'Mortgage amortization (months)': '300',
        'Estimated home value': '$1,085,000.00',
      }),
      book,
      ASOF,
    )
    expect(analysis.currentPayment).toBeCloseTo(3357.46, 2) // the figure the FN commitment prints
    expect(analysis.monthsElapsed).toBe(0)
    expect(analysis.remainingAmortizationMonths).toBe(300)
    expect(analysis.reconciliation?.ok).toBe(true)
    // An adjustable client headlines the ADJUSTABLE book (like-for-like).
    expect(analysis.comparable?.rateType).toBe('adjustable')
    expect(analysis.comparable?.rate).toBe(3.95)
  })

  it('BOUNDARY: a start day past the analysis day counts 23 elapsed months, not 24', () => {
    // Started the 21st, analysed the 13th: the month has not completed. One
    // fewer modeled payment leaves the modeled balance ~$850 higher, still
    // inside the 0.5% band against this feed balance, so the file reconciles
    // and prices over 277 months, not 276.
    const { analysis } = analyzeMortgage(
      seasoned({ 'Mortgage start date': '2024-07-21', 'Mortgage closing date': '2024-07-21' }),
      book,
      ASOF, // 2026-07-13
    )
    expect(analysis.monthsElapsed).toBe(23)
    expect(analysis.remainingAmortizationMonths).toBe(277)
    expect(analysis.reconciliation?.ok).toBe(true)
  })

  it('the review card names the drift direction', () => {
    const { analysis } = analyzeMortgage(
      seasoned({ 'Mortgage outstanding balance': '$455,000.00' }),
      book,
      ASOF,
    )
    expect(analysis.bucket).toBe('review')
    expect(analysis.reconciliation?.direction).toBe('ahead')
    expect(analysis.blockReason).toContain('AHEAD')
  })

  it('a missing start date cannot be reconciled, so no payment is stated', () => {
    const { analysis } = analyzeMortgage(seasoned({ 'Mortgage start date': '-' }), book, ASOF)
    expect(analysis.bucket).toBe('insufficient')
    expect(analysis.currentPayment).toBeNull()
    expect(analysis.blockReason).toContain('start date')
  })
})

// Like-for-like rate family: the headline comparable is the client's own
// product. A cheaper cross-family rate is not savings, it is rate risk the
// client does not carry today — it rides as a labelled alternative and can
// only become the recommendation under Michael's explicit approval.
describe('like-for-like rate family (Task 6 acceptance)', () => {
  // The proving book: the like-for-like conventional fixed at 4.59 (sheet
  // 2026-06-30) and the cheaper conventional adjustable P-0.50 -> 3.95.
  const PROVING_BOOK: BookQuote[] = [
    { rate: 4.59, rateType: 'fixed', termMonths: 60, productClass: 'conventional', asOfDate: '2026-06-30', status: 'approved', lenderSlug: 'rfa', primeVariance: null, eligibilitySource: 'variant:(none)' },
    { rate: null, rateType: 'adjustable', termMonths: 60, productClass: 'conventional', asOfDate: '2026-07-09', status: 'approved', lenderSlug: 'first-national', primeVariance: -0.5, eligibilitySource: 'variant:(none)' },
  ]

  it('the seasoned fixed client headlines the FIXED at 4.59 with relief $244.12; the adjustable is a labelled alternative', () => {
    const { analysis } = analyzeMortgage(seasoned(), PROVING_BOOK, ASOF)
    // Headline: same family, never the cheaper floating.
    expect(analysis.comparable?.rateType).toBe('fixed')
    expect(analysis.comparable?.rate).toBe(4.59)
    expect(analysis.comparable?.asOf).toBe('2026-06-30')
    expect(analysis.monthlySaving).toBeCloseTo(244.12, 2)
    expect(analysis.newPayment).toBeCloseTo(2807.84, 2)
    expect(analysis.crossFamilyRecommended).toBe(false)
    expect(analysis.headlineRiskLine).toBeNull()
    // The alternative: clearly cross-family, priced at the same remaining
    // amortization, carrying its plain-language risk line.
    expect(analysis.alternative).not.toBeNull()
    expect(analysis.alternative?.crossFamily).toBe(true)
    expect(analysis.alternative?.comparable.rateType).toBe('adjustable')
    expect(analysis.alternative?.comparable.rate).toBe(3.95)
    expect(analysis.alternative?.monthlySaving).toBeCloseTo(409.84, 2)
    expect(analysis.alternative?.riskLine).toMatch(/adjustable/i)
    expect(analysis.alternative?.riskLine).toMatch(/prime/i)
    // The extra "relief" the floating shows is rate risk, about $64 per 0.25%
    // prime move on this balance — the risk line quantifies it.
    expect(analysis.alternative?.riskLine).toMatch(/\$6[0-9]/)
  })

  it('a fixed client NEVER gets a floating headline without the approval flag', () => {
    // Even with the adjustable 64bp cheaper, the headline stays fixed.
    const { analysis } = analyzeMortgage(seasoned(), PROVING_BOOK, ASOF)
    expect(analysis.comparable?.rateType).toBe('fixed')
    expect(analysis.crossFamilyRecommended).toBe(false)
  })

  it("Michael's explicit approval flips the headline and attaches the risk line to it", () => {
    const { analysis } = analyzeMortgage(seasoned(), PROVING_BOOK, ASOF, { crossFamilyApproved: true })
    expect(analysis.comparable?.rateType).toBe('adjustable')
    expect(analysis.crossFamilyRecommended).toBe(true)
    expect(analysis.headlineRiskLine).toMatch(/adjustable/i)
    // The steady like-for-like option stays visible beside it, unlabelled risk.
    expect(analysis.alternative?.comparable.rateType).toBe('fixed')
    expect(analysis.alternative?.crossFamily).toBe(false)
    expect(analysis.alternative?.riskLine).toBeNull()
  })

  it('adjustable and variable are never collapsed: a variable client does not headline an adjustable', () => {
    const { analysis } = analyzeMortgage(
      seasoned({ 'Mortgage rate type': 'variable' }),
      PROVING_BOOK,
      ASOF,
    )
    // No variable quote exists, so there is no headline — the adjustable is
    // NOT silently substituted; it can only ride as the labelled alternative
    // on a stated analysis, and a blocked one states nothing.
    expect(analysis.bucket).toBe('insufficient')
    expect(analysis.comparable).toBeNull()
    expect(analysis.crossFamilyRecommended).toBe(false)
  })

  it('a client with no same-family comparable is honest-insufficient, never silently cross-family', () => {
    const fixedOnly = PROVING_BOOK.filter(q => q.rateType === 'fixed')
    const { analysis } = analyzeMortgage(
      seasoned({ 'Mortgage rate type': 'adjustable' }),
      fixedOnly,
      ASOF,
    )
    expect(analysis.bucket).toBe('insufficient')
    expect(analysis.comparable).toBeNull()
  })
})
