// The Rates scenario model (Session 5, floating vocabulary Session 6):
// pure functions from a described deal to the approved quotes that can
// serve it. Grounded in the July 2026 rate_quotes dimension inventory
// (see CLAUDE.md): product class and term are fully populated; LTV bands,
// rental use, and program markers ride the sparse `variant` column; since
// migration 0029 every quote carries rate_type (fixed | adjustable |
// variable), a signed prime_variance for floating rows, and cash back
// tiers as their own rows (cashback_pct + program_notes).
//
// Honesty rules (the brief, both sessions):
//   - A quote missing an optional dimension still matches every scenario
//     it cannot be ruled out of, and the match carries an "assumed" note.
//   - Effective rates for floating quotes are COMPUTED AT DISPLAY TIME as
//     prime + variance against the served rates-reference (per-lender
//     override first), always labeled with the prime as-of used. When the
//     reference is unreachable the discount renders alone with an honest
//     prime-unavailable state; a stale or guessed effective rate never
//     renders. A quote whose sheet printed its own effective rate displays
//     the printed figure (UnionLink prints both).
//   - Adjustable and variable are different client-facing products and are
//     never collapsed in sorting or display.
//   - A cash back tier is its own row and never the lender's headline.

import { monthlyPayment } from '@/lib/mortgage-engine'
import type { RateQuoteFullRow } from '@/lib/underwriting'

export const PURPOSES = ['purchase', 'transfer', 'refinance', 'renewal'] as const
export type Purpose = (typeof PURPOSES)[number]

export const OCCUPANCIES = ['owner_occupied', 'rental'] as const
export type Occupancy = (typeof OCCUPANCIES)[number]

// product_class as the July 2026 book actually stores it: the insurance
// trio plus the expansion classes (b-side, heloc, reverse, other) the
// variable-rates extraction pass introduced. Exact match only; a class
// the scenario does not name never silently leaks into results.
export const PRODUCT_CLASSES = [
  'conventional',
  'insurable',
  'insured',
  'b_side',
  'heloc',
  'reverse',
  'other',
] as const
export type ProductClass = (typeof PRODUCT_CLASSES)[number]

export const RATE_TYPES = ['fixed', 'adjustable', 'variable'] as const
export type RateType = (typeof RATE_TYPES)[number]

export const CASHBACK_FILTERS = ['any', 'only', 'none'] as const
export type CashbackFilter = (typeof CASHBACK_FILTERS)[number]

export const AMORTIZATIONS = [25, 30] as const
export type AmortizationYears = (typeof AMORTIZATIONS)[number]

// The reserved test lender slug: TEST rows never mingle with live results.
export const TEST_LENDER_SLUG = 'test-portal'

export interface Scenario {
  purpose: Purpose
  occupancy: Occupancy
  productClass: ProductClass
  /** null = any term */
  termMonths: number | null
  /** null = every rate type; set = only that mechanism (three-way split). */
  rateType: RateType | null
  cashback: CashbackFilter
  /** Mortgage amount in dollars; null until entered. */
  amount: number | null
  /** Property value in dollars; null until entered. */
  propertyValue: number | null
  amortizationYears: AmortizationYears
}

export const DEFAULT_SCENARIO: Scenario = {
  purpose: 'purchase',
  occupancy: 'owner_occupied',
  productClass: 'insurable',
  termMonths: 60,
  rateType: null,
  cashback: 'any',
  amount: null,
  propertyValue: null,
  amortizationYears: 25,
}

/** Derived and locked: LTV is never editable. Two decimals. */
export function ltvPct(s: Pick<Scenario, 'amount' | 'propertyValue'>): number | null {
  if (!s.amount || !s.propertyValue || s.amount <= 0 || s.propertyValue <= 0) return null
  return Math.round((s.amount / s.propertyValue) * 10000) / 100
}

// ─── Rates reference (prime, mechanisms) ────────────────────────────────────
// Shape served by GET /api/knowledge/rates-reference (fox-underwriting
// docs/gates-api.md, variable-rates session). The portal computes with it
// and never stores a computed figure anywhere.

export interface PrimeValue {
  value: number
  as_of: string
  source?: string
  note?: string
}

