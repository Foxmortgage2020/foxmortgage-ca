'use client'

// Promos tab (Rates v3): the offer book as its own board, from the knowledge
// offers endpoint. Cards sort by expiry ascending, amber inside 14 days and
// red inside 5. Each card cites the announcement it came from as provenance,
// never a sheet, and expands to the full conditions verbatim. Two actions per
// card: open the lender, and open a Scenario to test the offer against a deal.
//
// The workbench serves only ACTIVE offers (expired ones are never returned),
// so the recently-expired toggle renders the honest attempt-and-fallback
// state: it lights up with real rows the moment the endpoint begins returning
// recently-expired entries, and never invents them.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { KnowledgeOffer } from '@/lib/gates'
import { type OfferShape } from '@/lib/scenario'
import { useKnowledgeFetch } from '@/lib/knowledge-client'
import LenderMark from '@/components/admin/LenderMark'
import { lenderDisplayName } from '@/config/lenders'
import { matchKnowledge, promoTone, type KnowledgeLenderEntry } from '@/lib/rates-shared'

interface OfferTier {
  label?: string
  rate_pct?: { value?: number } | null
}

function pricedTiers(shape: OfferShape): { label: string; rate: number }[] {
  const tiers = Array.isArray(shape.offer_rates) ? (shape.offer_rates as OfferTier[]) : []
  return tiers
    .filter(t => typeof t?.rate_pct?.value === 'number')
    .map(t => ({ label: t.label ?? 'rate', rate: t.rate_pct!.value! }))
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
    const sorted = [...all].sort((a, b) => a.days_left - b.days_left)
    return {
      active: sorted.filter(o => o.days_left > 0),
      expired: sorted.filter(o => o.days_left <= 0),
    }
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
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <p className="text-sm text-gray-500 font-body">
          The live promo book, soonest to expire first. Active offers come from the knowledge base,
          updated when Roam intel is reviewed
          {offersAsOf ? `; as of ${offersAsOf}` : ''}.
        </p>
      </div>

      {active.length === 0 ? (
        <p className="text-sm text-gray-500 font-body bg-white border border-gray-200 rounded-xl p-5">
          No active offers right now. They land here when a lender announcement is reviewed in the
          knowledge base.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" data-testid="promo-cards">
          {active.map((o, i) => (
            <PromoCard key={`${o.lender}-${i}`} offer={o} knowledge={knowledgeFor(o.lender)} offersAsOf={offersAsOf} />
          ))}
        </div>
      )}

      {/* Recently expired: honest attempt-and-fallback over an endpoint that
          serves only active offers today. */}
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
                The knowledge base serves only active offers today, so recently expired promos are not
                retained here yet. This list fills in on its own once the offers endpoint begins
                returning recently-expired entries.
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
  const predicates = Array.isArray(shape.predicates)
    ? (shape.predicates as unknown[]).filter((p): p is string => typeof p === 'string')
    : []
  const provenance = typeof shape.provenance === 'string' ? shape.provenance : null
  const name = offer.lender_name || knowledge?.name || lenderDisplayName(offer.lender)
  const tone = expired ? 'calm' : promoTone(offer.days_left)
  const toneCls =
    tone === 'red' ? 'bg-red-100 text-red-800' : tone === 'amber' ? 'bg-amber-100 text-amber-900' : 'bg-gray-100 text-gray-600'
  // Prefer the quote-slug alias for the Lenders/Scenario deep links so the
  // target keys resolve; fall back to the offer's own slug.
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
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${toneCls}`}>
          {expired ? `expired ${offer.expiry}` : `${offer.days_left}d left`}
        </span>
      </div>

      <p className="text-sm font-body font-semibold text-navy mt-2">
        {shape.description ?? 'Promo offer'}
      </p>

      {tiers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {tiers.map((t, i) => (
            <span key={i} className="text-xs font-body bg-lime/20 border border-lime/50 rounded-full px-2 py-0.5 text-navy">
              {t.label}: <span className="font-heading font-bold">{t.rate.toFixed(2)}%</span>
            </span>
          ))}
        </div>
      )}

      {/* Conditions summary */}
      <div className="mt-2 text-xs text-gray-600 font-body space-y-0.5">
        {eligibility?.required_product && <p>Requires {eligibility.required_product}.</p>}
        {typeof eligibility?.closing_within_days === 'number' && (
          <p>Closing within {eligibility.closing_within_days} days of application.</p>
        )}
        {eligibility?.application_window_start && (
          <p>Applications from {eligibility.application_window_start} to {offer.expiry}.</p>
        )}
        {shape.started && <p className="text-gray-400">Effective {shape.started}.</p>}
      </div>

      {predicates.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setOpen(o => !o)}
            className="text-xs font-semibold text-navy underline cursor-pointer"
            data-testid={`promo-conditions-${offer.lender}`}
          >
            {open ? 'Hide' : 'Show'} full conditions ({predicates.length})
          </button>
          {open && (
            <ul className="mt-1 space-y-1 text-xs text-gray-700 font-body list-disc pl-4">
              {predicates.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
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
