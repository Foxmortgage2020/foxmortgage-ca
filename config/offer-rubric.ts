// The offer grading rubric (B8b Task 2). ONE config home, deterministic, and
// disclosed — a client sees the grade AND every component that made it, because
// a rubric you cannot see is not a rubric, it is a marketing badge.
//
// THE HONESTY RULE (the whole point). A component scores only on CITED TRUTH:
// the quote's own fields, or an APPROVED, lender-wide knowledge claim. A
// component with no truth on file renders "not on file" and contributes
// NOTHING — not a zero, not an average, nothing. The letter grade renders only
// when at least COVERAGE_GATE of the 100 points are gradeable; below that the
// card says "grading incomplete, N of 100 points on file". We never invent a
// product feature and never average around a gap.
//
// WEIGHTS + THRESHOLDS ARE DECIDED (the brief). THE PER-COMPONENT QUALITY
// SCALES ARE DRAFTS for Michael's sign-off, marked DRAFT below and reproduced
// in docs/presentation-b8b-2026-07-18.md — a rubric is a domain instrument and
// every number here is a one-line edit he can make.
//
// FORWARD-COMPATIBLE BY CONSTRUCTION: penalty method reads an existing claim
// topic that is live today (penalty_methodology / ird_comparison_basis). The
// other four claim-sourced components read topics the knowledge extractor does
// not emit yet, so they read "not on file" today — the honest state — and light
// up with zero code change the moment those claims exist (the attempt-and-
// fallback ethos). Most offers therefore grade "incomplete" until the lender
// knowledge base is populated, exactly as the brief intends.

export const OFFER_RUBRIC_VERSION = 1

export const OFFER_COMPONENT_KEYS = [
  'rate',
  'prepayment',
  'penalty',
  'portability',
  'fees',
  'flexibility',
] as const
export type OfferComponentKey = (typeof OFFER_COMPONENT_KEYS)[number]

// The DECIDED weights (the brief). They sum to 100.
export const OFFER_WEIGHTS: Record<OfferComponentKey, number> = {
  rate: 30,
  prepayment: 20,
  penalty: 20,
  portability: 10,
  fees: 10,
  flexibility: 10,
}

export const OFFER_COMPONENT_LABEL: Record<OfferComponentKey, string> = {
  rate: 'Rate',
  prepayment: 'Prepayment privileges',
  penalty: 'Penalty method',
  portability: 'Portability',
  fees: 'Fees',
  flexibility: 'Product flexibility',
}

// The DECIDED letter thresholds (the brief). Applied to earned points out of
// 100 — NOT rescaled by coverage, because rescaling would average around a gap.
export const OFFER_LETTER_THRESHOLDS = { A: 85, B: 70, C: 55 } as const

// The DECIDED coverage gate: show a letter only when this many of the 100
// points are gradeable. Since every weight is a multiple of 10, the reachable
// coverages straddling this gate are 60 (withhold) and 70 (show) — the brief's
// "69 points withholds" is the sub-threshold illustration; 60 is the nearest
// reachable value under the gate. See the report.
export const OFFER_COVERAGE_GATE = 70

// ── DRAFT quality scales (Michael's sign-off) ───────────────────────────────

// Rate → 0..30. A best-in-market rate earns full marks; a high rate earns
// none; linear between. DRAFT band, reviewed as a pair with the book.
export const RATE_FULL_AT_PCT = 4.0 // earns the full 30
export const RATE_ZERO_AT_PCT = 6.5 // earns 0

// Penalty method basis → 0..20. Three-month interest is the client's friend on
// a fixed break; an IRD against the posted rate is the costliest. DRAFT.
export const PENALTY_BASIS_SCORE: Record<string, number> = {
  three_month_interest: 20,
  three_months_interest: 20,
  '3mi': 20,
  discounted_rate: 12,
  contract_rate: 12,
  posted_rate: 4,
}

// ── The claim sources (forward contract with the knowledge extractor) ───────
// A component reads the FIRST approved, lender-wide (program === null) claim
// matching its topic (and claimKey, when set). penalty is live today; the rest
// are the topics we will grade the moment they are emitted.
export const RUBRIC_CLAIM_SOURCE: Partial<
  Record<OfferComponentKey, { topic: string; claimKey?: string }>
> = {
  penalty: { topic: 'penalty_methodology', claimKey: 'ird_comparison_basis' },
  prepayment: { topic: 'prepayment_privileges' },
  portability: { topic: 'portability' },
  fees: { topic: 'lender_fees' },
  flexibility: { topic: 'product_flexibility' },
}

