// The client presentation layer (B8b): the deterministic figures, the disclosed
// offer grade, the frozen snapshots. These tests are the proof that a published
// figure is exactly what the engine produced, a grade is exactly what the rubric
// produced from cited truth, and neither changes after a later data change.

import { describe, it, expect } from 'vitest'
import {
  computeScenario,
  buildScenarioSnapshot,
  buildOfferSnapshot,
  buildOfferPickList,
  buildLetterSnapshot,
  validateLetterInputs,
  letterIsValid,
  toRubricClaims,
  presentationHash,
} from '../lib/client-presentation'
import {
  gradeOffer,
  OFFER_WEIGHTS,
  OFFER_COVERAGE_GATE,
  type RubricClaim,
  type OfferGradeInput,
} from '../config/offer-rubric'
import type { RateQuoteFullRow, KnowledgeClaimRow } from '../lib/underwriting'

// ── A minimal approved fixed quote ───────────────────────────────────────────
function quote(over: Partial<RateQuoteFullRow> = {}): RateQuoteFullRow {
  return {
    id: 'q1',
    intelItemId: 'i1',
    lenderSlug: 'first-national',
    productClass: 'conventional',
    variant: null,
    termMonths: 60,
    rate: 4.79,
    rateType: 'fixed',
    primeVariance: null,
    cashbackPct: null,
    programNotes: null,
    compBps: null,
    asOfDate: '2026-07-14',
    expiryDate: null,
    sourcePage: 1,
    sourceSnippet: '',
    confidence: 1,
    status: 'approved',
    extractedBy: 'test',
    createdAt: '2026-07-14T00:00:00Z',
    reviewedAt: null,
    approvedVia: null,
    heldReason: null,
    borrowerRequirement: null,
    clientCommitment: null,
    channelRequirement: null,
    transactionTypes: null,
    eligibilityUnknown: false,
    eligibilitySource: 'variant:(none)',
    ...over,
  }
}

const claim = (topic: string, claimKey: string, claimValue: unknown): RubricClaim => ({
  topic,
  claimKey,
  claimValue,
  asOfDate: '2026-07-01',
  sourcePage: 5,
  sourceDocumentId: 'doc-1',
})

const FULLY_TRUTHED: OfferGradeInput = {
  effectiveRatePct: 4.0, // → the full 30
  claims: [
    claim('penalty_methodology', 'ird_comparison_basis', { basis: 'three_month_interest' }),
    claim('prepayment_privileges', 'annual', { annual_prepay_pct: 20, payment_increase_pct: 20 }),
    claim('portability', 'portable', { portable: true, blend_and_extend: true }),
    claim('lender_fees', 'fees', { level: 'none' }),
    claim('product_flexibility', 'flex', { score_pct: 1 }),
  ],
}

// ── The rubric ────────────────────────────────────────────────────────────────

