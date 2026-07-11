// Rates scenario model tests. The sparse-dimension rules are the point:
// explicit variant markers rule quotes in or out; absence can never rule a
// quote out and instead carries an assumed note (rendered as the tooltip).
// Session 6 adds the floating vocabulary: effective rates computed against
// the served prime and labeled with its as-of, per-lender overrides,
// deepest-discount ranking, the honest prime-unavailable state, cash back
// tiers as first-class rows that never headline, and promo offers gated on
// structured eligibility only.
//
// Payment anchors are independent figures, not engine output re-asserted:
// $650,000 at 3.75% over 30 years is the Zinger file's cross-validated
// $2,999.58 (Finmo, the workbench calc engine, and Zoho all print it), and
// $500,000 at 5.00% over 25 years is the standard Canadian semi-annual
// reference figure $2,908.02.

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SCENARIO,
  classifyVariant,
  fmtDiscount,
  fmtMoneyShort,
  knowledgeSlugForQuoteSlug,
  lenderResults,
  ltvPct,
  matchQuote,
  mechanismForLender,
  mechanismPending,
  offerFitsScenario,
  offerScenarioResult,
  primeForLender,
  quoteEffectiveRate,
  quoteRateDisplay,
  scenarioFromParams,
  scenarioMonthlyPayment,
  scenarioParamsFromDeal,
  scenarioToParams,
  summaryLine,
  type OfferShape,
  type RatesReference,
  type Scenario,
} from '@/lib/scenario'
import type { RateQuoteFullRow } from '@/lib/underwriting'

function quote(over: Partial<RateQuoteFullRow>): RateQuoteFullRow {
  return {
    id: 'q-1',
    intelItemId: 'intel-1',
    lenderSlug: 'mcap',
    productClass: 'insurable',
    variant: null,
    termMonths: 60,
    rate: 4.19,
    rateType: 'fixed',
    primeVariance: null,
    cashbackPct: null,
    programNotes: null,
    compBps: 100,
    asOfDate: '2026-06-25',
    expiryDate: null,
    sourcePage: 1,
    sourceSnippet: '5 yr 4.19',
    confidence: 92,
    status: 'approved',
    extractedBy: 'claude/rates-v1',
    createdAt: '2026-07-07T00:00:00Z',
    reviewedAt: '2026-07-13T00:00:00Z',
    approvedVia: 'sheet:rev-1',
    heldReason: null,
    ...over,
  }
}

function scenario(over: Partial<Scenario>): Scenario {
  return { ...DEFAULT_SCENARIO, amount: 928_000, propertyValue: 1_160_000, ...over }
}

// The July 2026 reference shape: prime 4.45 as of 2026-07-09 (CMLS,
// corroborated book-wide) with the one real override, Kootenay PLR 5.50.
const REF: RatesReference = {
  prime: { value: 4.45, as_of: '2026-07-09', source: 'CMLS sheet July 9, 2026' },
  lender_overrides: {
    kootenay: { value: 5.5, as_of: '2026-07-03', source: 'KSCU sheet July 3, 2026' },
  },
  floating_mechanisms: {
    convention: {
      adjustable: 'An ARM reprices the payment when prime moves.',
      variable: 'A VRM holds the payment while prime moves.',
      source: 'UNDERWRITING.md 1.3',
    },
    lenders: {
      scotia: {
        product_label: 'Flex Closed',
        rate_type: 'variable',
        payment_behaviour: 'payment_static',
        basis: 'printed_label_plus_convention',
        note: 'Scotia labels its floating products VRM.',
        source: 'Scotia sheet June 25, 2026',
        as_of: '2026-07-06',
      },
    },
  },
  quote_slug_coverage: {
    mapped: { fn: ['first-national'], kootenay: ['kootenay-savings'] },
    unmapped: ['rfa', 'strive'],
  },
}

