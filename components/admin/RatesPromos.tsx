'use client'

// Promos tab (Rates v3; the offers desk session brought it a real book). The
// offer board from the knowledge offers endpoint, sorted soonest-to-expire
// first, each card citing the announcement it came from. Now with the full
// priced elements, the extraction evidence where the endpoint carries it, and
// — the point of the offers session — a loud warning on any offer that has no
// stated expiry. A null-expiry offer looks different from a dated one, always.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { KnowledgeOffer } from '@/lib/gates'
import { type OfferShape } from '@/lib/scenario'
import { useKnowledgeFetch } from '@/lib/knowledge-client'
import LenderMark from '@/components/admin/LenderMark'
import { OfferConditions, OfferEvidenceList, OfferWindowBadge } from '@/components/admin/offer-display'
import { hasNoExpiry, normalizeEvidence, offerRatesText } from '@/lib/offers'
import { lenderDisplayName } from '@/config/lenders'
import { matchKnowledge, type KnowledgeLenderEntry } from '@/lib/rates-shared'

interface OfferTier {
  label?: string
  rate_pct?: { value?: number } | null
  comp_bps?: { value?: number } | null
  buydown_rate_pct?: { value?: number } | null
}

interface PricedTier {
  label: string
  rate: number
  compBps: number | null
  buydownRatePct: number | null
}

function pricedTiers(shape: OfferShape): PricedTier[] {
  const tiers = Array.isArray(shape.offer_rates) ? (shape.offer_rates as OfferTier[]) : []
  return tiers
    .filter(t => typeof t?.rate_pct?.value === 'number')
    .map(t => ({
      label: t.label ?? 'rate',
      rate: t.rate_pct!.value!,
      compBps: typeof t.comp_bps?.value === 'number' ? t.comp_bps.value : null,
      buydownRatePct: typeof t.buydown_rate_pct?.value === 'number' ? t.buydown_rate_pct.value : null,
    }))
}

// The knowledge type declares expiry as string, but a null-expiry offer is
// served with a null expiry and (possibly) a null days_left.
function offerExpiry(o: KnowledgeOffer): string | null {
  return (o.expiry as string | null) ?? null
}
function offerDaysLeft(o: KnowledgeOffer): number | null {
  return typeof o.days_left === 'number' ? o.days_left : null
}
function isActiveOffer(o: KnowledgeOffer): boolean {
  // No clock = always active (and loudly flagged). Otherwise still in window:
  // days_left === 0 (expires today) is still quotable, matching classifyWindow
  // where expired is only d < 0. Every surface must agree on this boundary.
  return hasNoExpiry(offerExpiry(o)) || (offerDaysLeft(o) ?? -1) >= 0
}