export interface MechanismNote {
  product_label: string
  rate_type: string
  payment_behaviour: string
  /** 'printed_label_plus_convention' means the note awaits lender
   * documentation: render the pending-confirmation caveat. */
  basis: string
  note: string
  source: string
  as_of: string
}

export interface RatesReference {
  prime: PrimeValue
  lender_overrides?: Record<string, PrimeValue>
  prime_notes?: string
  floating_mechanisms?: {
    convention?: { adjustable?: string; variable?: string; source?: string }
    lenders?: Record<string, MechanismNote>
  }
  quote_slug_coverage?: { mapped?: Record<string, string[]>; unmapped?: string[] }
}

/** The knowledge slug owning a quote slug, from the served coverage map
 * only. Never an invented mapping. */
export function knowledgeSlugForQuoteSlug(ref: RatesReference | null, quoteSlug: string): string | null {
  const mapped = ref?.quote_slug_coverage?.mapped
  if (!mapped) return null
  for (const [owner, quoteSlugs] of Object.entries(mapped)) {
    if (Array.isArray(quoteSlugs) && quoteSlugs.includes(quoteSlug)) return owner
  }
  return null
}

/** The prime a lender's floating quotes price against: the per-lender
 * override when the reference records one (keyed by knowledge slug or the
 * quote slug itself), the base prime otherwise. Null when the reference
 * is unreachable. */
export function primeForLender(
  ref: RatesReference | null,
  quoteSlug: string,
): { value: number; asOf: string; overridden: boolean } | null {
  if (!ref?.prime || typeof ref.prime.value !== 'number') return null
  const overrides = ref.lender_overrides ?? {}
  const owner = knowledgeSlugForQuoteSlug(ref, quoteSlug)
  const override = overrides[quoteSlug] ?? (owner ? overrides[owner] : undefined)
  if (override && typeof override.value === 'number') {
    return { value: override.value, asOf: override.as_of, overridden: true }
  }
  return { value: ref.prime.value, asOf: ref.prime.as_of, overridden: false }
}

/** The payment-mechanism note for a lender's floating products, from the
 * reference payload only (never the sheet label). Looks up by quote slug,
 * then by the published knowledge-slug mapping. */
export function mechanismForLender(ref: RatesReference | null, quoteSlug: string): MechanismNote | null {
  const lenders = ref?.floating_mechanisms?.lenders
  if (!lenders) return null
  if (lenders[quoteSlug]) return lenders[quoteSlug]
  const owner = knowledgeSlugForQuoteSlug(ref, quoteSlug)
  if (owner && lenders[owner]) return lenders[owner]
  return null
}

export function mechanismPending(note: MechanismNote | null): boolean {
  return note?.basis === 'printed_label_plus_convention'
}

/** The convention explanation for a rate type (UNDERWRITING.md 1.3 as
 * served). Used when a lender carries no specific note yet. */
export function conventionText(ref: RatesReference | null, rateType: RateType): string | null {
  const c = ref?.floating_mechanisms?.convention
  if (!c) return null
  if (rateType === 'adjustable') return c.adjustable ?? null
  if (rateType === 'variable') return c.variable ?? null
  return null
}

// Signed printed spread, formatted the way sheets read: P−1.05 for prime
// minus, P+0.45 for prime plus (alt sheets price above prime).
export function fmtDiscount(variance: number): string {
  const abs = Math.abs(variance).toFixed(2)
  if (variance < 0) return `P−${abs}`
  if (variance > 0) return `P+${abs}`
  return 'P+0.00'
}

/** What a quote's rate IS on screen, honestly. Fixed rows show their
 * printed rate. Floating rows lead with the discount; the effective rate
 * beside it is either the sheet's own printed figure or computed against
 * the served prime and labeled with that prime's as-of. With no reference
 * and no printed rate, the discount stands alone. */
export type QuoteRateDisplay =
  | { kind: 'fixed'; rate: number }
  | {
      kind: 'floating-printed'
      rateType: RateType
      discount: number | null
      rate: number
    }
  | {
      kind: 'floating-computed'
      rateType: RateType
      discount: number
      effective: number
      primeValue: number
      primeAsOf: string
      overridden: boolean
    }
  | { kind: 'floating-no-prime'; rateType: RateType; discount: number }
  // Defensive arm for a row that violates the priced check (should not
  // exist; the constraint refuses it at write time).
  | { kind: 'unpriced' }