describe('variant classification', () => {
  it('classifies every classified variant family in the July 2026 inventory', () => {
    expect(classifyVariant(null)).toEqual({ kind: 'none' })
    expect(classifyVariant('ltv<=65')).toEqual({ kind: 'ltv', min: 0, max: 65 })
    expect(classifyVariant('ltv75-80')).toEqual({ kind: 'ltv', min: 75, max: 80 })
    expect(classifyVariant('rental')).toEqual({ kind: 'rental', label: 'rental' })
    expect(classifyVariant('second-home-rental')).toEqual({ kind: 'rental', label: 'second-home-rental' })
    expect(classifyVariant('mortgage-plus')).toEqual({ kind: 'mortgage-plus', amortizationYears: null })
    expect(classifyVariant('mortgage-plus-30yr')).toEqual({ kind: 'mortgage-plus', amortizationYears: 30 })
    expect(classifyVariant('beacon-680+')).toEqual({ kind: 'other', raw: 'beacon-680+' })
    expect(classifyVariant('physician')).toEqual({ kind: 'other', raw: 'physician' })
  })
})

describe('LTV', () => {
  it('computes and rounds to two decimals; null until both inputs exist', () => {
    expect(ltvPct({ amount: 928_000, propertyValue: 1_160_000 })).toBe(80)
    expect(ltvPct({ amount: 500_000, propertyValue: 785_000 })).toBe(63.69)
    expect(ltvPct({ amount: null, propertyValue: 1_000_000 })).toBeNull()
    expect(ltvPct({ amount: 500_000, propertyValue: null })).toBeNull()
  })
})

describe('discount formatting', () => {
  it('prints the signed spread the way sheets read it', () => {
    expect(fmtDiscount(-1.05)).toBe('P−1.05')
    expect(fmtDiscount(-0.75)).toBe('P−0.75')
    expect(fmtDiscount(0.45)).toBe('P+0.45')
    expect(fmtDiscount(2.3)).toBe('P+2.30')
    expect(fmtDiscount(0)).toBe('P+0.00')
  })
})

describe('effective rates against the served prime (acceptance 1)', () => {
  const adj = quote({ rateType: 'adjustable', rate: null, primeVariance: -1.05 })

  it('computes prime + variance and carries the prime as-of label', () => {
    const d = quoteRateDisplay(adj, REF)
    expect(d).toEqual({
      kind: 'floating-computed',
      rateType: 'adjustable',
      discount: -1.05,
      effective: 3.4,
      primeValue: 4.45,
      primeAsOf: '2026-07-09',
      overridden: false,
    })
  })

  it('prices prime-plus spreads above prime', () => {
    const alt = quote({ rateType: 'variable', rate: null, primeVariance: 2.3, lenderSlug: 'home-trust' })
    expect(quoteEffectiveRate(alt, REF)).toBe(6.75)
  })

  it('honours the per-lender prime override, via the published slug mapping', () => {
    const k = quote({ rateType: 'adjustable', rate: null, primeVariance: -1.0, lenderSlug: 'kootenay-savings' })
    const d = quoteRateDisplay(k, REF)
    expect(d.kind).toBe('floating-computed')
    if (d.kind === 'floating-computed') {
      expect(d.effective).toBe(4.5)
      expect(d.primeValue).toBe(5.5)
      expect(d.primeAsOf).toBe('2026-07-03')
      expect(d.overridden).toBe(true)
    }
  })

  it('shows the printed rate directly when the sheet prints both (UnionLink)', () => {
    const u = quote({ rateType: 'variable', rate: 3.95, primeVariance: -0.5, lenderSlug: 'unionlink' })
    const d = quoteRateDisplay(u, REF)
    expect(d).toEqual({ kind: 'floating-printed', rateType: 'variable', discount: -0.5, rate: 3.95 })
    expect(quoteEffectiveRate(u, REF)).toBe(3.95)
  })

  it('renders the honest prime-unavailable state, never a stale or guessed rate', () => {
    const d = quoteRateDisplay(adj, null)
    expect(d).toEqual({ kind: 'floating-no-prime', rateType: 'adjustable', discount: -1.05 })
    expect(quoteEffectiveRate(adj, null)).toBeNull()
  })

  it('fixed rows are untouched by the reference', () => {
    expect(quoteRateDisplay(quote({}), null)).toEqual({ kind: 'fixed', rate: 4.19 })
    expect(quoteEffectiveRate(quote({}), REF)).toBe(4.19)
  })
})