// ── Types ───────────────────────────────────────────────────────────────────

// A minimal claim shape, so this config stays dependency-light. The caller maps
// KnowledgeClaimRow → RubricClaim (approved, lender-wide claims only).
export interface RubricClaim {
  topic: string
  claimKey: string
  claimValue: unknown
  asOfDate: string | null
  sourcePage: number | null
  sourceDocumentId: string | null
}

export interface OfferGradeCitation {
  // Client-safe: a confirmation + as-of, never the internal document title.
  asOfDate: string | null
  sourcePage: number | null
}

export interface OfferGradeComponent {
  key: OfferComponentKey
  label: string
  weight: number
  // null === "not on file" (contributes nothing, gradeable false). Otherwise an
  // integer 0..weight.
  earned: number | null
  detail: string
  citation: OfferGradeCitation | null
}

export interface OfferGrade {
  version: number
  components: OfferGradeComponent[]
  gradeablePoints: number
  earnedPoints: number
  // null when coverage is below the gate — the card shows "grading incomplete".
  letter: 'A' | 'B' | 'C' | 'D' | null
  coverageComplete: boolean
}

export interface OfferGradeInput {
  // The effective rate (fixed printed, or prime+variance), or null when the
  // quote carries no priceable rate — then rate is "not on file" too.
  effectiveRatePct: number | null
  // Approved, lender-wide claims for this lender.
  claims: RubricClaim[]
}

// ── Scoring ──────────────────────────────────────────────────────────────────

function clampRound(v: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(v)))
}

function findClaim(component: OfferComponentKey, claims: RubricClaim[]): RubricClaim | null {
  const src = RUBRIC_CLAIM_SOURCE[component]
  if (!src) return null
  return (
    claims.find(
      c => c.topic === src.topic && (src.claimKey === undefined || c.claimKey === src.claimKey),
    ) ?? null
  )
}

function claimObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
function cite(c: RubricClaim): OfferGradeCitation {
  return { asOfDate: c.asOfDate, sourcePage: c.sourcePage }
}

function scoreRate(effective: number | null): Omit<OfferGradeComponent, 'key' | 'label' | 'weight'> {
  if (effective === null) return { earned: null, detail: 'not on file', citation: null }
  const span = RATE_ZERO_AT_PCT - RATE_FULL_AT_PCT
  const raw = span > 0 ? (30 * (RATE_ZERO_AT_PCT - effective)) / span : 0
  const earned = clampRound(raw, 30)
  return { earned, detail: `${effective.toFixed(2)}%`, citation: null }
}

function scorePrepayment(c: RubricClaim | null): Omit<OfferGradeComponent, 'key' | 'label' | 'weight'> {
  if (!c) return { earned: null, detail: 'not on file', citation: null }
  const o = claimObj(c.claimValue)
  const lump = num(o?.annual_prepay_pct)
  const inc = num(o?.payment_increase_pct)
  if (lump === null && inc === null) return { earned: null, detail: 'not on file', citation: null }
  // Each half of the privilege is worth up to 10; 20% is full marks. An ABSENT
  // half is not stated as "0%" (that would fabricate a value we do not have) —
  // it simply earns no credit, the same conservative rule as a missing
  // component, and the detail names only what is on file.
  const lumpPts = clampRound((10 * (lump ?? 0)) / 20, 10)
  const incPts = clampRound((10 * (inc ?? 0)) / 20, 10)
  const parts: string[] = []
  if (lump !== null) parts.push(`${lump}% lump`)
  if (inc !== null) parts.push(`${inc}% payment increase`)
  return { earned: Math.min(20, lumpPts + incPts), detail: parts.join(', '), citation: cite(c) }
}

function scorePenalty(c: RubricClaim | null): Omit<OfferGradeComponent, 'key' | 'label' | 'weight'> {
  if (!c) return { earned: null, detail: 'not on file', citation: null }
  const o = claimObj(c.claimValue)
  const basis = typeof o?.basis === 'string' ? o.basis : null
  if (!basis || !(basis in PENALTY_BASIS_SCORE)) {
    // A claim exists but its basis is not one we can score — don't guess.
    return { earned: null, detail: 'not on file', citation: null }
  }
  // Plain-words labels: a client should read the offer card without a glossary.
  // "IRD" and the like are expanded into what they mean for the break penalty.
  const label: Record<string, string> = {
    three_month_interest: 'three months of interest',
    three_months_interest: 'three months of interest',
    '3mi': 'three months of interest',
    discounted_rate: 'based on your discounted rate',
    contract_rate: 'based on your contract rate',
    posted_rate: 'based on the posted rate',
  }
  return { earned: PENALTY_BASIS_SCORE[basis], detail: label[basis] ?? basis, citation: cite(c) }
}