export interface QuotePricingShape {
  lenderSlug: string
  rateType: RateType
  rate: number | null
  primeVariance: number | null
}

export function quoteRateDisplay(q: QuotePricingShape, ref: RatesReference | null): QuoteRateDisplay {
  if (q.rateType === 'fixed') {
    if (q.rate === null) return { kind: 'unpriced' }
    return { kind: 'fixed', rate: q.rate }
  }
  const rateType = q.rateType
  if (q.rate !== null) {
    return { kind: 'floating-printed', rateType, discount: q.primeVariance, rate: q.rate }
  }
  if (q.primeVariance === null) return { kind: 'unpriced' }
  const prime = primeForLender(ref, q.lenderSlug)
  if (!prime) return { kind: 'floating-no-prime', rateType, discount: q.primeVariance }
  return {
    kind: 'floating-computed',
    rateType,
    discount: q.primeVariance,
    effective: Math.round((prime.value + q.primeVariance) * 100) / 100,
    primeValue: prime.value,
    primeAsOf: prime.asOf,
    overridden: prime.overridden,
  }
}

/** The rate a quote sorts and pays at: printed for fixed and
 * printed-effective floating, computed effective otherwise, null when the
 * reference is unreachable and nothing printed (unsortable by rate). */
export function quoteEffectiveRate(q: QuotePricingShape, ref: RatesReference | null): number | null {
  const d = quoteRateDisplay(q, ref)
  switch (d.kind) {
    case 'fixed':
      return d.rate
    case 'floating-printed':
      return d.rate
    case 'floating-computed':
      return d.effective
    default:
      return null
  }
}

// ─── Variant classification ─────────────────────────────────────────────────
// The variant column's classified families (inventory 2026-07-10): LTV
// bands, rental-use markers, and Scotia's Mortgage Plus product markers.
// The variable-rates extraction pass added many program markers (beacon
// bands, physician, pmpp, fusion tiers, promo windows); those classify as
// 'other' and can never be ruled out, only noted.

export type VariantKind =
  | { kind: 'none' }
  | { kind: 'ltv'; min: number; max: number }
  | { kind: 'rental'; label: string }
  | { kind: 'mortgage-plus'; amortizationYears: number | null }
  | { kind: 'other'; raw: string }

export function classifyVariant(variant: string | null): VariantKind {
  if (!variant) return { kind: 'none' }
  const v = variant.trim().toLowerCase()
  if (v === 'ltv<=65') return { kind: 'ltv', min: 0, max: 65 }
  const band = /^ltv(\d{2})-(\d{2})$/.exec(v)
  if (band) return { kind: 'ltv', min: Number(band[1]), max: Number(band[2]) }
  if (v === 'rental' || v === 'second-home-rental') return { kind: 'rental', label: v }
  if (v === 'mortgage-plus') return { kind: 'mortgage-plus', amortizationYears: null }
  const plus = /^mortgage-plus-(\d{2})yr$/.exec(v)
  if (plus) return { kind: 'mortgage-plus', amortizationYears: Number(plus[1]) }
  return { kind: 'other', raw: variant }
}

// ─── Matching ────────────────────────────────────────────────────────────────

export interface QuoteMatch {
  quote: RateQuoteFullRow
  /** Sparse-dimension notes: why this quote could not be ruled out. Empty
   * means every scenario dimension was explicitly satisfied. */
  assumed: string[]
}