describe('prime and mechanism lookups', () => {
  it('resolves quote slugs through the published coverage only', () => {
    expect(knowledgeSlugForQuoteSlug(REF, 'first-national')).toBe('fn')
    expect(knowledgeSlugForQuoteSlug(REF, 'rfa')).toBeNull()
    expect(primeForLender(REF, 'mcap')).toEqual({ value: 4.45, asOf: '2026-07-09', overridden: false })
    expect(primeForLender(null, 'mcap')).toBeNull()
  })

  it('finds the mechanism note and flags the pending-confirmation basis', () => {
    const note = mechanismForLender(REF, 'scotia')
    expect(note?.payment_behaviour).toBe('payment_static')
    expect(mechanismPending(note)).toBe(true)
    expect(mechanismForLender(REF, 'mcap')).toBeNull()
    expect(mechanismPending(null)).toBe(false)
  })
})

describe('matching: hard dimensions', () => {
  it('product class and term rule out with no assumptions', () => {
    expect(matchQuote(quote({ productClass: 'insured' }), scenario({}))).toBeNull()
    expect(matchQuote(quote({ termMonths: 36 }), scenario({ termMonths: 60 }))).toBeNull()
    expect(matchQuote(quote({}), scenario({ termMonths: null }))).not.toBeNull()
  })

  it('the three-way rate type filter is hard and never conflates the mechanisms (acceptance 2)', () => {
    const adj = quote({ rateType: 'adjustable', rate: null, primeVariance: -0.75 })
    const vrm = quote({ rateType: 'variable', rate: null, primeVariance: -0.75 })
    expect(matchQuote(adj, scenario({ rateType: 'adjustable' }))).not.toBeNull()
    expect(matchQuote(adj, scenario({ rateType: 'variable' }))).toBeNull()
    expect(matchQuote(vrm, scenario({ rateType: 'adjustable' }))).toBeNull()
    expect(matchQuote(quote({}), scenario({ rateType: 'adjustable' }))).toBeNull()
    expect(matchQuote(quote({}), scenario({ rateType: 'fixed' }))).not.toBeNull()
  })

  it('the cash back filter cuts on cashback_pct present or null', () => {
    const cb = quote({ cashbackPct: 3 })
    expect(matchQuote(cb, scenario({ cashback: 'only' }))).not.toBeNull()
    expect(matchQuote(cb, scenario({ cashback: 'none' }))).toBeNull()
    expect(matchQuote(quote({}), scenario({ cashback: 'only' }))).toBeNull()
    expect(matchQuote(quote({}), scenario({ cashback: 'none' }))).not.toBeNull()
  })

  it('superseded and test rows never match a scenario', () => {
    expect(matchQuote(quote({ status: 'superseded' }), scenario({}))).toBeNull()
    expect(matchQuote(quote({ lenderSlug: 'test-portal' }), scenario({}))).toBeNull()
  })
})

describe('matching: LTV bands', () => {
  it('an 80 percent scenario matches ltv75-80 and rules out the lower band', () => {
    expect(matchQuote(quote({ variant: 'ltv75-80' }), scenario({}))).not.toBeNull()
    expect(matchQuote(quote({ variant: 'ltv70-75' }), scenario({}))).toBeNull()
  })

  it('band edges are inclusive on the top: 65 exactly is ltv<=65, 65.01 is the next band', () => {
    const at65 = scenario({ amount: 650_000, propertyValue: 1_000_000 })
    expect(matchQuote(quote({ variant: 'ltv<=65' }), at65)).not.toBeNull()
    expect(matchQuote(quote({ variant: 'ltv65-70' }), at65)).toBeNull()
    const above = scenario({ amount: 650_100, propertyValue: 1_000_000 })
    expect(matchQuote(quote({ variant: 'ltv<=65' }), above)).toBeNull()
    expect(matchQuote(quote({ variant: 'ltv65-70' }), above)).not.toBeNull()
  })
})

