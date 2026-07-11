// Shared client-safe types and pure helpers for the Rates tabs (v3). Types
// only from the server modules (erased at compile), so this stays importable
// from any client component without pulling server code.

import type { RateType } from '@/lib/scenario'

/** A knowledge-index lender entry as the /api/portal/admin/knowledge/lenders
 * proxy returns it. `quote_slugs` are the aliases the knowledge index
 * publishes (fox-underwriting micro-session 3); the cross-link uses exact
 * slug equality or a published alias and never invents a mapping. */
export interface KnowledgeLenderEntry {
  slug: string
  name: string
  as_of: string | null
  draft?: boolean
  quote_slugs?: string[]
}

/** The knowledge entry owning a quote slug: exact match or a published alias
 * only, never an invented mapping. */
export function matchKnowledge(
  lenders: KnowledgeLenderEntry[],
  quoteSlug: string,
): KnowledgeLenderEntry | null {
  return lenders.find(l => l.slug === quoteSlug || l.quote_slugs?.includes(quoteSlug)) ?? null
}

export const RATE_TYPE_ORDER: RateType[] = ['fixed', 'adjustable', 'variable']

/** Days-left tone for a promo countdown: red inside 5 days, amber inside 14,
 * calm otherwise. Shared by the promos board and the lender cards. */
export function promoTone(daysLeft: number): 'red' | 'amber' | 'calm' {
  if (daysLeft <= 5) return 'red'
  if (daysLeft <= 14) return 'amber'
  return 'calm'
}
