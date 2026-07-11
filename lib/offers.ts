// The offers model (the offers desk session): pure functions shared by the
// Offers approval queue, the Promos board, the scenario engine, and the
// client PDF. An offer's priced identity, its extraction evidence, and — the
// one that matters most — its WINDOW.
//
// Honesty rules carried from the rates surfaces:
//   - Approved-only anywhere a figure is quotable. Pending offers are counts
//     and queue badges, never quotable rates.
//   - Adjustable and variable are never conflated. rate_type may also be
//     'mixed' or absent on an offer; those render honestly, never forced into
//     one of the three.
//   - A missing expiry is the single most dangerous field on an offer: with
//     no clock it outlives its own terms. It is NEVER a quiet dash. Every
//     surface renders the loud no-expiry state.

import { fmtDiscount, termLabel, type QuotePricingShape, type RateType } from '@/lib/scenario'

export const RATE_TYPES_STRICT: RateType[] = ['fixed', 'adjustable', 'variable']

/** One extracted element's citation, as lender_offers.evidence stores it and
 * the statement-review cards render theirs. */
export interface OfferEvidenceItem {
  page: number | null
  field: string
  value: string
  snippet: string
  confidence: number | null
}

export function normalizeEvidence(raw: unknown): OfferEvidenceItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
    .map(e => ({
      page: typeof e.page === 'number' ? e.page : null,
      field: typeof e.field === 'string' ? e.field : 'element',
      value: typeof e.value === 'string' ? e.value : '',
      snippet: typeof e.snippet === 'string' ? e.snippet : '',
      confidence: typeof e.confidence === 'number' ? e.confidence : null,
    }))
}

// ─── The window ──────────────────────────────────────────────────────────────

export type OfferWindow =
  | {
      kind: 'dated'
      started: string | null
      expiry: string
      daysLeft: number
      tone: 'red' | 'amber' | 'calm'
      expired: boolean
    }
  // The loud state: no stated end date. Will not auto-retire; confirm before
  // quoting. Never rendered as a dash.
  | { kind: 'no-expiry'; started: string | null }

/** Whole days from a YYYY-MM-DD to an expiry date (expiry - today). */
export function daysUntil(todayYMD: string, expiry: string): number {
  const a = Date.parse(`${todayYMD}T00:00:00Z`)
  const b = Date.parse(`${expiry}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86_400_000)
}

/** Classify an offer's window. Pass a precomputed daysLeft (e.g. the
 * knowledge endpoint's days_left) or compute it with daysUntil. A null expiry
 * is always the loud no-expiry state. */
export function classifyWindow(
  started: string | null,
  expiry: string | null,
  daysLeft: number | null,
): OfferWindow {
  if (!expiry) return { kind: 'no-expiry', started }
  const d = daysLeft ?? 0
  return {
    kind: 'dated',
    started,
    expiry,
    daysLeft: d,
    tone: d <= 5 ? 'red' : d <= 14 ? 'amber' : 'calm',
    expired: d < 0,
  }
}

/** True when this offer carries no clock. The single check every surface uses
 * so the loud state can never be forgotten on one of them. */
export function hasNoExpiry(expiry: string | null | undefined): boolean {
  return !expiry
}

export const NO_EXPIRY_WARNING =
  'No stated end date. This offer will not auto-retire; confirm it is still live before quoting.'

// ─── Priced identity ─────────────────────────────────────────────────────────

/** A pricing shape for the rate-display atoms, when the offer carries a clean
 * numeric rate or discount on one of the three strict rate types. Returns null
 * for cashback-only, mixed, absent, or text-only priced offers, whose priced
 * identity renders from the fields below instead. */
export function offerPricingShape(offer: {
  lenderSlug: string
  rate: number | null
  rateType: string | null
  primeVariance: number | null
}): QuotePricingShape | null {
  const rt = offer.rateType
  if (rt !== 'fixed' && rt !== 'adjustable' && rt !== 'variable') return null
  if (offer.rate === null && offer.primeVariance === null) return null
  return {
    lenderSlug: offer.lenderSlug,
    rateType: rt,
    rate: offer.rate,
    primeVariance: offer.primeVariance,
  }
}

/** The cash back line for an offer: the percentage where structured, else the
 * verbatim amount text, else null. Cash back is its own element, never folded
 * into a rate. */
export function offerCashbackLabel(cashbackPct: number | null, cashbackAmountText: string | null): string | null {
  if (cashbackPct !== null) return `${cashbackPct}% cash back`
  if (cashbackAmountText && cashbackAmountText.trim()) return cashbackAmountText.trim()
  return null
}

/** Terms as a compact label: a single term, a list, or null. */
export function offerTermsLabel(termMonths: number | null, termMonthsList: number[] | null): string | null {
  if (Array.isArray(termMonthsList) && termMonthsList.length > 0) {
    return termMonthsList.map(termLabel).join(', ')
  }
  if (termMonths !== null) return termLabel(termMonths)
  return null
}

/** A neutral label for a rate type that may fall outside the strict three
 * ('mixed', absent). Never coerces mixed into fixed. */
export function offerRateTypeLabel(rateType: string | null): string | null {
  if (!rateType) return null
  if (rateType === 'mixed') return 'Mixed rates'
  const strict: Record<string, string> = { fixed: 'Fixed', adjustable: 'Adjustable', variable: 'Variable' }
  return strict[rateType] ?? rateType
}

/** The extracted priced text (offer_payload.rates_or_amounts.value), the
 * honest fallback when no clean numeric priced element could be normalized. */
export function offerRatesText(offerPayload: unknown): string | null {
  if (typeof offerPayload !== 'object' || offerPayload === null) return null
  const roa = (offerPayload as Record<string, unknown>).rates_or_amounts
  if (typeof roa !== 'object' || roa === null) return null
  const v = (roa as Record<string, unknown>).value
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/** Signed discount label, re-exported so surfaces price offers the P−0.80 way. */
export function discountText(variance: number): string {
  return fmtDiscount(variance)
}