describe('matching: sparse dimensions match all with the assumed note', () => {
  it('a quote with no LTV split still matches an LTV-set scenario, with the note', () => {
    const m = matchQuote(quote({ variant: null }), scenario({}))
    expect(m).not.toBeNull()
    expect(m!.assumed).toContain('No LTV split on this sheet; it prices all LTVs the same.')
  })

  it('an LTV-banded quote is not ruled out when the scenario has no amounts yet', () => {
    const m = matchQuote(quote({ variant: 'ltv75-80' }), scenario({ amount: null, propertyValue: null }))
    expect(m).not.toBeNull()
    expect(m!.assumed[0]).toContain('Enter amount and property value')
  })

  it('rental scenarios keep unmarked quotes with the confirm-with-lender note', () => {
    const m = matchQuote(quote({ variant: 'ltv75-80' }), scenario({ occupancy: 'rental' }))
    expect(m).not.toBeNull()
    expect(m!.assumed.some(a => a.includes('does not state rental pricing'))).toBe(true)
  })

  it('an unknown future variant is never silently excluded', () => {
    const m = matchQuote(quote({ variant: 'hybrid-heloc' }), scenario({}))
    expect(m).not.toBeNull()
    expect(m!.assumed[0]).toContain('not classified')
  })
})

describe('matching: explicit markers rule out', () => {
  it('rental-marked quotes are ruled out of owner-occupied scenarios and match rental ones', () => {
    expect(matchQuote(quote({ variant: 'rental' }), scenario({}))).toBeNull()
    const m = matchQuote(quote({ variant: 'rental' }), scenario({ occupancy: 'rental' }))
    expect(m).not.toBeNull()
    expect(m!.assumed).toEqual([])
  })

  it('Mortgage Plus amortization markers follow the scenario amortization', () => {
    expect(matchQuote(quote({ variant: 'mortgage-plus-30yr' }), scenario({ amortizationYears: 25 }))).toBeNull()
    expect(matchQuote(quote({ variant: 'mortgage-plus-30yr' }), scenario({ amortizationYears: 30 }))).not.toBeNull()
    expect(matchQuote(quote({ variant: 'mortgage-plus' }), scenario({ amortizationYears: 25 }))).not.toBeNull()
    expect(matchQuote(quote({ variant: 'mortgage-plus' }), scenario({ amortizationYears: 30 }))).not.toBeNull()
  })
})

