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

// Like-for-like PAPER GRADE (Task 1): a mortgage prices against comparables
// in its own tier. Pricing a B or private file against A rates manufactures
// savings the client may not qualify for; graduation to better paper is a
// flag Michael assesses, never an automatic price.
describe('lender tiers (A/B/private, like-for-like by default)', () => {
  // rfa and first-national are tier a in the mirror; first-national-excalibur
  // is tier b. B lending books as b_side (the live vocabulary: every approved
  // B-tier quote is class b_side). No private quotes exist in the book (nor live).
  const TIER_BOOK: BookQuote[] = [
    { rate: 4.59, rateType: 'fixed', termMonths: 60, productClass: 'conventional', asOfDate: '2026-06-30', status: 'approved', lenderSlug: 'rfa', primeVariance: null, eligibilitySource: 'variant:(none)' },
    { rate: null, rateType: 'adjustable', termMonths: 60, productClass: 'conventional', asOfDate: '2026-07-09', status: 'approved', lenderSlug: 'first-national', primeVariance: -0.5, eligibilitySource: 'variant:(none)' },
    { rate: 6.19, rateType: 'fixed', termMonths: 60, productClass: 'b_side', asOfDate: '2026-07-02', status: 'approved', lenderSlug: 'first-national-excalibur', primeVariance: null, eligibilitySource: 'variant:(none)' },
  ]

  it('a Westboro-shaped private file NEVER receives an A-rate comparable: honest-insufficient with the graduation flag', () => {
    const { analysis } = analyzeMortgage(
      seasoned({
        'Mortgage lender': 'Westboro',
        'Mortgage rate': '9.99%',
        'Mortgage outstanding balance': '$489,690.03', // on schedule at 9.99%
      }),
      TIER_BOOK,
      ASOF,
    )
    expect(analysis.tier).toBe('private')
    expect(analysis.comparable).toBeNull() // no private comparable exists
    expect(analysis.bucket).toBe('insufficient')
    expect(analysis.currentPayment).toBeNull() // no figure stated
    // The graduation FLAG: rate + sheet date, no payment figures, Michael assesses.
    expect(analysis.graduation).not.toBeNull()
    expect(analysis.graduation?.toTier).toBe('a')
    expect(analysis.graduation?.comparable.rate).toBe(4.59)
    expect(analysis.graduation?.note).toContain('Michael assesses')
    expect(analysis.graduationRecommended).toBe(false)
  })

  it('an Excalibur-shaped B file prices against B only, never the cheaper A rate', () => {
    const { analysis } = analyzeMortgage(
      seasoned({
        'Mortgage lender': 'First National - Excalibur',
        'Mortgage rate': '6.49%',
        'Mortgage outstanding balance': '$482,694.89', // on schedule at 6.49%
      }),
      TIER_BOOK,
      ASOF,
    )
    expect(analysis.tier).toBe('b')
    expect(analysis.comparable?.rate).toBe(6.19) // the B quote, not the 4.59 A
    expect(analysis.comparable?.lenderSlug).toBe('first-national-excalibur')
    // The A rate shows only as the graduation flag.
    expect(analysis.graduation?.toTier).toBe('a')
    expect(analysis.graduation?.comparable.rate).toBe(4.59)
  })

  it("Michael's explicit approval prices the graduation tier and records it", () => {
    const { analysis } = analyzeMortgage(
      seasoned({
        'Mortgage lender': 'First National - Excalibur',
        'Mortgage rate': '6.49%',
        'Mortgage outstanding balance': '$482,694.89',
      }),
      TIER_BOOK,
      ASOF,
      { graduationApproved: true },
    )
    expect(analysis.comparable?.rate).toBe(4.59)
    expect(analysis.graduationRecommended).toBe(true)
    expect(analysis.graduation?.note).toContain('Michael approved')
  })

  it('an unmapped lender string is tier-unknown and routes to review, never act_now', () => {
    const { analysis } = analyzeMortgage(
      seasoned({ 'Mortgage lender': 'Some Unknown Lending Corp' }),
      TIER_BOOK,
      ASOF,
    )
    expect(analysis.tier).toBeNull()
    expect(analysis.bucket).toBe('review')
    expect(analysis.blockReason).toMatch(/tier/i)
    expect(analysis.currentPayment).toBeNull()
    expect(analysis.graduation).toBeNull()
  })

  it('a 9.5% contract rate on an A-mapped lender is a tier mismatch: review, never trusted', () => {
    const { analysis } = analyzeMortgage(
      seasoned({
        'Mortgage rate': '9.50%', // MCAP is mapped a; this rate does not fit A paper
        'Mortgage outstanding balance': '$488,889.14', // on schedule at 9.50%
      }),
      TIER_BOOK,
      ASOF,
    )
    expect(analysis.bucket).toBe('review')
    expect(analysis.blockReason).toMatch(/does not fit A-tier/)
  })

  it('the seasoned A-paper proving fixture is unchanged: 4.59% fixed, $244.12', () => {
    const { analysis } = analyzeMortgage(seasoned(), TIER_BOOK, ASOF)
    expect(analysis.tier).toBe('a')
    expect(analysis.comparable?.rate).toBe(4.59)
    expect(analysis.currentPayment).toBeCloseTo(3051.96, 2)
    expect(analysis.monthlySaving).toBeCloseTo(244.12, 2)
    expect(analysis.graduation).toBeNull() // A paper has nothing to graduate to
  })
})