export function matchQuote(q: RateQuoteFullRow, s: Scenario): QuoteMatch | null {
  if (q.status !== 'approved') return null
  if (q.lenderSlug === TEST_LENDER_SLUG) return null
  if (q.productClass !== s.productClass) return null
  if (s.termMonths !== null && q.termMonths !== s.termMonths) return null
  // rate_type is fully populated (default fixed), so the three-way filter
  // is a hard dimension: no assumed note, no leakage across mechanisms.
  if (s.rateType !== null && q.rateType !== s.rateType) return null
  // cashback_pct is present-or-null by design: a tier is its own row.
  if (s.cashback === 'only' && q.cashbackPct === null) return null
  if (s.cashback === 'none' && q.cashbackPct !== null) return null

  const assumed: string[] = []
  const v = classifyVariant(q.variant)
  const pct = ltvPct(s)

  switch (v.kind) {
    case 'ltv': {
      if (pct === null) {
        assumed.push('Enter amount and property value to apply this LTV band.')
      } else if (!(pct > v.min && pct <= v.max)) {
        return null
      }
      break
    }
    case 'rental': {
      if (s.occupancy !== 'rental') return null
      break
    }
    case 'mortgage-plus': {
      if (v.amortizationYears !== null && v.amortizationYears !== s.amortizationYears) return null
      break
    }
    case 'other': {
      assumed.push(`Variant "${v.raw}" is not classified; the scenario cannot rule it out.`)
      break
    }
    case 'none': {
      if (pct !== null) assumed.push('No LTV split on this sheet; it prices all LTVs the same.')
      break
    }
  }

  // Rental scenarios: a quote without an explicit rental marker cannot be
  // ruled out (most sheets in the inventory carry no occupancy split).
  if (s.occupancy === 'rental' && v.kind !== 'rental') {
    assumed.push('This sheet does not state rental pricing; confirm with the lender.')
  }

  return { quote: q, assumed }
}

export interface LenderResult {
  lenderSlug: string
  count: number
  /** The lender's headline: its best non-cash-back match rendered
   * honestly. Null when only cash back tiers match (a cash back rate is
   * never presented as the lender's headline rate). */
  headline: QuoteRateDisplay | null
  /** Matches in display order (see sorting rules below). */
  matches: QuoteMatch[]
  anyAssumed: boolean
  cashbackCount: number
}

// Sorting contract (fox-underwriting docs/gates-api.md + the Session 6
// brief): floating-only views sort by deepest discount (most negative
// variance); mixed views sort by effective rate (printed for fixed,
// computed against served prime for floating). Floating rows whose
// effective rate cannot be computed (reference unreachable, nothing
// printed) sort after the priced rows, deepest discount first — never
// interleaved on a guess. Adjustable and variable are never collapsed:
// the tie-break keeps them adjacent but distinct.
function compareMatches(a: QuoteMatch, b: QuoteMatch, s: Scenario, ref: RatesReference | null): number {
  const qa = a.quote
  const qb = b.quote
  const floatingOnly = s.rateType === 'adjustable' || s.rateType === 'variable'
  if (floatingOnly) {
    const va = qa.primeVariance
    const vb = qb.primeVariance
    if (va !== null && vb !== null && va !== vb) return va - vb
    if (va === null && vb !== null) return 1
    if (va !== null && vb === null) return -1
    const ra = quoteEffectiveRate(qa, ref)
    const rb = quoteEffectiveRate(qb, ref)
    if (ra !== null && rb !== null && ra !== rb) return ra - rb
    return qa.termMonths - qb.termMonths
  }
  const ea = quoteEffectiveRate(qa, ref)
  const eb = quoteEffectiveRate(qb, ref)
  if (ea !== null && eb !== null && ea !== eb) return ea - eb
  if (ea === null && eb !== null) return 1
  if (ea !== null && eb === null) return -1
  if (ea === null && eb === null) {
    const va = qa.primeVariance ?? 0
    const vb = qb.primeVariance ?? 0
    if (va !== vb) return va - vb
  }
  if (qa.rateType !== qb.rateType) {
    return RATE_TYPES.indexOf(qa.rateType) - RATE_TYPES.indexOf(qb.rateType)
  }
  return qa.termMonths - qb.termMonths
}

/** Lender cards for level 1, best headline first. Pass the served
 * rates-reference when available; null keeps every fixed ranking exact
 * and sorts un-computable floating rows honestly last. */