describe('the offer rubric — the disclosed grade', () => {
  it('a fully-truthed offer grades exactly per the weights (100 → A)', () => {
    const g = gradeOffer(FULLY_TRUTHED)
    // Each component earns its full weight.
    for (const c of g.components) {
      expect(c.earned, `component ${c.key}`).toBe(OFFER_WEIGHTS[c.key])
    }
    expect(g.gradeablePoints).toBe(100)
    expect(g.earnedPoints).toBe(100)
    expect(g.coverageComplete).toBe(true)
    expect(g.letter).toBe('A')
  })

  it('a gap renders "not on file" and shifts nothing else', () => {
    const full = gradeOffer(FULLY_TRUTHED)
    // Drop the fees claim.
    const withGap = gradeOffer({
      ...FULLY_TRUTHED,
      claims: FULLY_TRUTHED.claims.filter(c => c.topic !== 'lender_fees'),
    })
    const fees = withGap.components.find(c => c.key === 'fees')!
    expect(fees.earned).toBeNull()
    expect(fees.detail).toBe('not on file')
    // Every OTHER component is byte-identical to the fully-truthed grade — the
    // gap shifted nothing.
    for (const c of withGap.components) {
      if (c.key === 'fees') continue
      const same = full.components.find(x => x.key === c.key)!
      expect(c.earned).toBe(same.earned)
    }
    expect(withGap.gradeablePoints).toBe(90)
    expect(withGap.earnedPoints).toBe(90)
    expect(withGap.letter).toBe('A') // 90 ≥ 85
  })

  it('withholds the letter below the coverage gate, and shows it at the gate', () => {
    // Rate (30) + penalty (20) + portability (10) = 60 gradeable, below 70.
    const below = gradeOffer({
      effectiveRatePct: 4.0,
      claims: [
        claim('penalty_methodology', 'ird_comparison_basis', { basis: 'three_month_interest' }),
        claim('portability', 'portable', { portable: true, blend_and_extend: true }),
      ],
    })
    expect(below.gradeablePoints).toBe(60)
    expect(below.coverageComplete).toBe(false)
    expect(below.letter).toBeNull()

    // 60 is the largest reachable coverage under the gate (every weight is a
    // multiple of 10), so the brief's "69 points" is illustrative; the real
    // boundary is 60 (withhold) / 70 (show). Rate + prepayment + penalty = 70.
    expect(OFFER_COVERAGE_GATE).toBe(70)
    const atGate = gradeOffer({
      effectiveRatePct: 4.0,
      claims: [
        claim('prepayment_privileges', 'annual', { annual_prepay_pct: 20, payment_increase_pct: 20 }),
        claim('penalty_methodology', 'ird_comparison_basis', { basis: 'three_month_interest' }),
      ],
    })
    expect(atGate.gradeablePoints).toBe(70)
    expect(atGate.coverageComplete).toBe(true)
    expect(atGate.letter).not.toBeNull()
  })

  it('scores the rate on a disclosed band', () => {
    expect(gradeOffer({ effectiveRatePct: 4.0, claims: [] }).components[0].earned).toBe(30)
    expect(gradeOffer({ effectiveRatePct: 6.5, claims: [] }).components[0].earned).toBe(0)
    // 5.25 is halfway → 15.
    expect(gradeOffer({ effectiveRatePct: 5.25, claims: [] }).components[0].earned).toBe(15)
    // A rate off the top clamps, never negative.
    expect(gradeOffer({ effectiveRatePct: 7.5, claims: [] }).components[0].earned).toBe(0)
    // No priceable rate → rate is "not on file" too.
    expect(gradeOffer({ effectiveRatePct: null, claims: [] }).components[0].earned).toBeNull()
  })

  it('scores the penalty basis, and refuses to guess an unknown basis', () => {
    const score = (basis: string) =>
      gradeOffer({
        effectiveRatePct: 5,
        claims: [claim('penalty_methodology', 'ird_comparison_basis', { basis })],
      }).components.find(c => c.key === 'penalty')!.earned
    expect(score('three_month_interest')).toBe(20)
    expect(score('discounted_rate')).toBe(12)
    expect(score('posted_rate')).toBe(4)
    // An unknown basis is "not on file", never a guessed score.
    expect(score('reinvestment_rate')).toBeNull()
  })

  it('every rendered detail string is client-clean (no internal or verdict word)', () => {
    // The client card renders {c.detail} at runtime, which the source sweep in
    // client-portal.test.ts cannot see — so assert the vocabulary here.
    const BANNED = ['underwriting', 'broker', 'zoho', 'finmo', 'workbench', 'gate', 'pipeline', 'evidence']
    const VERDICT = ['flagged', 'stale', 'verdict', 'requirement', 'illegible', 'needs review']
    const bases = ['three_month_interest', 'discounted_rate', 'posted_rate', 'contract_rate']
    const details: string[] = []
    for (const basis of bases) {
      const g = gradeOffer({
        effectiveRatePct: 4.5,
        claims: [
          claim('penalty_methodology', 'ird_comparison_basis', { basis }),
          claim('prepayment_privileges', 'annual', { annual_prepay_pct: 15, payment_increase_pct: 10 }),
          claim('portability', 'portable', { portable: true, blend_and_extend: false }),
          claim('lender_fees', 'fees', { level: 'low' }),
          claim('product_flexibility', 'flex', { score_pct: 0.5 }),
        ],
      })
      details.push(...g.components.map(c => c.detail))
    }
    for (const d of details) {
      for (const w of [...BANNED, ...VERDICT]) {
        expect(new RegExp(`\\b${w}\\b`, 'i').test(d), `rubric detail leaks "${w}": ${d}`).toBe(false)
      }
    }
  })
})

// ── toRubricClaims: only approved, lender-wide truth grades ───────────────────

describe('toRubricClaims', () => {
  const base = (over: Partial<KnowledgeClaimRow>): KnowledgeClaimRow => ({
    id: 'c1',
    lenderSlug: 'first-national',
    program: null,
    topic: 'penalty_methodology',
    claimKey: 'ird_comparison_basis',
    claimValue: { basis: 'three_month_interest' },
    claimText: 'x',
    sourceDocumentId: 'd1',
    sourcePage: 3,
    sourceSnippet: null,
    asOfDate: '2026-07-01',
    asOfSource: null,
    status: 'approved',
    confidence: 1,
    extractedBy: 'x',
    createdAt: '2026-07-01',
    decidedAt: '2026-07-02',
    ...over,
  })

  it('drops pending claims and program-scoped claims', () => {
    const claims = [
      base({ id: 'a' }), // approved, lender-wide → kept
      base({ id: 'b', status: 'pending' }), // pending → dropped
      base({ id: 'c', program: 'excalibur' }), // program-scoped → dropped
    ]
    const out = toRubricClaims(claims)
    expect(out).toHaveLength(1)
    // A program-scoped penalty basis never grades lender-wide.
    const g = gradeOffer({ effectiveRatePct: 5, claims: toRubricClaims([base({ program: 'excalibur' })]) })
    expect(g.components.find(c => c.key === 'penalty')!.earned).toBeNull()
  })
})