// ─── Task 0a: the graduation comparable prices CONVENTIONAL only ─────────────
// A graduation is a NEW application on better paper: the current mortgage's
// insurance class never travels with it, so an insurable or insured quote can
// never serve as the graduation comparable — whatever the transaction window.
describe('graduation prices conventional only (Task 0a)', () => {
  // The leak Part 1 shipped: a near-maturity (switch) B file ports its feed
  // insurance class, and the graduation target inherited it — quoting the
  // insurable 4.29 an uninsurable move to new paper can never have.
  const GRAD_BOOK: BookQuote[] = [
    { rate: 4.29, rateType: 'fixed', termMonths: 60, productClass: 'insurable', asOfDate: '2026-07-09', status: 'approved', lenderSlug: 'scotia', primeVariance: null, eligibilitySource: 'variant:(none)' },
    { rate: 4.59, rateType: 'fixed', termMonths: 60, productClass: 'conventional', asOfDate: '2026-06-30', status: 'approved', lenderSlug: 'rfa', primeVariance: null, eligibilitySource: 'variant:(none)' },
    { rate: 6.19, rateType: 'fixed', termMonths: 60, productClass: 'b_side', asOfDate: '2026-07-02', status: 'approved', lenderSlug: 'first-national-excalibur', primeVariance: null, eligibilitySource: 'variant:(none)' },
  ]

  it('a switch-basis B file graduates on the conventional 4.59, never the insurable 4.29', () => {
    const { analysis, transaction } = analyzeMortgage(
      seasoned({
        'Mortgage lender': 'First National - Excalibur',
        'Mortgage rate': '6.49%',
        'Mortgage outstanding balance': '$482,694.89',
        'Mortgage maturity date': '2026-09-15', // inside the switch window
        'Mortgage insurance type': 'Insurable', // the ported class that leaked
      }),
      GRAD_BOOK,
      ASOF,
    )
    expect(transaction).toBe('switch')
    expect(analysis.comparable?.rate).toBe(6.19) // primary stays same-tier b_side
    expect(analysis.graduation?.toTier).toBe('a')
    expect(analysis.graduation?.comparable.rate).toBe(4.59)
    expect(analysis.graduation?.comparable.rate).not.toBe(4.29)
  })

  it('a refinance-basis B file with only insurable and insured A quotes gets NO graduation flag', () => {
    const noConventional = GRAD_BOOK.filter(q => q.productClass !== 'conventional').concat([
      { rate: 3.99, rateType: 'fixed', termMonths: 60, productClass: 'insured', asOfDate: '2026-07-09', status: 'approved', lenderSlug: 'mcap', primeVariance: null, eligibilitySource: 'variant:(none)' },
    ])
    const { analysis, transaction } = analyzeMortgage(
      seasoned({
        'Mortgage lender': 'First National - Excalibur',
        'Mortgage rate': '6.49%',
        'Mortgage outstanding balance': '$482,694.89',
      }),
      noConventional,
      ASOF,
    )
    expect(transaction).toBe('refinance')
    // No insurable or insured quote can ever be the graduation comparable.
    expect(analysis.graduation).toBeNull()
  })
})