export function lenderResults(
  quotes: RateQuoteFullRow[],
  s: Scenario,
  ref: RatesReference | null = null,
): LenderResult[] {
  const byLender = new Map<string, QuoteMatch[]>()
  for (const q of quotes) {
    const m = matchQuote(q, s)
    if (!m) continue
    if (!byLender.has(q.lenderSlug)) byLender.set(q.lenderSlug, [])
    byLender.get(q.lenderSlug)!.push(m)
  }
  const results: LenderResult[] = []
  byLender.forEach((matches, lenderSlug) => {
    matches.sort((a, b) => compareMatches(a, b, s, ref))
    const headlineMatch = matches.find(m => m.quote.cashbackPct === null) ?? null
    results.push({
      lenderSlug,
      count: matches.length,
      headline: headlineMatch ? quoteRateDisplay(headlineMatch.quote, ref) : null,
      matches,
      anyAssumed: matches.some(m => m.assumed.length > 0),
      cashbackCount: matches.filter(m => m.quote.cashbackPct !== null).length,
    })
  })
  const sortValue = (r: LenderResult): number | null => {
    const m = r.matches.find(x => x.quote.cashbackPct === null) ?? r.matches[0]
    return m ? quoteEffectiveRate(m.quote, ref) : null
  }
  return results.sort((a, b) => {
    const va = sortValue(a)
    const vb = sortValue(b)
    if (va !== null && vb !== null && va !== vb) return va - vb
    if (va === null && vb !== null) return 1
    if (va !== null && vb === null) return -1
    return a.lenderSlug.localeCompare(b.lenderSlug)
  })
}

// ─── Offers (promo results and chips) ───────────────────────────────────────
// Offers come from the knowledge base. Structured eligibility gates an
// offer on the scenario the same way the workbench's own assessOffer
// gates it on a deal: every evaluable structured gate must pass. Offers
// without structured eligibility can never auto-apply ('unknown'): they
// stay on the countdown strip, never inside scenario results. The mapping
// to quote slugs is the published one only, never invented.

const OFFER_PURPOSE: Record<Purpose, string> = {
  purchase: 'purchase',
  transfer: 'switch',
  refinance: 'refi',
  renewal: 'renewal',
}

export interface OfferEligibilityShape {
  purposes?: string[]
  occupancy?: string
  closing_within_days?: number | null
  amortization_years?: number[] | null
  required_product?: string | null
  application_window_start?: string | null
}

/** Whether an offer can apply to the scenario, over the structured gates
 * a scenario can evaluate (purpose, occupancy, amortization). Date gates
 * (closing window, application window) need a real deal and render as
 * conditions instead. Offers without structured eligibility return
 * 'unknown' and are never auto-applied. */
export function offerFitsScenario(
  eligibility: OfferEligibilityShape | null | undefined,
  s: Scenario,
): 'fits' | 'ruled_out' | 'unknown' {
  if (!eligibility || !Array.isArray(eligibility.purposes)) return 'unknown'
  if (!eligibility.purposes.includes(OFFER_PURPOSE[s.purpose])) return 'ruled_out'
  if (eligibility.occupancy === 'owner_occupied' && s.occupancy !== 'owner_occupied') return 'ruled_out'
  if (
    Array.isArray(eligibility.amortization_years) &&
    eligibility.amortization_years.length > 0 &&
    !eligibility.amortization_years.includes(s.amortizationYears)
  ) {
    return 'ruled_out'
  }
  return 'fits'
}

// A sourced figure as knowledge profiles store it: value + source + as-of.
interface SourcedNumber {
  value?: number
}

interface OfferRateTier {
  label?: string
  rate_pct?: SourcedNumber | null
  comp_bps?: SourcedNumber | null
  buydown_rate_pct?: SourcedNumber | null
  buydown_max_bps?: SourcedNumber | null
}

export interface OfferShape {
  id?: string
  description?: string
  predicates?: unknown
  started?: string
  expiry?: string
  provenance?: unknown
  eligibility?: OfferEligibilityShape | null
  offer_rates?: OfferRateTier[] | unknown
}

export interface OfferScenarioResult {
  offerId: string | null
  description: string
  /** The tier the scenario selects, label verbatim from the profile. */
  tierLabel: string
  ratePct: number
  compBps: number | null
  buydownRatePct: number | null
  buydownMaxBps: number | null
  requiredProduct: string | null
  closingWithinDays: number | null
  applicationWindowStart: string | null
  started: string | null
  predicates: string[]
}

/** A promo offer as a first-class scenario result: only when the
 * structured eligibility fits AND the offer carries structured rate
 * tiers. The tier follows the scenario's product class: insured picks the
 * default-insured tier where one exists; everything else picks the
 * non-insured tier. Nothing renders from prose alone. */
