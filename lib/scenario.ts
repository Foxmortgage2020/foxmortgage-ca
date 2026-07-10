// The Rates v2 scenario model (Session 5): pure functions from a described
// deal to the approved quotes that can serve it. Grounded in the July 2026
// rate_quotes dimension inventory (see CLAUDE.md): insurance class
// (product_class) and term are fully populated; LTV bands, rental use, and
// Mortgage Plus amortization markers ride the sparse `variant` column.
// Honesty rule from the brief: a quote missing an optional dimension still
// matches every scenario it cannot be ruled out of, and the match carries
// an "assumed" note the UI renders as a tooltip. Nothing here invents
// lending rules; explicit markers rule quotes in or out, absence matches.

import { monthlyPayment } from '@/lib/mortgage-engine'
import type { RateQuoteFullRow } from '@/lib/underwriting'

export const PURPOSES = ['purchase', 'transfer', 'refinance', 'renewal'] as const
export type Purpose = (typeof PURPOSES)[number]

export const OCCUPANCIES = ['owner_occupied', 'rental'] as const
export type Occupancy = (typeof OCCUPANCIES)[number]

export const INSURANCE_CLASSES = ['conventional', 'insurable', 'insured'] as const
export type InsuranceClass = (typeof INSURANCE_CLASSES)[number]

export const AMORTIZATIONS = [25, 30] as const
export type AmortizationYears = (typeof AMORTIZATIONS)[number]

// The reserved test lender slug: TEST rows never mingle with live results.
export const TEST_LENDER_SLUG = 'test-portal'

export interface Scenario {
  purpose: Purpose
  occupancy: Occupancy
  insuranceClass: InsuranceClass
  /** null = any term */
  termMonths: number | null
  /** Mortgage amount in dollars; null until entered. */
  amount: number | null
  /** Property value in dollars; null until entered. */
  propertyValue: number | null
  amortizationYears: AmortizationYears
}

export const DEFAULT_SCENARIO: Scenario = {
  purpose: 'purchase',
  occupancy: 'owner_occupied',
  insuranceClass: 'insurable',
  termMonths: 60,
  amount: null,
  propertyValue: null,
  amortizationYears: 25,
}

/** Derived and locked: LTV is never editable. Two decimals. */
export function ltvPct(s: Pick<Scenario, 'amount' | 'propertyValue'>): number | null {
  if (!s.amount || !s.propertyValue || s.amount <= 0 || s.propertyValue <= 0) return null
  return Math.round((s.amount / s.propertyValue) * 10000) / 100
}

// ─── Variant classification ─────────────────────────────────────────────────
// The variant column carries three families today (inventory 2026-07-10):
// LTV bands (ltv<=65, ltv65-70, ltv70-75, ltv75-80), rental-use markers
// (rental, second-home-rental), and Scotia's Mortgage Plus product markers
// (mortgage-plus, mortgage-plus-25yr, mortgage-plus-30yr). Anything new is
// classified 'other' and can never be ruled out, only noted.

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
  if (q.productClass !== s.insuranceClass) return null
  if (s.termMonths !== null && q.termMonths !== s.termMonths) return null

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
  lowestRate: number
  /** Matches sorted lowest rate first. */
  matches: QuoteMatch[]
  anyAssumed: boolean
}

/** Lender cards for level 1, sorted by lowest matching rate, always. */
export function lenderResults(quotes: RateQuoteFullRow[], s: Scenario): LenderResult[] {
  const byLender = new Map<string, QuoteMatch[]>()
  for (const q of quotes) {
    const m = matchQuote(q, s)
    if (!m) continue
    if (!byLender.has(q.lenderSlug)) byLender.set(q.lenderSlug, [])
    byLender.get(q.lenderSlug)!.push(m)
  }
  const results: LenderResult[] = []
  byLender.forEach((matches, lenderSlug) => {
    matches.sort((a, b) => a.quote.rate - b.quote.rate || a.quote.termMonths - b.quote.termMonths)
    results.push({
      lenderSlug,
      count: matches.length,
      lowestRate: matches[0].quote.rate,
      matches,
      anyAssumed: matches.some(m => m.assumed.length > 0),
    })
  })
  return results.sort((a, b) => a.lowestRate - b.lowestRate || a.lenderSlug.localeCompare(b.lenderSlug))
}

