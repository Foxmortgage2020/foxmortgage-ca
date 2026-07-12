// Lenders-tab model tests (Rates v3): the honesty rules the browse cards
// depend on — per-class "from" rates (never one unqualified lowest),
// adjustable and variable kept separate, cash back never a headline, only
// approved rows counted, staleness at 30 days, and the disjoint three-state
// coverage partition.

import { describe, expect, it } from 'vitest'
import {
  lenderCards,
  lenderCoverage,
  pendingByLenderMap,
  sortLenderCards,
  STALE_DAYS,
  type LenderCard,
} from '@/lib/lender-browse'
import type { RateQuoteFullRow } from '@/lib/underwriting'

const TODAY = '2026-07-11'

function q(over: Partial<RateQuoteFullRow>): RateQuoteFullRow {
  return {
    id: 'TEST-q',
    intelItemId: 'TEST-intel',
    lenderSlug: 'mcap',
    productClass: 'insurable',
    variant: null,
    termMonths: 60,
    rate: 4.29,
    rateType: 'fixed',
    primeVariance: null,
    cashbackPct: null,
    programNotes: null,
    compBps: 100,
    asOfDate: TODAY,
    expiryDate: null,
    sourcePage: 1,
    sourceSnippet: 'TEST',
    confidence: 0.9,
    status: 'approved',
    extractedBy: 'test',
    createdAt: '2026-07-10T00:00:00Z',
    reviewedAt: null,
    approvedVia: 'sheet:TEST',
    heldReason: null,
    borrowerRequirement: null,
    clientCommitment: null,
    channelRequirement: null,
    transactionTypes: null,
    eligibilityUnknown: false,
    eligibilitySource: null,
    ...over,
  }
}

describe('lenderCards — per-class fixed headline rates', () => {
  it('reports the best fixed rate per class, cash back excluded, class-ordered', () => {
    const cards = lenderCards(
      [
        q({ productClass: 'insured', rate: 4.1 }),
        q({ productClass: 'insured', rate: 4.04 }),
        q({ productClass: 'insurable', rate: 4.34 }),
        q({ productClass: 'conventional', rate: 4.29 }),
        // A cheaper insured row that is a cash back tier: must NOT become the
        // headline "from" rate.
        q({ productClass: 'insured', rate: 3.99, cashbackPct: 3 }),
      ],
      TODAY,
    )
    expect(cards).toHaveLength(1)
    const c = cards[0]
    expect(c.classRates).toEqual([
      { productClass: 'conventional', fromRate: 4.29 },
      { productClass: 'insurable', fromRate: 4.34 },
      { productClass: 'insured', fromRate: 4.04 },
    ])
    expect(c.hasCashback).toBe(true)
    expect(c.approvedCount).toBe(5)
  })

  it('never collapses a single unqualified lowest rate — the card exposes only per-class figures', () => {
    const c = lenderCards([q({ productClass: 'insured', rate: 4.04 }), q({ productClass: 'conventional', rate: 5.2 })], TODAY)[0]
    // There is no scalar "lowest" on the card; the model only exposes the
    // per-class map, so the cheapest 4.04 can never be presented as the
    // conventional headline.
    expect('lowestRate' in c).toBe(false)
    expect(c.classRates.map(r => r.productClass)).toEqual(['conventional', 'insured'])
  })
})

describe('lenderCards — floating discounts keep adjustable and variable apart', () => {
  it('reports the deepest discount for each mechanism separately', () => {
    const c = lenderCards(
      [
        q({ rateType: 'adjustable', rate: null, primeVariance: -0.75 }),
        q({ rateType: 'adjustable', rate: null, primeVariance: -1.05 }),
        q({ rateType: 'variable', rate: null, primeVariance: -0.9 }),
        // Floating cash back tier: excluded from the headline discount.
        q({ rateType: 'adjustable', rate: null, primeVariance: -1.4, cashbackPct: 2 }),
      ],
      TODAY,
    )[0]
    expect(c.floatingBest).toEqual([
      { rateType: 'adjustable', discount: -1.05 },
      { rateType: 'variable', discount: -0.9 },
    ])
  })
})