describe('sorting and ranking (acceptance 2)', () => {
  const fixed419 = quote({ id: 'f1', lenderSlug: 'scotia', rate: 4.19 })
  const fixed434 = quote({ id: 'f2', lenderSlug: 'scotia', rate: 4.34 })
  const adjDeep = quote({ id: 'a1', lenderSlug: 'scotia', rateType: 'adjustable', rate: null, primeVariance: -1.05 })
  const adjShallow = quote({ id: 'a2', lenderSlug: 'scotia', rateType: 'adjustable', rate: null, primeVariance: -0.35 })
  const vrm = quote({ id: 'v1', lenderSlug: 'scotia', rateType: 'variable', rate: null, primeVariance: -0.8 })

  it('mixed results sort by effective rate against the served prime', () => {
    // effective: a1 = 3.40, v1 = 3.65, f1 = 4.19, f2 = 4.34, a2 = 4.10
    const rs = lenderResults([fixed419, fixed434, adjDeep, adjShallow, vrm], scenario({}), REF)
    expect(rs[0].matches.map(m => m.quote.id)).toEqual(['a1', 'v1', 'a2', 'f1', 'f2'])
  })

  it('floating-only results sort by deepest discount', () => {
    const rs = lenderResults([adjShallow, adjDeep], scenario({ rateType: 'adjustable' }), REF)
    expect(rs[0].matches.map(m => m.quote.id)).toEqual(['a1', 'a2'])
  })

  it('with prime unavailable, floating rows sort after priced rows, deepest discount first', () => {
    const rs = lenderResults([adjShallow, fixed419, adjDeep], scenario({}), null)
    expect(rs[0].matches.map(m => m.quote.id)).toEqual(['f1', 'a1', 'a2'])
  })

  it('lender ordering follows the best effective rate', () => {
    const mcapFixed = quote({ id: 'm1', lenderSlug: 'mcap', rate: 4.09 })
    const rs = lenderResults([fixed419, adjDeep, mcapFixed], scenario({}), REF)
    // scotia's ARM at 3.40 beats mcap's fixed 4.09
    expect(rs.map(r => r.lenderSlug)).toEqual(['scotia', 'mcap'])
  })

  it('a cash back tier never becomes the lender headline', () => {
    const cb = quote({ id: 'cb1', cashbackPct: 3, rate: 4.09 })
    const std = quote({ id: 's1', rate: 4.44 })
    const rs = lenderResults([cb, std], scenario({}), REF)
    // The cashback row sorts first (4.09 < 4.44) but the headline is the
    // standard row.
    expect(rs[0].matches[0].quote.id).toBe('cb1')
    expect(rs[0].headline).toEqual({ kind: 'fixed', rate: 4.44 })
    expect(rs[0].cashbackCount).toBe(1)
  })

  it('a lender with only cash back tiers has no headline rate at all', () => {
    const rs = lenderResults([quote({ id: 'cb1', cashbackPct: 5 })], scenario({}), REF)
    expect(rs[0].headline).toBeNull()
    expect(rs[0].cashbackCount).toBe(1)
  })
})

describe('payments reuse the validated calculator core', () => {
  it('matches the Zinger cross-validated figure to the cent', () => {
    const s = scenario({ amount: 650_000, amortizationYears: 30 })
    expect(scenarioMonthlyPayment(s, 3.75)).toBe(2999.58)
  })

  it('matches the standard Canadian semi-annual reference figure', () => {
    const s = scenario({ amount: 500_000, amortizationYears: 25 })
    expect(scenarioMonthlyPayment(s, 5.0)).toBe(2908.02)
  })

  it('returns null without an amount; a payment never renders from nothing', () => {
    expect(scenarioMonthlyPayment(scenario({ amount: null }), 4.19)).toBeNull()
  })
})

describe('summary line', () => {
  it('is self-describing and no longer assumes fixed', () => {
    const s = scenario({ purpose: 'transfer', termMonths: 36, amount: 1_160_000, propertyValue: 1_450_000 })
    expect(summaryLine(s)).toBe(
      'Transfer, owner occupied, $1.16M at 80% LTV, 3yr, any rate type, 25yr amortization, insurable',
    )
  })

  it('states the three-way filter and the cash back cut when set', () => {
    const s = scenario({ rateType: 'variable', cashback: 'none' })
    expect(summaryLine(s)).toContain('variable only')
    expect(summaryLine(s)).toContain('no cash back')
  })

  it('states any term honestly when no term is chosen', () => {
    expect(summaryLine(scenario({ termMonths: null }))).toContain('any term')
  })

  it('formats money short forms', () => {
    expect(fmtMoneyShort(1_160_000)).toBe('$1.16M')
    expect(fmtMoneyShort(850_000)).toBe('$850K')
  })
})

