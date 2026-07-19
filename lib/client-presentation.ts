// The client presentation layer (B8b) — the pure model behind three surfaces
// Michael composes in the deal room and publishes to a client's own page:
// Scenarios (deterministic what-ifs), Offers (lender options with a disclosed
// grade), and the Pre-approval letter (a deterministic artifact).
//
// SNAPSHOTS OVER REFERENCES. What a client sees is FROZEN at publish time and
// cited to its inputs, so a later rate change, a re-graded lender, or an edited
// quote never silently rewrites a page a client already saw. This module builds
// those frozen snapshots; the store persists them verbatim and the client
// render displays them without recomputing.
//
// DETERMINISTIC FIGURES ONLY. Every scenario figure comes from the existing
// mortgage engine (lib/mortgage-engine.ts — the same semi-annual-compounding
// core the public calculators use), never a fresh derivation and never AI
// prose. Every figure is cited to its inputs by a hash.
//
// Pure (node:crypto + the engines, no fetch / Clerk / env), so it tests in node.

import { createHash } from 'node:crypto'
import {
  buildSchedule,
  monthlyPayment,
  paymentBreakdown,
  type MortgageInput,
} from '@/lib/mortgage-engine'
import { primeFor } from '@/config/prime'
import { lenderDisplayName } from '@/config/lenders'
import { gradeOffer, type OfferGrade, type RubricClaim } from '@/config/offer-rubric'
import type { RateQuoteFullRow, KnowledgeClaimRow } from '@/lib/underwriting'

// Bump when a scenario figure's derivation changes (so an old snapshot is never
// silently reinterpreted). The frozen snapshot carries this.
export const PRESENTATION_CALC_VERSION = 1

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** sha256 of a canonically-ordered JSON payload — the citation for a snapshot. */
export function presentationHash(payload: unknown): string {
  const canonical = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canonical)
    if (v && typeof v === 'object') {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = canonical((v as Record<string, unknown>)[k])
          return acc
        }, {})
    }
    return v
  }
  return createHash('sha256').update(JSON.stringify(canonical(payload)), 'utf8').digest('hex')
}

// ── Scenarios ────────────────────────────────────────────────────────────────

export interface ScenarioInputs {
  mortgageAmount: number
  ratePct: number
  amortizationYears: number
}

export interface ScenarioFigures {
  monthlyPayment: number
  totalInterest: number
}

export interface ScenarioSnapshot {
  label: string
  inputs: ScenarioInputs
  figures: ScenarioFigures
  inputsHash: string
  calcVersion: number
}

// What a client sees for one published scenario: label + inputs + frozen
// figures. Defined here (upstream of the store and demo fixtures).
export interface PublishedScenario {
  label: string
  inputs: ScenarioInputs
  figures: ScenarioFigures
}

export type ScenarioComputeResult =
  | { ok: true; figures: ScenarioFigures; inputsHash: string }
  // The admin surface uses `missing` to tell Michael exactly what to fix; an
  // unpublishable computation NEVER reaches the client.
  | { ok: false; missing: string[] }

const SANE_MAX_AMOUNT = 50_000_000
const RATE_MIN = 0.01
const RATE_MAX = 25
const AMORT_MIN = 5
const AMORT_MAX = 30

/**
 * Compute a scenario's figures deterministically through the mortgage engine.
 * Returns the exact inputs it hashed, so the caller freezes a snapshot whose
 * figures can never drift from its inputs.
 */
export function computeScenario(label: string, inputs: ScenarioInputs): ScenarioComputeResult {
  const missing: string[] = []
  if (!label || !label.trim()) missing.push('a label')
  const { mortgageAmount, ratePct, amortizationYears } = inputs
  if (!(Number.isFinite(mortgageAmount) && mortgageAmount > 0 && mortgageAmount <= SANE_MAX_AMOUNT))
    missing.push('a mortgage amount')
  if (!(Number.isFinite(ratePct) && ratePct >= RATE_MIN && ratePct <= RATE_MAX)) missing.push('a rate')
  if (
    !(
      Number.isInteger(amortizationYears) &&
      amortizationYears >= AMORT_MIN &&
      amortizationYears <= AMORT_MAX
    )
  )
    missing.push('an amortization (5 to 30 years)')
  if (missing.length) return { ok: false, missing }

  const amortMonths = amortizationYears * 12
  const input: MortgageInput = {
    amount: mortgageAmount,
    ratePct,
    compounding: 'semi-annually',
    termYears: amortizationYears,
    amortMonths,
    frequency: 'monthly',
    loanType: 'regular',
    payIncPct: 0,
    payIncAmt: 0,
    oneTimePrepay: 0,
    annualPrepay: 0,
  }
  // A fixed start date keeps the figure fully deterministic (interest totals do
  // not depend on the calendar; this only removes any new Date() from the path).
  const schedule = buildSchedule(input, new Date(Date.UTC(2000, 0, 1)))
  const monthly = monthlyPayment(mortgageAmount, ratePct, 'semi-annually', amortMonths)
  const totalInterest = paymentBreakdown(input, schedule, 'total').interest
  const figures: ScenarioFigures = {
    monthlyPayment: round2(monthly),
    totalInterest: round2(totalInterest),
  }
  return { ok: true, figures, inputsHash: presentationHash({ v: PRESENTATION_CALC_VERSION, inputs }) }
}