export default function RatesPromos() {
  const offersRes = useKnowledgeFetch<{ as_of: string; offers: KnowledgeOffer[] }>(
    '/api/portal/admin/knowledge/offers',
  )
  const knowledge = useKnowledgeFetch<{ lenders: KnowledgeLenderEntry[] }>(
    '/api/portal/admin/knowledge/lenders',
  )
  const knowledgeLenders = knowledge.data?.lenders ?? []
  const offersAsOf = offersRes.data?.as_of ?? null

  const [showExpired, setShowExpired] = useState(false)

  const { active, expired } = useMemo(() => {
    const all = offersRes.data?.offers ?? []
    const activeList = all.filter(isActiveOffer).sort((a, b) => {
      // Dated offers by soonest expiry; no-clock offers sort after (they have
      // no deadline to act on) but still carry the loud warning.
      const an = hasNoExpiry(offerExpiry(a))
      const bn = hasNoExpiry(offerExpiry(b))
      if (an && bn) return 0
      if (an) return 1
      if (bn) return -1
      return (offerDaysLeft(a) ?? 0) - (offerDaysLeft(b) ?? 0)
    })
    return { active: activeList, expired: all.filter(o => !isActiveOffer(o)) }
  }, [offersRes.data])

  const knowledgeFor = (slug: string) => matchKnowledge(knowledgeLenders, slug)

  if (offersRes.loading) {
    return <p className="text-sm text-gray-400 font-body">Loading the offer book…</p>
  }
  if (offersRes.error) {
    return (
      <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        <p className="text-xs text-amber-800 font-body">{offersRes.error}</p>
        <button onClick={offersRes.retry} className="shrink-0 text-xs font-semibold text-amber-800 underline py-1.5">
          Retry
        </button>
      </div>
    )
  }

  return (
    <div>
      <p className="text-sm text-gray-500 font-body mb-4">
        The live promo book, soonest to expire first. Approved offers come from the knowledge base,
        updated when Roam intel is reviewed on the approvals desk
        {offersAsOf ? `; as of ${offersAsOf}` : ''}.
      </p>

      {active.length === 0 ? (
        <p className="text-sm text-gray-500 font-body bg-white border border-gray-200 rounded-xl p-5">
          No active offers right now. They land here when an offer is approved on the desk.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" data-testid="promo-cards">
          {active.map((o, i) => (
            <PromoCard key={`${o.lender}-${i}`} offer={o} knowledge={knowledgeFor(o.lender)} offersAsOf={offersAsOf} />
          ))}
        </div>
      )}

      <div className="mt-6">
        <button
          onClick={() => setShowExpired(s => !s)}
          className="text-xs font-body font-semibold text-navy underline cursor-pointer"
          data-testid="expired-toggle"
        >
          {showExpired ? 'Hide' : 'Show'} recently expired offers
        </button>
        {showExpired && (
          <div className="mt-3" data-testid="promo-expired">
            {expired.length === 0 ? (
              <p className="text-xs text-gray-500 font-body bg-gray-50 border border-gray-200 rounded-lg p-3">
                No recently expired offers in the knowledge base right now. Auto-retired offers appear
                here as the offer book turns over.
              </p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {expired.map((o, i) => (
                  <PromoCard
                    key={`exp-${o.lender}-${i}`}
                    offer={o}
                    knowledge={knowledgeFor(o.lender)}
                    offersAsOf={offersAsOf}
                    expired
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function PromoCard({
  offer,
  knowledge,
  offersAsOf,
  expired = false,
}: {
  offer: KnowledgeOffer
  knowledge: KnowledgeLenderEntry | null
  offersAsOf: string | null
  expired?: boolean
}) {
  const [open, setOpen] = useState(false)
  const shape = offer.offer as OfferShape
  const tiers = pricedTiers(shape)
  const ratesText = offerRatesText(shape)
  const predicates = Array.isArray(shape.predicates)
    ? (shape.predicates as unknown[]).filter((p): p is string => typeof p === 'string')
    : []
  const evidence = normalizeEvidence((shape as { evidence?: unknown }).evidence)
  const provenance = typeof shape.provenance === 'string' ? shape.provenance : null
  const name = offer.lender_name || knowledge?.name || lenderDisplayName(offer.lender)
  const started = typeof shape.started === 'string' ? shape.started : null
  const expiry = offerExpiry(offer)
  const daysLeft = offerDaysLeft(offer)
  const linkSlug = knowledge?.quote_slugs?.[0] ?? offer.lender

  const eligibility = (shape.eligibility ?? null) as
    | { required_product?: string | null; closing_within_days?: number | null; application_window_start?: string | null }
    | null

  return (
    <div
      className={`border rounded-xl p-4 ${expired ? 'bg-gray-50 border-gray-200 opacity-90' : 'bg-white border-gray-200'}`}
      data-testid={`promo-card-${offer.lender}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-2 min-w-0">
          <LenderMark slug={offer.lender} name={name} size={28} />
          <span className="font-heading font-bold text-navy truncate">{name}</span>
        </span>
        {expired && <span className="text-[11px] font-semibold text-gray-500 shrink-0">expired {expiry}</span>}
      </div>

      {/* The window, loud. A null expiry is a red warning, never a dash. */}
      {!expired && (
        <div className="mt-2">
          <OfferWindowBadge started={started} expiry={expiry} daysLeft={daysLeft} />
        </div>
      )}

      <p className="text-sm font-body font-semibold text-navy mt-2">{shape.description ?? 'Promo offer'}</p>

      {/* Priced elements. */}
      {tiers.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {tiers.map((t, i) => (
            <span key={i} className="text-xs font-body bg-lime/20 border border-lime/50 rounded-full px-2 py-0.5 text-navy">
              {t.label}: <span className="font-heading font-bold">{t.rate.toFixed(2)}%</span>
              {t.compBps !== null ? ` · ${t.compBps} bps` : ''}
              {t.buydownRatePct !== null ? ` · buydown to ${t.buydownRatePct.toFixed(2)}%` : ''}
            </span>
          ))}
        </div>
      ) : ratesText ? (
        <p className="text-xs font-body text-navy mt-2">
          <span className="text-gray-500">Extracted: </span>
          <span className="font-semibold">{ratesText}</span>
        </p>
      ) : null}

      {/* Conditions summary from structured eligibility. */}
      <div className="mt-2 text-xs text-gray-600 font-body space-y-0.5">
        {eligibility?.required_product && <p>Requires {eligibility.required_product}.</p>}
        {typeof eligibility?.closing_within_days === 'number' && (
          <p>Closing within {eligibility.closing_within_days} days of application.</p>
        )}
        {eligibility?.application_window_start && expiry && (
          <p>Applications from {eligibility.application_window_start} to {expiry}.</p>
        )}
        {started && <p className="text-gray-400">Effective {started}.</p>}
      </div>

      {/* Extraction evidence where the endpoint carries it. */}
      <OfferEvidenceList evidence={evidence} />

      {/* Full conditions, verbatim. */}
      {predicates.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setOpen(o => !o)}
            className="text-xs font-semibold text-navy underline cursor-pointer"
            data-testid={`promo-conditions-${offer.lender}`}
          >
            {open ? 'Hide' : 'Show'} full conditions ({predicates.length})
          </button>
          {open && <OfferConditions conditions={predicates} />}
        </div>
      )}

      <p className="text-[11px] text-gray-400 font-body mt-2">
        From the lender announcement{provenance ? ` (${provenance})` : ''}, knowledge base
        {offersAsOf ? ` as of ${offersAsOf}` : ''}. Not a rate sheet row; it has no sheet approval
        provenance.
      </p>

      {!expired && (
        <div className="flex flex-wrap gap-2 mt-3">
          <Link
            href={`/portal/admin/rates?tab=lenders&lender=${encodeURIComponent(linkSlug)}`}
            className="text-xs font-semibold text-navy border border-navy/30 rounded-lg px-2.5 py-1 hover:border-navy"
          >
            Open lender
          </Link>
          <Link
            href={`/portal/admin/rates?tab=scenario&lender=${encodeURIComponent(linkSlug)}`}
            className="text-xs font-semibold bg-navy text-white rounded-lg px-2.5 py-1 hover:bg-navy/90"
          >
            Test against a deal
          </Link>
        </div>
      )}
    </div>
  )
}