function scorePortability(c: RubricClaim | null): Omit<OfferGradeComponent, 'key' | 'label' | 'weight'> {
  if (!c) return { earned: null, detail: 'not on file', citation: null }
  const o = claimObj(c.claimValue)
  const portable = o?.portable === true
  const blend = o?.blend_and_extend === true
  if (o?.portable === undefined) return { earned: null, detail: 'not on file', citation: null }
  const earned = !portable ? 0 : blend ? 10 : 7
  const detail = !portable
    ? 'not portable'
    : blend
      ? 'portable, and you can blend and extend'
      : 'portable'
  return { earned, detail, citation: cite(c) }
}

function scoreFees(c: RubricClaim | null): Omit<OfferGradeComponent, 'key' | 'label' | 'weight'> {
  if (!c) return { earned: null, detail: 'not on file', citation: null }
  const o = claimObj(c.claimValue)
  const level = typeof o?.level === 'string' ? o.level : null
  const levelScore: Record<string, number> = { none: 10, low: 6, medium: 4, high: 2 }
  const levelLabel: Record<string, string> = {
    none: 'no lender fee',
    low: 'low fees',
    medium: 'moderate fees',
    high: 'high fees',
  }
  if (level && level in levelScore) {
    return { earned: levelScore[level], detail: levelLabel[level] ?? `${level} fees`, citation: cite(c) }
  }
  const amount = num(o?.amount)
  if (amount !== null) {
    // $0 → full; scaled down to 0 by $500.
    const earned = clampRound(10 * (1 - amount / 500), 10)
    return { earned, detail: amount === 0 ? 'no lender fee' : `$${amount} lender fee`, citation: cite(c) }
  }
  return { earned: null, detail: 'not on file', citation: null }
}

function scoreFlexibility(c: RubricClaim | null): Omit<OfferGradeComponent, 'key' | 'label' | 'weight'> {
  if (!c) return { earned: null, detail: 'not on file', citation: null }
  const o = claimObj(c.claimValue)
  const pct = num(o?.score_pct) // 0..1
  if (pct === null) return { earned: null, detail: 'not on file', citation: null }
  return { earned: clampRound(10 * pct, 10), detail: `${Math.round(pct * 100)}% of features`, citation: cite(c) }
}

function letterFor(earned: number): 'A' | 'B' | 'C' | 'D' {
  if (earned >= OFFER_LETTER_THRESHOLDS.A) return 'A'
  if (earned >= OFFER_LETTER_THRESHOLDS.B) return 'B'
  if (earned >= OFFER_LETTER_THRESHOLDS.C) return 'C'
  return 'D'
}

/**
 * Grade one offer. Deterministic: same inputs → same grade, always. The result
 * is frozen into the offer snapshot at selection time, so a later data change
 * never rewrites a grade a client already saw.
 */
export function gradeOffer(input: OfferGradeInput): OfferGrade {
  const scored: Record<OfferComponentKey, Omit<OfferGradeComponent, 'key' | 'label' | 'weight'>> = {
    rate: scoreRate(input.effectiveRatePct),
    prepayment: scorePrepayment(findClaim('prepayment', input.claims)),
    penalty: scorePenalty(findClaim('penalty', input.claims)),
    portability: scorePortability(findClaim('portability', input.claims)),
    fees: scoreFees(findClaim('fees', input.claims)),
    flexibility: scoreFlexibility(findClaim('flexibility', input.claims)),
  }

  const components: OfferGradeComponent[] = OFFER_COMPONENT_KEYS.map(key => ({
    key,
    label: OFFER_COMPONENT_LABEL[key],
    weight: OFFER_WEIGHTS[key],
    ...scored[key],
  }))

  const gradeablePoints = components.reduce((a, c) => a + (c.earned !== null ? c.weight : 0), 0)
  const earnedPoints = components.reduce((a, c) => a + (c.earned ?? 0), 0)
  const coverageComplete = gradeablePoints >= OFFER_COVERAGE_GATE

  return {
    version: OFFER_RUBRIC_VERSION,
    components,
    gradeablePoints,
    earnedPoints,
    coverageComplete,
    letter: coverageComplete ? letterFor(earnedPoints) : null,
  }
}