describe('lenderCards — approved-only and staleness', () => {
  it('counts approved rows only; superseded never feeds a card', () => {
    const cards = lenderCards(
      [q({ status: 'approved' }), q({ status: 'superseded', rate: 3.5 })],
      TODAY,
    )
    expect(cards).toHaveLength(1)
    expect(cards[0].approvedCount).toBe(1)
  })

  it('flags stale past the 30-day threshold, fresh within it, and undated never stale', () => {
    const stale = lenderCards([q({ asOfDate: '2026-06-01' })], TODAY)[0] // ~40 days
    const fresh = lenderCards([q({ asOfDate: '2026-07-01' })], TODAY)[0] // 10 days
    const undated = lenderCards([q({ asOfDate: null })], TODAY)[0]
    expect(stale.stale).toBe(true)
    expect(fresh.stale).toBe(false)
    expect(undated.stale).toBe(false)
    expect(STALE_DAYS).toBe(30)
  })
})

describe('sortLenderCards', () => {
  const cards: LenderCard[] = [
    { slug: 'scotia', approvedCount: 2, newestAsOf: '2026-07-01', stale: false, classRates: [{ productClass: 'insured', fromRate: 4.2 }], floatingBest: [], hasCashback: false, pendingCount: 0 },
    { slug: 'mcap', approvedCount: 9, newestAsOf: '2026-07-09', stale: false, classRates: [{ productClass: 'insured', fromRate: 4.04 }], floatingBest: [], hasCashback: false, pendingCount: 0 },
    { slug: 'b2b', approvedCount: 1, newestAsOf: null, stale: false, classRates: [], floatingBest: [], hasCashback: false, pendingCount: 0 },
  ]
  it('sorts by most products, best insured rate, and pushes un-answerable rows last', () => {
    expect(sortLenderCards(cards, 'products').map(c => c.slug)).toEqual(['mcap', 'scotia', 'b2b'])
    // b2b has no insured rate -> last
    expect(sortLenderCards(cards, 'insured').map(c => c.slug)).toEqual(['mcap', 'scotia', 'b2b'])
    // b2b is undated -> last on newest
    expect(sortLenderCards(cards, 'newest').map(c => c.slug)).toEqual(['mcap', 'scotia', 'b2b'])
  })
})

describe('lenderCoverage — the three states are disjoint and honest', () => {
  it('partitions live / awaiting / coverage-pending with no overlap', () => {
    const approved = [q({ lenderSlug: 'mcap' }), q({ lenderSlug: 'scotia' })]
    const pending = [
      { lenderSlug: 'mcap', quoteCount: 12 }, // mcap is already live -> nudge only
      { lenderSlug: 'neo', quoteCount: 43 }, // purely awaiting
      { lenderSlug: null, quoteCount: 5 }, // unresolved -> dropped
    ]
    const intel = [
      { lenderSlugGuess: 'shinhan' }, // captured, no quotes, no pending -> coverage pending
      { lenderSlugGuess: 'neo' }, // already awaiting -> not double listed
      { lenderSlugGuess: 'mcap' }, // already live -> not listed
      { lenderSlugGuess: null }, // dropped
    ]
    const cov = lenderCoverage(approved, pending, intel, TODAY)
    expect(cov.live.map(c => c.slug).sort()).toEqual(['mcap', 'scotia'])
    expect(cov.live.find(c => c.slug === 'mcap')!.pendingCount).toBe(12)
    expect(cov.awaiting).toEqual([{ slug: 'neo', pendingCount: 43 }])
    expect(cov.coveragePending).toEqual([{ slug: 'shinhan' }])
  })

  it('never renders the reserved TEST lender in any state', () => {
    const cov = lenderCoverage(
      [q({ lenderSlug: 'test-portal' }), q({ lenderSlug: 'mcap' })],
      [{ lenderSlug: 'test-portal', quoteCount: 2 }],
      [{ lenderSlugGuess: 'test-portal' }],
      TODAY,
    )
    expect(cov.live.map(c => c.slug)).toEqual(['mcap'])
    expect(cov.awaiting).toEqual([])
    expect(cov.coveragePending).toEqual([])
  })

  it('pendingByLenderMap sums quote counts per lender and drops null lenders', () => {
    const m = pendingByLenderMap([
      { lenderSlug: 'mcap', quoteCount: 10 },
      { lenderSlug: 'mcap', quoteCount: 5 },
      { lenderSlug: null, quoteCount: 3 },
    ])
    expect(m.get('mcap')).toBe(15)
    expect(m.has('null')).toBe(false)
    expect(m.size).toBe(1)
  })
})