export function offerScenarioResult(offer: OfferShape, s: Scenario): OfferScenarioResult | null {
  if (offerFitsScenario(offer.eligibility ?? null, s) !== 'fits') return null
  const tiers = Array.isArray(offer.offer_rates) ? (offer.offer_rates as OfferRateTier[]) : []
  const priced = tiers.filter(t => typeof t?.rate_pct?.value === 'number')
  if (priced.length === 0) return null
  const insuredTier = priced.find(t => (t.label ?? '').toLowerCase().includes('insured'))
  const otherTier = priced.find(t => !(t.label ?? '').toLowerCase().includes('insured'))
  const tier = (s.productClass === 'insured' ? insuredTier ?? otherTier : otherTier ?? insuredTier)!
  const num = (v: SourcedNumber | null | undefined): number | null =>
    typeof v?.value === 'number' ? v.value : null
  return {
    offerId: offer.id ?? null,
    description: offer.description ?? 'Promo offer',
    tierLabel: tier.label ?? 'offer rate',
    ratePct: tier.rate_pct!.value!,
    compBps: num(tier.comp_bps),
    buydownRatePct: num(tier.buydown_rate_pct),
    buydownMaxBps: num(tier.buydown_max_bps),
    requiredProduct: offer.eligibility?.required_product ?? null,
    closingWithinDays: offer.eligibility?.closing_within_days ?? null,
    applicationWindowStart: offer.eligibility?.application_window_start ?? null,
    started: offer.started ?? null,
    predicates: Array.isArray(offer.predicates)
      ? (offer.predicates as unknown[]).filter((p): p is string => typeof p === 'string')
      : [],
  }
}

// ─── Payments ────────────────────────────────────────────────────────────────
// Reuses the validated calculator core (lib/mortgage-engine.ts shares its
// semi-annual compounding with every public calculator; validated to the
// cent against the reference app). Never re-derived here. Floating
// callers pass the effective rate (printed or computed-and-labeled);
// without one, no payment renders.

export function scenarioMonthlyPayment(s: Scenario, ratePct: number): number | null {
  if (!s.amount || s.amount <= 0) return null
  const raw = monthlyPayment(s.amount, ratePct, 'semi-annually', s.amortizationYears * 12)
  return Math.round(raw * 100) / 100
}

// ─── Display helpers ─────────────────────────────────────────────────────────

export function fmtMoneyShort(n: number): string {
  if (n >= 1_000_000) {
    const m = Math.round((n / 1_000_000) * 100) / 100
    return `$${m}M`
  }
  if (n >= 1_000) {
    const k = Math.round(n / 1_000)
    return `$${k}K`
  }
  return `$${n}`
}

