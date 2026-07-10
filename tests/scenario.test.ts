// Rates v2 scenario model tests. The sparse-dimension rules are the point:
// explicit variant markers rule quotes in or out; absence can never rule a
// quote out and instead carries an assumed note (rendered as the tooltip).
// Payment anchors are independent figures, not engine output re-asserted:
// $650,000 at 3.75% over 30 years is the Zinger file's cross-validated
// $2,999.58 (Finmo, the workbench calc engine, and Zoho all print it), and
// $500,000 at 5.00% over 25 years is the standard Canadian semi-annual
// reference figure $2,908.02.

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SCENARIO,
  classifyVariant,
  fmtMoneyShort,
  lenderResults,
  ltvPct,
  matchQuote,
  offerFitsScenario,
  scenarioFromParams,
  scenarioMonthlyPayment,
  scenarioParamsFromDeal,
  scenarioToParams,
  summaryLine,
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

describe('variant classification', () => {
  it('classifies every variant family in the July 2026 inventory', () => {
    expect(classifyVariant(null)).toEqual({ kind: 'none' })
    expect(classifyVariant('ltv<=65')).toEqual({ kind: 'ltv', min: 0, max: 65 })
    expect(classifyVariant('ltv75-80')).toEqual({ kind: 'ltv', min: 75, max: 80 })
    expect(classifyVariant('rental')).toEqual({ kind: 'rental', label: 'rental' })
    expect(classifyVariant('second-home-rental')).toEqual({ kind: 'rental', label: 'second-home-rental' })
    expect(classifyVariant('mortgage-plus')).toEqual({ kind: 'mortgage-plus', amortizationYears: null })
    expect(classifyVariant('mortgage-plus-30yr')).toEqual({ kind: 'mortgage-plus', amortizationYears: 30 })
    expect(classifyVariant('something-new')).toEqual({ kind: 'other', raw: 'something-new' })
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

describe('matching: hard dimensions', () => {
  it('insurance class and term rule out with no assumptions', () => {
    expect(matchQuote(quote({ productClass: 'insured' }), scenario({}))).toBeNull()
    expect(matchQuote(quote({ termMonths: 36 }), scenario({ termMonths: 60 }))).toBeNull()
    expect(matchQuote(quote({}), scenario({ termMonths: null }))).not.toBeNull()
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

describe('matching: sparse dimensions match all with the assumed note (acceptance 3)', () => {
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

describe('lender results', () => {
  it('sorts lenders by lowest matching rate, always', () => {
    const quotes = [
      quote({ id: 'a', lenderSlug: 'mcap', rate: 4.34 }),
      quote({ id: 'b', lenderSlug: 'scotia', rate: 4.29 }),
      quote({ id: 'c', lenderSlug: 'mcap', rate: 4.19 }),
      quote({ id: 'd', lenderSlug: 'rfa', rate: 4.19 }),
    ]
    const results = lenderResults(quotes, scenario({}))
    expect(results.map(r => r.lenderSlug)).toEqual(['mcap', 'rfa', 'scotia'])
    expect(results[0].lowestRate).toBe(4.19)
    expect(results[0].count).toBe(2)
    expect(results[0].matches[0].quote.id).toBe('c')
  })
})

describe('payments reuse the validated calculator core (acceptance 4)', () => {
  it('matches the Zinger cross-validated figure to the cent', () => {
    // $650,000 at 3.75%, 30-year amortization: Finmo, the workbench calc
    // engine, and Zoho Payment_Amount all print 2999.58.
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
  it('is self-describing in the brief format', () => {
    const s = scenario({ purpose: 'transfer', termMonths: 36, amount: 1_160_000, propertyValue: 1_450_000 })
    expect(summaryLine(s)).toBe(
      'Transfer, owner occupied, $1.16M at 80% LTV, 3yr fixed, 25yr amortization, insurable',
    )
  })

  it('states any term honestly when no term is chosen', () => {
    const s = scenario({ termMonths: null })
    expect(summaryLine(s)).toContain('any term, fixed')
  })

  it('formats money short forms', () => {
    expect(fmtMoneyShort(1_160_000)).toBe('$1.16M')
    expect(fmtMoneyShort(850_000)).toBe('$850K')
  })
})

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
})

describe('deal room prefill (Part 4)', () => {
  it('prefills only what the deal data supports and derives insured above 80 LTV', () => {
    // Bannerman-shaped: high-ratio insured purchase (LTV 94.67).
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
    expect(s.insuranceClass).toBe('insured')
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
  it('survives params and back', () => {
    const s = scenario({ purpose: 'renewal', occupancy: 'rental', termMonths: 36, amortizationYears: 30 })
    expect(scenarioFromParams(scenarioToParams(s))).toEqual(s)
  })

  it('ignores garbage params and falls back to defaults', () => {
    const s = scenarioFromParams({ purpose: 'vibes', amount: '-5', am: '99' })
    expect(s.purpose).toBe(DEFAULT_SCENARIO.purpose)
    expect(s.amount).toBeNull()
    expect(s.amortizationYears).toBe(25)
  })
})