// ─── Task 0b: the comparable's term covers the horizon, or the projection ────
// shortens to the term. A deliberately short-term play is a flagged strategy
// requiring Michael's approval — labelled, reasoned, logged — and it never
// drives an automatic act_now.
describe('term-consistent comparable and horizon (Task 0b)', () => {
  // Seasoned A refinance: 35 months left on the term (2029-07-01 from
  // 2026-07-13), so the comparison horizon is 35 months.
  const TERM_BOOK: BookQuote[] = [
    { rate: 4.19, rateType: 'fixed', termMonths: 12, productClass: 'conventional', asOfDate: '2026-07-02', status: 'approved', lenderSlug: 'mcap', primeVariance: null, eligibilitySource: 'variant:(none)' },
    { rate: 4.8, rateType: 'fixed', termMonths: 36, productClass: 'conventional', asOfDate: '2026-06-30', status: 'approved', lenderSlug: 'rfa', primeVariance: null, eligibilitySource: 'variant:(none)' },
    { rate: 5.04, rateType: 'fixed', termMonths: 60, productClass: 'conventional', asOfDate: '2026-06-30', status: 'approved', lenderSlug: 'merix', primeVariance: null, eligibilitySource: 'variant:(none)' },
  ]

  it('the default comparable is the best quote whose term COVERS the horizon, never the cheap short rate', () => {
    const { analysis } = analyzeMortgage(seasoned(), TERM_BOOK, ASOF)
    // 36 months covers the 35-month horizon and beats the 5-year 5.04; the
    // 1-year 4.19 must never headline a 35-month projection.
    expect(analysis.comparable?.rate).toBe(4.8)
    expect(analysis.comparable?.termMonths).toBe(36)
    expect(analysis.horizonMonths).toBe(35)
    // The cheaper 1-year rides as the flagged short-term play, unapplied.
    expect(analysis.shortTermStrategy).not.toBeNull()
    expect(analysis.shortTermStrategy?.applied).toBe(false)
    expect(analysis.shortTermStrategy?.termMonths).toBe(12)
    expect(analysis.shortTermStrategy?.comparable.rate).toBe(4.19)
    expect(analysis.shortTermRecommended).toBe(false)
  })

  it('with ONLY short-term quotes the projection never runs past the term; the flag appears instead', () => {
    const shortOnly = TERM_BOOK.filter(q => q.termMonths === 12)
    // Near maturity (switch): no penalty, so the 12-month saving would clear
    // the act_now band on its own math.
    const { analysis } = analyzeMortgage(
      seasoned({ 'Mortgage maturity date': '2026-09-15', 'Mortgage insurance type': 'Uninsurable' }),
      shortOnly,
      ASOF,
    )
    expect(analysis.comparable?.termMonths).toBe(12)
    // The client's like-for-like horizon is their own 60-month term; the
    // projection stops at the quote's 12-month term end.
    expect(analysis.horizonMonths).toBe(12)
    expect(analysis.shortTermStrategy?.applied).toBe(true)
    // The math clears the band, but a short-term play is never an automatic
    // act_now: it lands in marginal until Michael approves it.
    expect(analysis.netBenefit ?? 0).toBeGreaterThan(1500)
    expect(analysis.bucket).toBe('marginal')
  })

  it("Michael's approval permits act_now on the shortened horizon and records it", () => {
    const shortOnly = TERM_BOOK.filter(q => q.termMonths === 12)
    const { analysis } = analyzeMortgage(
      seasoned({ 'Mortgage maturity date': '2026-09-15', 'Mortgage insurance type': 'Uninsurable' }),
      shortOnly,
      ASOF,
      { shortTermApproved: true },
    )
    expect(analysis.horizonMonths).toBe(12)
    expect(analysis.bucket).toBe('act_now')
    expect(analysis.shortTermRecommended).toBe(true)
    expect(analysis.shortTermStrategy?.note).toContain('Michael approved')
  })

  it("Michael's approval flips a covering headline to the flagged short play", () => {
    const { analysis } = analyzeMortgage(seasoned(), TERM_BOOK, ASOF, { shortTermApproved: true })
    expect(analysis.comparable?.rate).toBe(4.19)
    expect(analysis.comparable?.termMonths).toBe(12)
    expect(analysis.horizonMonths).toBe(12)
    expect(analysis.shortTermRecommended).toBe(true)
    // The steady covering option stays visible beside it, same family.
    expect(analysis.alternative?.comparable.rate).toBe(4.8)
    expect(analysis.alternative?.crossFamily).toBe(false)
  })

  it('the seasoned proving fixture is unchanged when the covering book is the 5-year 4.59', () => {
    // Guard: the term policy must not move the anchor.
    const anchorBook: BookQuote[] = [
      { rate: 4.59, rateType: 'fixed', termMonths: 60, productClass: 'conventional', asOfDate: '2026-06-30', status: 'approved', lenderSlug: 'rfa', primeVariance: null, eligibilitySource: 'variant:(none)' },
    ]
    const { analysis } = analyzeMortgage(seasoned(), anchorBook, ASOF)
    expect(analysis.comparable?.rate).toBe(4.59)
    expect(analysis.horizonMonths).toBe(35)
    expect(analysis.currentPayment).toBeCloseTo(3051.96, 2)
    expect(analysis.monthlySaving).toBeCloseTo(244.12, 2)
    expect(analysis.shortTermStrategy).toBeNull()
  })
})
