'use client'

// Shared offer rendering (the offers desk session): the priced identity, the
// extraction evidence, and the window. Used by the Offers approval queue, the
// Promos board, the scenario promo chips, and the lender pages, so an offer
// looks the same everywhere and — the point of the exercise — a missing
// expiry is unmistakable on every one of them.

import { useState } from 'react'
import { productClassLabel, quoteRateDisplay, type RatesReference } from '@/lib/scenario'
import {
  classifyWindow,
  offerCashbackLabel,
  offerPricingShape,
  offerRateTypeLabel,
  offerTermsLabel,
  NO_EXPIRY_WARNING,
  type OfferEvidenceItem,
} from '@/lib/offers'
import { CashbackChip, RateHeadline, TypeBadge } from '@/components/admin/rate-display'
import { fmtShortDate } from '@/lib/dates'

// ─── The window ──────────────────────────────────────────────────────────────

/** The window, rendered loudly. A null expiry is never a dash: it is a red
 * warning that this offer will not auto-retire. `daysLeft` is precomputed by
 * the caller (the knowledge endpoint's days_left, or daysUntil(today, expiry)).
 * The `banner` variant is for full-width cards; `chip` is for promo chips. */
export function OfferWindowBadge({
  started,
  expiry,
  daysLeft,
  variant = 'banner',
}: {
  started: string | null
  expiry: string | null
  daysLeft: number | null
  variant?: 'banner' | 'chip'
}) {
  const w = classifyWindow(started, expiry, daysLeft)

  if (w.kind === 'no-expiry') {
    if (variant === 'chip') {
      return (
        <span
          className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-300"
          title={NO_EXPIRY_WARNING}
          data-testid="offer-no-expiry"
        >
          <span aria-hidden>&#9888;</span> no end date
        </span>
      )
    }
    return (
      <div
        className="flex items-start gap-2 rounded-lg border-2 border-red-300 bg-red-50 px-3 py-2"
        data-testid="offer-no-expiry"
      >
        <span aria-hidden className="text-red-600 text-base leading-none mt-0.5">
          &#9888;
        </span>
        <p className="text-xs font-body font-semibold text-red-800">
          No stated end date. This offer will not auto-retire; confirm it is still live before quoting.
          {w.started ? ` Started ${fmtShortDate(w.started)}.` : ''}
        </p>
      </div>
    )
  }

  const toneCls =
    w.tone === 'red'
      ? 'bg-red-100 text-red-800'
      : w.tone === 'amber'
        ? 'bg-amber-100 text-amber-900'
        : 'bg-gray-100 text-gray-600'
  const label = w.expired
    ? `expired ${fmtShortDate(w.expiry)}`
    : `${w.daysLeft} day${w.daysLeft === 1 ? '' : 's'} left, expires ${fmtShortDate(w.expiry)}`

  if (variant === 'chip') {
    return <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${toneCls}`}>{label}</span>
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${toneCls}`}>{label}</span>
      {w.started && <span className="text-[11px] text-gray-500 font-body">started {fmtShortDate(w.started)}</span>}
    </div>
  )
}

// ─── Priced identity ─────────────────────────────────────────────────────────

export interface OfferPricingFields {
  lenderSlug: string
  rate: number | null
  rateType: string | null
  primeVariance: number | null
  cashbackPct: number | null
  cashbackAmountText: string | null
  productClass: string | null
  termMonths: number | null
  termMonthsList: number[] | null
  /** offer_payload.rates_or_amounts.value, the honest fallback text. */
  ratesText: string | null
}

/** The offer's priced elements as identity, not a blob: a clean rate/discount
 * where one normalized (reusing the rate atoms so it matches the sheets),
 * cash back as its own chip, terms and class beside it, and the extracted
 * priced text as the honest fallback where nothing clean normalized. */
export function OfferPricedElements({
  offer,
  reference,
}: {
  offer: OfferPricingFields
  reference: RatesReference | null
}) {
  const shape = offerPricingShape(offer)
  const display = shape ? quoteRateDisplay(shape, reference) : null
  const cashback = offerCashbackLabel(offer.cashbackPct, offer.cashbackAmountText)
  const terms = offerTermsLabel(offer.termMonths, offer.termMonthsList)
  const rtLabel = offerRateTypeLabel(offer.rateType)

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
        {rtLabel && shape && offer.rateType !== 'fixed' && (
          <TypeBadge
            rateType={offer.rateType as 'adjustable' | 'variable'}
            reference={reference}
            lenderSlug={offer.lenderSlug}
          />
        )}
        {rtLabel && (!shape || offer.rateType === 'fixed' || offer.rateType === 'mixed') && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{rtLabel}</span>
        )}
        {offer.productClass && (
          <span className="text-[11px] text-gray-500 font-body capitalize">{productClassLabel(offer.productClass)}</span>
        )}
        {terms && <span className="text-[11px] text-gray-500 font-body">{terms}</span>}
        {cashback && <CashbackChip pct={offer.cashbackPct} />}
        {cashback && offer.cashbackPct === null && (
          <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
            {cashback}
          </span>
        )}
      </div>
      <div className="text-right shrink-0">
        {display ? (
          <RateHeadline display={display} size="md" />
        ) : offer.ratesText ? (
          <div>
            <p className="font-heading font-bold text-navy text-lg break-words max-w-[220px]">{offer.ratesText}</p>
            <p className="text-[10px] text-gray-400 font-body">as extracted</p>
          </div>
        ) : (
          <p className="text-xs text-gray-400 font-body">no priced figure extracted</p>
        )}
      </div>
    </div>
  )
}

// ─── Conditions (verbatim) ───────────────────────────────────────────────────

export function OfferConditions({ conditions }: { conditions: string[] }) {
  if (!conditions.length) return null
  return (
    <ul className="mt-1 space-y-1 text-xs text-gray-700 font-body list-disc pl-4">
      {conditions.map((c, i) => (
        <li key={i} className="break-words">
          {c}
        </li>
      ))}
    </ul>
  )
}

// ─── Extraction evidence (statement-review style) ────────────────────────────

/** Every extracted element with its verbatim snippet and page citation, the
 * way the statement review cards show theirs — the approval is of evidence,
 * not of a summary. */
export function OfferEvidenceList({ evidence }: { evidence: OfferEvidenceItem[] }) {
  const [open, setOpen] = useState(false)
  if (!evidence.length) return null
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-xs font-semibold text-navy underline cursor-pointer"
        data-testid="offer-evidence-toggle"
      >
        {open ? 'Hide' : 'Show'} extraction evidence ({evidence.length})
      </button>
      {open && (
        <div className="mt-2 divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {evidence.map((e, i) => (
            <div key={i} className="px-3 py-2">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="text-[11px] font-semibold text-gray-500 font-body">{e.field}</span>
                <span className="text-sm font-body text-navy break-words min-w-0">{e.value}</span>
                {e.confidence !== null && <span className="text-[11px] text-gray-400">conf {e.confidence}</span>}
              </div>
              <p className="text-[11px] text-gray-500 font-body mt-0.5 break-words">
                {e.page !== null ? `p${e.page}: ` : ''}&ldquo;{e.snippet}&rdquo;
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
