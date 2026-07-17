'use client'

// Promo countdowns from the workbench knowledge base: every active offer
// with days remaining, soonest-expiring first (the API already sorts by
// expiry and never serves an expired offer). Amber inside 14 days.

import { useKnowledgeFetch } from '@/lib/knowledge-client'
import type { KnowledgeOffer } from '@/lib/gates'
import { OfferWindowBadge } from '@/components/admin/offer-display'

const AMBER_WITHIN_DAYS = 14

export default function PromoCountdowns({ lenderSlug }: { lenderSlug?: string }) {
  const { data, error, loading, retry } = useKnowledgeFetch<{ as_of: string; offers: KnowledgeOffer[] }>(
    '/api/portal/admin/knowledge/offers',
  )

  if (loading) return <p className="text-sm text-cool-400 font-ui py-2">Loading offers…</p>
  if (error) {
    return (
      <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        <p className="text-xs text-amber-800 font-ui">Offers unavailable: {error}</p>
        <button onClick={retry} className="shrink-0 text-xs font-semibold text-amber-800 underline py-1.5">
          Retry
        </button>
      </div>
    )
  }
  const offers = (data?.offers ?? []).filter(o => (lenderSlug ? o.lender === lenderSlug : true))
  if (offers.length === 0) {
    return (
      <p className="text-sm text-cool-400 font-ui py-2">
        No active offers{lenderSlug ? ' for this lender' : ''} right now. Expired offers are never
        shown.
      </p>
    )
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {offers.map((o, i) => {
        const noExpiry = !o.expiry
        const amber = typeof o.days_left === 'number' && o.days_left <= AMBER_WITHIN_DAYS
        const border = noExpiry
          ? 'border-red-300 bg-red-50'
          : amber
            ? 'border-amber-300 bg-amber-50'
            : 'border-cool-200 bg-white'
        return (
          <div key={`${o.lender}-${o.offer?.id ?? i}`} className={`border rounded-lg p-3 ${border}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-ui font-semibold text-navy">{o.lender_name}</span>
              <OfferWindowBadge
                variant="chip"
                started={null}
                expiry={(o.expiry as string | null) ?? null}
                daysLeft={typeof o.days_left === 'number' ? o.days_left : null}
              />
            </div>
            <p className="text-xs font-ui text-cool-600 mt-1">{o.offer?.description ?? 'Offer'}</p>
          </div>
        )
      })}
    </div>
  )
}