// ── Scenarios: deterministic engine reuse ────────────────────────────────────

describe('scenario figures', () => {
  it('reuses the mortgage engine to the cent (the calculator anchors)', () => {
    // The Rates v2 cent anchors, cross-validated against a live file.
    const a = computeScenario('X', { mortgageAmount: 500000, ratePct: 5.0, amortizationYears: 25 })
    expect(a.ok).toBe(true)
    if (a.ok) expect(a.figures.monthlyPayment).toBe(2908.02)
    const b = computeScenario('Y', { mortgageAmount: 650000, ratePct: 3.75, amortizationYears: 30 })
    expect(b.ok).toBe(true)
    if (b.ok) expect(b.figures.monthlyPayment).toBe(2999.58)
  })

  it('computes a positive lifetime interest and is deterministic (same inputs → same hash)', () => {
    const r1 = computeScenario('A', { mortgageAmount: 465000, ratePct: 4.79, amortizationYears: 25 })
    const r2 = computeScenario('A', { mortgageAmount: 465000, ratePct: 4.79, amortizationYears: 25 })
    expect(r1.ok && r2.ok).toBe(true)
    if (r1.ok && r2.ok) {
      expect(r1.figures.totalInterest).toBeGreaterThan(0)
      expect(r1.figures).toEqual(r2.figures)
      expect(r1.inputsHash).toBe(r2.inputsHash)
    }
    // A different amount → a different hash.
    const r3 = computeScenario('A', { mortgageAmount: 440000, ratePct: 4.79, amortizationYears: 25 })
    if (r1.ok && r3.ok) expect(r1.inputsHash).not.toBe(r3.inputsHash)
  })

  it('refuses to compute (and names what is missing) on bad inputs', () => {
    const noLabel = computeScenario('', { mortgageAmount: 400000, ratePct: 5, amortizationYears: 25 })
    expect(noLabel.ok).toBe(false)
    if (!noLabel.ok) expect(noLabel.missing).toContain('a label')

    const bad = computeScenario('X', { mortgageAmount: 0, ratePct: 30, amortizationYears: 3 })
    expect(bad.ok).toBe(false)
    if (!bad.ok) {
      expect(bad.missing).toContain('a mortgage amount')
      expect(bad.missing).toContain('a rate')
      expect(bad.missing).toContain('an amortization (5 to 30 years)')
    }
  })
})

// ── Snapshots are frozen: a later data change never rewrites them ─────────────

describe('snapshot immutability', () => {
  it('an offer snapshot freezes the grade at build time (later claim changes do not touch it)', () => {
    const claims: KnowledgeClaimRow[] = []
    const q = quote({ rate: 4.0 })
    const snap = buildOfferSnapshot(q, claims)
    const gradeAtBuild = JSON.parse(JSON.stringify(snap.grade))

    // A "source change after publish": the lender's claims change, and the
    // quote is re-graded elsewhere. The stored snapshot is untouched.
    const laterClaims = [
      {
        id: 'c1',
        lenderSlug: 'first-national',
        program: null,
        topic: 'penalty_methodology',
        claimKey: 'ird_comparison_basis',
        claimValue: { basis: 'three_month_interest' },
        claimText: 'x',
        sourceDocumentId: 'd1',
        sourcePage: 3,
        sourceSnippet: null,
        asOfDate: '2026-08-01',
        asOfSource: null,
        status: 'approved' as const,
        confidence: 1,
        extractedBy: 'x',
        createdAt: '2026-08-01',
        decidedAt: '2026-08-02',
      },
    ]
    const reGraded = buildOfferSnapshot(q, laterClaims)
    // The re-grade is different (it now has a penalty claim)…
    expect(reGraded.grade.gradeablePoints).not.toBe(snap.grade.gradeablePoints)
    // …but the ORIGINAL snapshot's grade is exactly what it was at build time.
    expect(snap.grade).toEqual(gradeAtBuild)
    // The hash is a fingerprint of the frozen snapshot's own contents.
    const { snapshotHash, ...base } = snap
    expect(snapshotHash).toBe(presentationHash(base))
  })

  it('a scenario snapshot carries its figures as data, independent of any recompute', () => {
    const built = buildScenarioSnapshot('Keep the loan', {
      mortgageAmount: 440000,
      ratePct: 4.79,
      amortizationYears: 25,
    })
    expect(built.ok).toBe(true)
    if (built.ok) {
      const frozen = JSON.parse(JSON.stringify(built.snapshot.figures))
      // Recomputing with DIFFERENT inputs produces different figures, but the
      // stored snapshot is unchanged (it is plain data).
      computeScenario('Keep the loan', { mortgageAmount: 999999, ratePct: 9, amortizationYears: 30 })
      expect(built.snapshot.figures).toEqual(frozen)
    }
  })
})