/** Freeze a scenario snapshot from a valid computation. */
export function buildScenarioSnapshot(
  label: string,
  inputs: ScenarioInputs,
): { ok: true; snapshot: ScenarioSnapshot } | { ok: false; missing: string[] } {
  const r = computeScenario(label, inputs)
  if (!r.ok) return r
  return {
    ok: true,
    snapshot: {
      label: label.trim(),
      inputs,
      figures: r.figures,
      inputsHash: r.inputsHash,
      calcVersion: PRESENTATION_CALC_VERSION,
    },
  }
}

// ── Offers ───────────────────────────────────────────────────────────────────

export interface OfferSnapshot {
  quoteId: string
  lenderSlug: string
  lenderName: string
  termMonths: number
  rateType: 'fixed' | 'adjustable' | 'variable'
  // The printed rate, if the sheet carried one.
  ratePct: number | null
  // The rate used for grading and display: printed, or prime + variance.
  effectiveRatePct: number | null
  primeUsed: number | null
  rateDisplay: string
  cashbackPct: number | null
  productClass: string
  asOfDate: string | null
  grade: OfferGrade
  snapshotHash: string
}

/**
 * Map approved, LENDER-WIDE knowledge claims to the rubric's minimal shape.
 * Program-scoped claims are dropped: a claim about one program's penalty math
 * must not grade a different product (mirrors selectIrdBasisClaim's fail-closed
 * posture, generalised to every rubric component).
 */
export function toRubricClaims(claims: KnowledgeClaimRow[]): RubricClaim[] {
  return claims
    .filter(c => c.status === 'approved' && c.program === null)
    .map(c => ({
      topic: c.topic,
      claimKey: c.claimKey,
      claimValue: c.claimValue,
      asOfDate: c.asOfDate,
      sourcePage: c.sourcePage,
      sourceDocumentId: c.sourceDocumentId,
    }))
}

function effectiveRateOf(q: Pick<RateQuoteFullRow, 'rate' | 'primeVariance' | 'lenderSlug'>): {
  effective: number | null
  primeUsed: number | null
} {
  if (q.rate !== null) return { effective: q.rate, primeUsed: null }
  if (q.primeVariance !== null) {
    const prime = primeFor(q.lenderSlug)
    return { effective: round2(prime + q.primeVariance), primeUsed: prime }
  }
  return { effective: null, primeUsed: null }
}

function rateDisplayOf(
  q: Pick<RateQuoteFullRow, 'rate' | 'primeVariance'>,
  effective: number | null,
  prime: number | null,
): string {
  if (q.rate !== null) return `${q.rate.toFixed(2)}%`
  if (q.primeVariance !== null && effective !== null && prime !== null) {
    const sign = q.primeVariance < 0 ? '−' : '+'
    return `Prime ${sign} ${Math.abs(q.primeVariance).toFixed(2)}% (${effective.toFixed(2)}% at prime ${prime.toFixed(2)}%)`
  }
  return 'rate not priced'
}

/**
 * Build a frozen offer snapshot from an approved quote + its lender's claims.
 * The grade is computed once, here, and frozen — the client sees exactly this.
 */
export function buildOfferSnapshot(quote: RateQuoteFullRow, claims: KnowledgeClaimRow[]): OfferSnapshot {
  const { effective, primeUsed } = effectiveRateOf(quote)
  const grade = gradeOffer({ effectiveRatePct: effective, claims: toRubricClaims(claims) })
  const snap: Omit<OfferSnapshot, 'snapshotHash'> = {
    quoteId: quote.id,
    lenderSlug: quote.lenderSlug,
    lenderName: lenderDisplayName(quote.lenderSlug),
    termMonths: quote.termMonths,
    rateType: quote.rateType,
    ratePct: quote.rate,
    effectiveRatePct: effective,
    primeUsed,
    rateDisplay: rateDisplayOf(quote, effective, primeUsed),
    cashbackPct: quote.cashbackPct,
    productClass: quote.productClass,
    asOfDate: quote.asOfDate,
    grade,
  }
  return { ...snap, snapshotHash: presentationHash(snap) }
}

// A slim, deduped selection list for the offer author: the best (lowest
// effective) approved quote per (lender, term, rate type, product class), so
// Michael picks from a bounded list instead of 1,200 rows. The route re-fetches
// the full quote by id and rebuilds the snapshot — the client never sends a
// figure.
export interface OfferPickRow {
  quoteId: string
  lenderSlug: string
  lenderName: string
  termMonths: number
  rateType: 'fixed' | 'adjustable' | 'variable'
  productClass: string
  effectiveRatePct: number | null
  rateDisplay: string
  asOfDate: string | null
}