// The Scotia 60-day special exactly as the knowledge profile stores it
// (trimmed to the structured fields the matcher reads).
const SCOTIA_OFFER: OfferShape = {
  id: 'scotia-60day-3yr-special-2026',
  description:
    '60-Day Rate Special, 3-Year Fixed (effective June 25, 2026): purchase and switch only, owner-occupied tiers, Mortgage Plus mandatory, closing within 60 days of application.',
  started: '2026-06-25',
  expiry: '2026-08-24',
  predicates: ['Purpose purchase or switch ONLY', 'Owner-occupied only', 'Mortgage Plus mandatory'],
  eligibility: {
    purposes: ['purchase', 'switch'],
    occupancy: 'owner_occupied',
    closing_within_days: 60,
    amortization_years: [25, 30],
    required_product: 'Scotia Mortgage Plus',
    application_window_start: '2026-06-25',
  },
  offer_rates: [
    {
      label: 'owner-occupied',
      rate_pct: { value: 4.19 },
      comp_bps: { value: 50 },
      buydown_rate_pct: { value: 4.09 },
      buydown_max_bps: { value: 10 },
    },
    {
      label: 'default-insured',
      rate_pct: { value: 3.99 },
      comp_bps: { value: 50 },
      buydown_rate_pct: { value: 3.89 },
      buydown_max_bps: { value: 10 },
    },
  ],
}

describe('offer fit', () => {
  it('maps transfer to the offer vocabulary switch', () => {
    const elig = { purposes: ['purchase', 'switch'], occupancy: 'owner_occupied' }
    expect(offerFitsScenario(elig, scenario({ purpose: 'transfer' }))).toBe('fits')
    expect(offerFitsScenario(elig, scenario({ purpose: 'refinance' }))).toBe('ruled_out')
    expect(offerFitsScenario(elig, scenario({ purpose: 'transfer', occupancy: 'rental' }))).toBe('ruled_out')
  })

  it('offers without structured eligibility are unknown, never silently ruled out', () => {
    expect(offerFitsScenario(null, scenario({}))).toBe('unknown')
    expect(offerFitsScenario({}, scenario({}))).toBe('unknown')
  })

  it('gates on structured amortization where the offer states one', () => {
    const elig = { purposes: ['purchase'], occupancy: 'any', amortization_years: [25] }
    expect(offerFitsScenario(elig, scenario({ amortizationYears: 30 }))).toBe('ruled_out')
    expect(offerFitsScenario(elig, scenario({ amortizationYears: 25 }))).toBe('fits')
  })
})