export function fmtMoneyFull(n: number): string {
  return `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function termLabel(months: number): string {
  return months % 12 === 0 ? `${months / 12}yr` : `${months}mo`
}

export const RATE_TYPE_LABEL: Record<RateType, string> = {
  fixed: 'Fixed',
  adjustable: 'Adjustable',
  variable: 'Variable',
}

const PURPOSE_LABEL: Record<Purpose, string> = {
  purchase: 'Purchase',
  transfer: 'Transfer',
  refinance: 'Refinance',
  renewal: 'Renewal',
}

const OCCUPANCY_LABEL: Record<Occupancy, string> = {
  owner_occupied: 'owner occupied',
  rental: 'rental',
}

const CLASS_LABEL: Record<ProductClass, string> = {
  conventional: 'conventional',
  insurable: 'insurable',
  insured: 'insured',
  b_side: 'b side',
  heloc: 'heloc',
  reverse: 'reverse',
  other: 'other class',
}

export function productClassLabel(c: string): string {
  return CLASS_LABEL[c as ProductClass] ?? c.replace(/_/g, ' ')
}

/** The self-describing line above results, in screenshots and the PDF.
 * Example: "Transfer, owner occupied, $1.16M at 80% LTV, 3yr, any rate
 * type, 25yr amortization, insurable". The rate-type segment states the
 * three-way filter honestly instead of assuming fixed (the pre-0029 book
 * was fixed-only; the current book is not). */
export function summaryLine(s: Scenario): string {
  const parts: string[] = [PURPOSE_LABEL[s.purpose], OCCUPANCY_LABEL[s.occupancy]]
  const pct = ltvPct(s)
  if (s.amount && pct !== null) {
    parts.push(`${fmtMoneyShort(s.amount)} at ${pct % 1 === 0 ? pct : pct.toFixed(2)}% LTV`)
  } else if (s.amount) {
    parts.push(fmtMoneyShort(s.amount))
  }
  parts.push(s.termMonths !== null ? termLabel(s.termMonths) : 'any term')
  parts.push(s.rateType !== null ? `${s.rateType} only` : 'any rate type')
  if (s.cashback === 'only') parts.push('cash back tiers only')
  if (s.cashback === 'none') parts.push('no cash back')
  parts.push(`${s.amortizationYears}yr amortization`)
  parts.push(productClassLabel(s.productClass))
  return parts.join(', ')
}

// ─── URL round-trip ──────────────────────────────────────────────────────────
// The whole scenario lives in searchParams so back navigation preserves it,
// deal rooms can prefill by link, and every level is reachable without a
// pointer event (the UI test automation discipline).

export function scenarioToParams(s: Scenario): Record<string, string> {
  const p: Record<string, string> = {
    purpose: s.purpose,
    occupancy: s.occupancy,
    class: s.productClass,
    am: String(s.amortizationYears),
  }
  if (s.termMonths !== null) p.term = String(s.termMonths)
  if (s.rateType !== null) p.rt = s.rateType
  if (s.cashback !== 'any') p.cb = s.cashback
  if (s.amount) p.amount = String(s.amount)
  if (s.propertyValue) p.value = String(s.propertyValue)
  return p
}

/**
 * Deal room prefill (Session 5 Part 4): the scenario params a deal's
 * stored data supports, nothing more. Reads only; the caller renders a
 * link. Purpose maps only where the deal_type vocabulary states it;
 * amount and value prefill when recorded; the product class prefills to
 * insured only when the derived LTV is above 80 (everything else stays
 * the user's call, and the banner says to check every value).
 */
export function scenarioParamsFromDeal(deal: {
  fileRef: string
  dealType: string | null
  mortgageAmount: number | null
  purchasePrice: number | null
}): Record<string, string> {
  const p: Record<string, string> = { from: deal.fileRef }
  const purposeByType: Record<string, Purpose> = {
    purchase: 'purchase',
    refi: 'refinance',
    refinance: 'refinance',
    renewal: 'renewal',
    switch: 'transfer',
    transfer: 'transfer',
  }
  const purpose = deal.dealType ? purposeByType[deal.dealType] : undefined
  if (purpose) p.purpose = purpose
  if (deal.mortgageAmount && deal.mortgageAmount > 0) p.amount = String(deal.mortgageAmount)
  if (deal.purchasePrice && deal.purchasePrice > 0) p.value = String(deal.purchasePrice)
  const pct = ltvPct({ amount: deal.mortgageAmount, propertyValue: deal.purchasePrice })
  if (pct !== null && pct > 80) p.class = 'insured'
  return p
}

export function scenarioFromParams(sp: Record<string, string | string[] | undefined>): Scenario {
  const one = (k: string): string | undefined => {
    const v = sp[k]
    return typeof v === 'string' && v.length > 0 ? v : undefined
  }
  const num = (k: string): number | null => {
    const v = Number(one(k))
    return Number.isFinite(v) && v > 0 ? v : null
  }
  const purpose = PURPOSES.find(x => x === one('purpose')) ?? DEFAULT_SCENARIO.purpose
  const occupancy = OCCUPANCIES.find(x => x === one('occupancy')) ?? DEFAULT_SCENARIO.occupancy
  const productClass =
    PRODUCT_CLASSES.find(x => x === one('class')) ?? DEFAULT_SCENARIO.productClass
  const rateType = RATE_TYPES.find(x => x === one('rt')) ?? null
  const cashback = CASHBACK_FILTERS.find(x => x === one('cb')) ?? 'any'
  const am = num('am')
  return {
    purpose,
    occupancy,
    productClass,
    termMonths: num('term'),
    rateType,
    cashback,
    amount: num('amount'),
    propertyValue: num('value'),
    amortizationYears: am === 30 ? 30 : 25,
  }
}