// ── Offer snapshot + pick list ────────────────────────────────────────────────

describe('offer snapshot + pick list', () => {
  it('prices a fixed quote from its printed rate and a floating quote from prime', () => {
    const fixed = buildOfferSnapshot(quote({ rate: 4.79 }), [])
    expect(fixed.effectiveRatePct).toBe(4.79)
    expect(fixed.rateDisplay).toBe('4.79%')

    const floating = buildOfferSnapshot(
      quote({ rate: null, rateType: 'adjustable', primeVariance: -0.9, lenderSlug: 'first-national' }),
      [],
    )
    // effective = prime (4.45) + (-0.9) = 3.55
    expect(floating.effectiveRatePct).toBeCloseTo(3.55, 2)
    expect(floating.rateDisplay).toContain('Prime')
  })

  it('dedups the pick list to the best rate per lender/term/type/class, excluding test + unpriced', () => {
    const list = buildOfferPickList([
      quote({ id: 'a', lenderSlug: 'mcap', termMonths: 60, rate: 4.99 }),
      quote({ id: 'b', lenderSlug: 'mcap', termMonths: 60, rate: 4.79 }), // better → wins
      quote({ id: 'c', lenderSlug: 'mcap', termMonths: 36, rate: 5.2 }), // different term → own row
      quote({ id: 'd', lenderSlug: 'test-portal', termMonths: 60, rate: 1.0 }), // excluded
      quote({ id: 'e', lenderSlug: 'mcap', termMonths: 12, rate: null, primeVariance: null }), // unpriced → excluded
      quote({ id: 'f', lenderSlug: 'mcap', termMonths: 60, rate: 4.5, status: 'superseded' }), // not approved → excluded
    ])
    const key = (r: { lenderSlug: string; termMonths: number }) => `${r.lenderSlug}-${r.termMonths}`
    const map = new Map(list.map(r => [key(r), r]))
    expect(map.get('mcap-60')?.quoteId).toBe('b')
    expect(map.get('mcap-36')?.quoteId).toBe('c')
    expect(list.find(r => r.lenderSlug === 'test-portal')).toBeUndefined()
    expect(list.some(r => r.quoteId === 'e')).toBe(false)
    expect(list.some(r => r.quoteId === 'f')).toBe(false)
    // Sorted by effective rate ascending.
    expect(list[0].effectiveRatePct! <= list[list.length - 1].effectiveRatePct!).toBe(true)
  })
})

// ── The letter ────────────────────────────────────────────────────────────────

describe('the pre-approval letter', () => {
  const TODAY = '2026-07-18'

  it('validates the terms and names what is missing', () => {
    const ok = validateLetterInputs(
      { maxPurchasePrice: 720000, ratePct: 4.59, rateHoldExpiry: '2026-12-31', conditions: 'appraisal ok' },
      TODAY,
    )
    expect(ok.ok).toBe(true)

    const bad = validateLetterInputs(
      { maxPurchasePrice: 0, ratePct: 40, rateHoldExpiry: '2026-01-01', conditions: '' },
      TODAY,
    )
    expect(bad.ok).toBe(false)
    if (!bad.ok) {
      expect(bad.missing).toContain('a maximum purchase price')
      expect(bad.missing).toContain('a rate')
      expect(bad.missing).toContain('a rate-hold expiry in the future') // past date
      expect(bad.missing).toContain('a conditions line')
    }
  })

  it('is valid to a client until its rate hold passes', () => {
    const snap = buildLetterSnapshot({
      inputs: { maxPurchasePrice: 720000, ratePct: 4.59, rateHoldExpiry: '2026-12-31', conditions: 'ok now' },
      clientFirstName: 'Sofia',
      fileRef: 'FOX-1004',
      mintedBy: 'michael@foxmortgage.ca',
      mintedAt: '2026-07-15T14:00:00Z',
    })
    expect(letterIsValid(snap, '2026-12-30')).toBe(true)
    expect(letterIsValid(snap, '2026-12-31')).toBe(true) // the last day counts
    expect(letterIsValid(snap, '2027-01-01')).toBe(false)
    expect(snap.snapshotHash).toMatch(/^[a-f0-9]{64}$/)
  })
})