describe('promo offers as first-class scenario results (acceptance 4)', () => {
  it('the Scotia special renders in a matching scenario with the owner-occupied tier', () => {
    const res = offerScenarioResult(SCOTIA_OFFER, scenario({ purpose: 'purchase' }))
    expect(res).not.toBeNull()
    expect(res!.ratePct).toBe(4.19)
    expect(res!.tierLabel).toBe('owner-occupied')
    expect(res!.compBps).toBe(50)
    expect(res!.buydownRatePct).toBe(4.09)
    expect(res!.requiredProduct).toBe('Scotia Mortgage Plus')
    expect(res!.closingWithinDays).toBe(60)
    expect(res!.started).toBe('2026-06-25')
  })

  it('an insured scenario selects the default-insured tier', () => {
    const res = offerScenarioResult(SCOTIA_OFFER, scenario({ purpose: 'transfer', productClass: 'insured' }))
    expect(res!.ratePct).toBe(3.99)
    expect(res!.tierLabel).toBe('default-insured')
  })

  it('never renders where the structured eligibility rules the scenario out', () => {
    expect(offerScenarioResult(SCOTIA_OFFER, scenario({ purpose: 'refinance' }))).toBeNull()
    expect(offerScenarioResult(SCOTIA_OFFER, scenario({ occupancy: 'rental' }))).toBeNull()
  })

  it('never renders from prose alone: no rate tiers means no result even when eligibility is unknown', () => {
    // No eligibility AND no tiers: nothing to price, so still no result.
    expect(offerScenarioResult({ description: 'a special exists', expiry: '2026-08-24' }, scenario({}))).toBeNull()
    // Eligibility present but no tiers: no result.
    expect(
      offerScenarioResult({ ...SCOTIA_OFFER, offer_rates: [] }, scenario({ purpose: 'purchase' })),
    ).toBeNull()
  })

  it('an offer with tiers but no extractable eligibility matches PERMISSIVELY with a caveat, never silently excluded', () => {
    const noElig = { ...SCOTIA_OFFER, eligibility: null }
    // refinance would be ruled out IF eligibility were extracted; with none, it
    // matches permissively rather than disappearing.
    const res = offerScenarioResult(noElig, scenario({ purpose: 'refinance' }))
    expect(res).not.toBeNull()
    expect(res!.permissive).toBe(true)
    expect(res!.caveat).toBeTruthy()
  })

  it('a fits match carries no permissive caveat', () => {
    const res = offerScenarioResult(SCOTIA_OFFER, scenario({ purpose: 'purchase' }))
    expect(res!.permissive).toBe(false)
    expect(res!.caveat).toBeNull()
  })

  it('the min-amount and class gates rule an offer out (never silently included)', () => {
    const elig = { purposes: ['purchase'], min_amount: 500_000, product_classes: ['insured'] }
    expect(
      offerFitsScenario(elig, scenario({ purpose: 'purchase', amount: 300_000, productClass: 'insured' })),
    ).toBe('ruled_out')
    expect(
      offerFitsScenario(elig, scenario({ purpose: 'purchase', amount: 600_000, productClass: 'conventional' })),
    ).toBe('ruled_out')
    expect(
      offerFitsScenario(elig, scenario({ purpose: 'purchase', amount: 600_000, productClass: 'insured' })),
    ).toBe('fits')
  })
})

describe('deal room prefill', () => {
  it('prefills only what the deal data supports and derives insured above 80 LTV', () => {
    const p = scenarioParamsFromDeal({
      fileRef: 'BRXM-F053725',
      dealType: 'purchase',
      mortgageAmount: 527_773,
      purchasePrice: 557_500,
    })
    expect(p.from).toBe('BRXM-F053725')
    expect(p.purpose).toBe('purchase')
    expect(p.amount).toBe('527773')
    expect(p.value).toBe('557500')
    expect(p.class).toBe('insured')
    const s = scenarioFromParams(p)
    expect(ltvPct(s)).toBe(94.67)
    expect(s.productClass).toBe('insured')
  })

  it('omits what is not recorded and never guesses a class at or under 80', () => {
    const p = scenarioParamsFromDeal({
      fileRef: 'BRXM-F053107',
      dealType: 'construction',
      mortgageAmount: 650_000,
      purchasePrice: null,
    })
    expect(p.purpose).toBeUndefined()
    expect(p.value).toBeUndefined()
    expect(p.class).toBeUndefined()
    expect(p.amount).toBe('650000')
  })
})

describe('scenario URL round-trip', () => {
  it('survives params and back, including the Session 6 filters', () => {
    const s = scenario({
      purpose: 'renewal',
      occupancy: 'rental',
      termMonths: 36,
      amortizationYears: 30,
      rateType: 'variable',
      cashback: 'none',
      productClass: 'b_side',
    })
    expect(scenarioFromParams(scenarioToParams(s))).toEqual(s)
  })

  it('defaults the new filters to the widest cut', () => {
    const s = scenarioFromParams({})
    expect(s.rateType).toBeNull()
    expect(s.cashback).toBe('any')
  })

  it('ignores garbage params and falls back to defaults', () => {
    const s = scenarioFromParams({ purpose: 'vibes', amount: '-5', am: '99', rt: 'floaty', cb: 'all' })
    expect(s.purpose).toBe(DEFAULT_SCENARIO.purpose)
    expect(s.amount).toBeNull()
    expect(s.amortizationYears).toBe(25)
    expect(s.rateType).toBeNull()
    expect(s.cashback).toBe('any')
  })
})