export function buildOfferPickList(quotes: RateQuoteFullRow[]): OfferPickRow[] {
  const best = new Map<string, OfferPickRow>()
  for (const q of quotes) {
    if (q.status !== 'approved') continue
    if (q.lenderSlug === 'test-portal') continue // the TEST lender never reaches a client
    const { effective, primeUsed } = effectiveRateOf(q)
    if (effective === null) continue
    const key = `${q.lenderSlug}|${q.termMonths}|${q.rateType}|${q.productClass}`
    const cur = best.get(key)
    if (cur && cur.effectiveRatePct !== null && effective >= cur.effectiveRatePct) continue
    best.set(key, {
      quoteId: q.id,
      lenderSlug: q.lenderSlug,
      lenderName: lenderDisplayName(q.lenderSlug),
      termMonths: q.termMonths,
      rateType: q.rateType,
      productClass: q.productClass,
      effectiveRatePct: effective,
      rateDisplay: rateDisplayOf(q, effective, primeUsed),
      asOfDate: q.asOfDate,
    })
  }
  return Array.from(best.values()).sort(
    (a, b) => (a.effectiveRatePct ?? 99) - (b.effectiveRatePct ?? 99),
  )
}

// ── The pre-approval letter (purchase only) ──────────────────────────────────

export interface LetterInputs {
  maxPurchasePrice: number
  ratePct: number
  rateHoldExpiry: string // YYYY-MM-DD
  conditions: string
}

export interface LetterSnapshot {
  inputs: LetterInputs
  clientFirstName: string | null
  fileRef: string | null
  mintedBy: string
  mintedAt: string
  snapshotHash: string
}

export type LetterValidation =
  | { ok: true; inputs: LetterInputs }
  | { ok: false; missing: string[] }

const YMD = /^\d{4}-\d{2}-\d{2}$/

/** Validate the terms Michael typed. Nothing mints until every field is real. */
export function validateLetterInputs(raw: {
  maxPurchasePrice?: unknown
  ratePct?: unknown
  rateHoldExpiry?: unknown
  conditions?: unknown
}, todayYMD: string): LetterValidation {
  const missing: string[] = []
  const price = typeof raw.maxPurchasePrice === 'number' ? raw.maxPurchasePrice : NaN
  const rate = typeof raw.ratePct === 'number' ? raw.ratePct : NaN
  const expiry = typeof raw.rateHoldExpiry === 'string' ? raw.rateHoldExpiry.trim() : ''
  const conditions = typeof raw.conditions === 'string' ? raw.conditions.trim() : ''
  if (!(Number.isFinite(price) && price > 0 && price <= SANE_MAX_AMOUNT))
    missing.push('a maximum purchase price')
  if (!(Number.isFinite(rate) && rate >= RATE_MIN && rate <= RATE_MAX)) missing.push('a rate')
  if (!(YMD.test(expiry) && !Number.isNaN(new Date(`${expiry}T00:00:00`).getTime()) && expiry >= todayYMD))
    missing.push('a rate-hold expiry in the future')
  if (!conditions || conditions.length < 3) missing.push('a conditions line')
  if (missing.length) return { ok: false, missing }
  return { ok: true, inputs: { maxPurchasePrice: price, ratePct: rate, rateHoldExpiry: expiry, conditions } }
}

/** A minted letter is valid to a client while its rate-hold has not passed. */
export function letterIsValid(snapshot: Pick<LetterSnapshot, 'inputs'>, todayYMD: string): boolean {
  return snapshot.inputs.rateHoldExpiry >= todayYMD
}

/** Freeze a letter snapshot. mintedBy/mintedAt come from the verified session. */
export function buildLetterSnapshot(args: {
  inputs: LetterInputs
  clientFirstName: string | null
  fileRef: string | null
  mintedBy: string
  mintedAt: string
}): LetterSnapshot {
  const base = {
    inputs: args.inputs,
    clientFirstName: args.clientFirstName,
    fileRef: args.fileRef,
    mintedBy: args.mintedBy,
    mintedAt: args.mintedAt,
  }
  return { ...base, snapshotHash: presentationHash(base) }
}

// ── Persistence row shapes ───────────────────────────────────────────────────
// Defined HERE, upstream of both lib/client-presentation-store.ts and
// lib/demo-fixtures.ts, so neither creates an import cycle (client-presentation
// imports only engines + config + type-only underwriting).

export interface ScenarioRow {
  id: string
  zohoDealId: string
  fileRef: string | null
  label: string
  inputs: ScenarioInputs
  figures: ScenarioFigures
  inputsHash: string
  calcVersion: number
  published: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}
export interface OfferRow {
  id: string
  zohoDealId: string
  fileRef: string | null
  quoteId: string
  snapshot: OfferSnapshot
  published: boolean
  createdBy: string
  createdAt: string
}
export interface LetterRow {
  id: string
  zohoDealId: string
  fileRef: string | null
  snapshot: LetterSnapshot
  rateHoldExpiry: string
  supersededAt: string | null
  createdBy: string
  createdAt: string
}