// ─── Offers (promo chips) ────────────────────────────────────────────────────
// Offers come from the knowledge base with structured eligibility where the
// profile carries it. The mapping to quotes is lender-slug based and exact:
// the portal never invents a slug alias (the knowledge index publishing
// quote_slugs aliases is a fox-underwriting follow-up; until it lands,
// lenders whose quote slug has no knowledge page simply show no chip).

const OFFER_PURPOSE: Record<Purpose, string> = {
  purchase: 'purchase',
  transfer: 'switch',
  refinance: 'refi',
  renewal: 'renewal',
}

export interface OfferEligibilityShape {
  purposes?: string[]
  occupancy?: string
}

/** Whether an offer can apply to the scenario. Offers without structured
 * eligibility cannot be ruled out and return 'unknown'. */
export function offerFitsScenario(
  eligibility: OfferEligibilityShape | null | undefined,
  s: Scenario,
): 'fits' | 'ruled_out' | 'unknown' {
  if (!eligibility || !Array.isArray(eligibility.purposes)) return 'unknown'
  if (!eligibility.purposes.includes(OFFER_PURPOSE[s.purpose])) return 'ruled_out'
  if (eligibility.occupancy === 'owner_occupied' && s.occupancy !== 'owner_occupied') return 'ruled_out'
  return 'fits'
}

// ─── Payments ────────────────────────────────────────────────────────────────
// Reuses the validated calculator core (lib/mortgage-engine.ts shares its
// semi-annual compounding with every public calculator; validated to the
// cent against the reference app). Never re-derived here.

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

/** The self-describing line above results, in screenshots and the PDF.
 * Example: "Transfer, owner occupied, $1.16M at 80% LTV, 3yr fixed, 25yr
 * amortization, insurable". Every quote in the current set is a fixed rate
 * (the extraction pass covers fixed terms only), so "fixed" is stated. */
export function summaryLine(s: Scenario): string {
  const parts: string[] = [PURPOSE_LABEL[s.purpose], OCCUPANCY_LABEL[s.occupancy]]
  const pct = ltvPct(s)
  if (s.amount && pct !== null) {
    parts.push(`${fmtMoneyShort(s.amount)} at ${pct % 1 === 0 ? pct : pct.toFixed(2)}% LTV`)
  } else if (s.amount) {
    parts.push(fmtMoneyShort(s.amount))
  }
  parts.push(s.termMonths !== null ? `${termLabel(s.termMonths)} fixed` : 'any term, fixed')
  parts.push(`${s.amortizationYears}yr amortization`)
  parts.push(s.insuranceClass)
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
    class: s.insuranceClass,
    am: String(s.amortizationYears),
  }
  if (s.termMonths !== null) p.term = String(s.termMonths)
  if (s.amount) p.amount = String(s.amount)
  if (s.propertyValue) p.value = String(s.propertyValue)
  return p
}

/**
 * Deal room prefill (Part 4): the scenario params a deal's stored data
 * supports, nothing more. Reads only; the caller renders a link. Purpose
 * maps only where the deal_type vocabulary states it; amount and value
 * prefill when recorded; the insurance class prefills to insured only when
 * the derived LTV is above 80 (everything else stays the user's call, and
 * the banner says to check every value).
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
  const insuranceClass =
    INSURANCE_CLASSES.find(x => x === one('class')) ?? DEFAULT_SCENARIO.insuranceClass
  const am = num('am')
  return {
    purpose,
    occupancy,
    insuranceClass,
    termMonths: num('term'),
    amount: num('amount'),
    propertyValue: num('value'),
    amortizationYears: am === 30 ? 30 : 25,
  }
}
