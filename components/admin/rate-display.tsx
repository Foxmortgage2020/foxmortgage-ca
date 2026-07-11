'use client'

// Shared rate-display atoms for the Rates tabs (v3). Extracted from
// RatesScenario so the Lenders and Promos tabs render rates with the exact
// same honesty: fixed plain; floating leads with the printed discount and
// labels the effective rate with the prime as-of it used; adjustable and
// variable badge distinctly and never mix; cash back is its own chip, never a
// headline.

import {
  RATE_TYPE_LABEL,
  conventionText,
  fmtDiscount,
  mechanismForLender,
  mechanismPending,
  type QuoteRateDisplay,
  type RateType,
  type RatesReference,
} from '@/lib/scenario'

export function variantLabel(variant: string | null): string {
  if (!variant) return 'standard'
  return variant.replace(/-/g, ' ').replace('ltv', 'LTV ')
}

// Adjustable and variable are different client-facing products: the badge
// colors and words never mix, and each carries the mechanism explanation from
// the rates-reference payload as its tooltip.
export function TypeBadge({
  rateType,
  reference,
  lenderSlug,
  size = 'sm',
}: {
  rateType: 'fixed' | 'adjustable' | 'variable'
  reference: RatesReference | null
  lenderSlug: string
  size?: 'sm' | 'md'
}) {
  if (rateType === 'fixed') return null
  const note = mechanismForLender(reference, lenderSlug)
  const pending = mechanismPending(note)
  const base = note?.note ?? conventionText(reference, rateType) ?? 'Mechanism note not loaded yet.'
  const tip = `${base}${note?.as_of ? ` (note as of ${note.as_of})` : ''}${
    pending ? ' Pending lender confirmation.' : ''
  }`
  const cls =
    rateType === 'adjustable'
      ? 'bg-sky-100 text-sky-900 border border-sky-200'
      : 'bg-violet-100 text-violet-900 border border-violet-200'
  return (
    <span
      title={tip}
      aria-label={tip}
      className={`inline-flex items-center gap-1 rounded-full font-semibold cursor-help ${cls} ${
        size === 'md' ? 'text-xs px-2.5 py-1' : 'text-[11px] px-2 py-0.5'
      }`}
      data-testid={`type-badge-${rateType}`}
    >
      {RATE_TYPE_LABEL[rateType]}
      {pending && <span className="opacity-70">(mechanism pending)</span>}
    </span>
  )
}

export function CashbackChip({ pct }: { pct: number | null }) {
  if (pct === null) return null
  return (
    <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
      {pct}% cash back
    </span>
  )
}

// The rate as it renders everywhere: fixed plain, floating discount-first with
// the effective rate labeled by the prime as-of it used, and the honest
// prime-unavailable state when the reference is unreachable.
export function rateSubline(d: QuoteRateDisplay): string | null {
  switch (d.kind) {
    case 'floating-printed':
      return `${d.rate.toFixed(2)}% printed on the sheet`
    case 'floating-computed':
      return `effective ${d.effective.toFixed(2)}% at prime ${d.primeValue.toFixed(2)}% as of ${d.primeAsOf}${
        d.overridden ? ' (lender prime)' : ''
      }`
    case 'floating-no-prime':
      return 'prime unavailable, discount shown alone'
    default:
      return null
  }
}

export function rateHeadlineText(d: QuoteRateDisplay): string {
  switch (d.kind) {
    case 'fixed':
      return `${d.rate.toFixed(2)}%`
    case 'floating-printed':
      return d.discount !== null ? fmtDiscount(d.discount) : `${d.rate.toFixed(2)}%`
    case 'floating-computed':
    case 'floating-no-prime':
      return fmtDiscount(d.discount)
    case 'unpriced':
      return 'not priced'
  }
}

export function RateHeadline({ display, size = 'lg' }: { display: QuoteRateDisplay; size?: 'lg' | 'md' }) {
  const sub = rateSubline(display)
  return (
    <div className="text-right">
      <p className={`font-heading font-bold text-navy ${size === 'lg' ? 'text-3xl' : 'text-2xl'}`}>
        {rateHeadlineText(display)}
      </p>
      {sub && <p className="text-[11px] text-gray-500 font-body mt-0.5 max-w-[180px]">{sub}</p>}
    </div>
  )
}

// One-line rate string for the compare tray, the product detail dl, and
// screenshots. Same vocabulary as RateHeadline, compact.
export function rateLineText(d: QuoteRateDisplay): string {
  switch (d.kind) {
    case 'fixed':
      return `${d.rate.toFixed(2)}%`
    case 'floating-printed':
      return `${d.discount !== null ? `${fmtDiscount(d.discount)}, ` : ''}${d.rate.toFixed(2)}% printed on the sheet`
    case 'floating-computed':
      return `${fmtDiscount(d.discount)}, effective ${d.effective.toFixed(2)}% at prime ${d.primeValue.toFixed(2)}% as of ${d.primeAsOf}${d.overridden ? ' (lender prime)' : ''}`
    case 'floating-no-prime':
      return `${fmtDiscount(d.discount)}, prime unavailable`
    case 'unpriced':
      return 'not priced'
  }
}

/** The deepest-discount label for a floating headline: "P−1.05" style. */
export function discountLabel(variance: number): string {
  return fmtDiscount(variance)
}

export const RATE_TYPE_GROUPS: { rateType: RateType; label: string }[] = [
  { rateType: 'fixed', label: 'Fixed' },
  { rateType: 'adjustable', label: 'Adjustable' },
  { rateType: 'variable', label: 'Variable' },
]
