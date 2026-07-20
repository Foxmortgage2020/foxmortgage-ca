// Pure ranking and grouping for the global command palette (cmd-K). No
// fetch, no next/*, no Clerk — everything here is deterministic and
// unit-tested (tests/search.test.ts). The API route and the client palette
// both consume these functions so ranking is identical on both sides.
//
// Honesty over hanging: every group carries an explicit SourceStatus so the
// UI can say "Couldn't reach Zoho" (degraded) rather than spin forever, and
// distinguish that from a source that simply returned nothing (empty).

import type { WorkbenchDeal } from '@/lib/underwriting'
import type { SlimDeal } from '@/lib/zoho-admin'

// 'askfox' is the palette's hand-off row: anything unresolved goes to the
// practice agent as a question (one box, two talents). 'lender' jumps straight
// into the Rates by-lender view for that lender.
export type SearchResultType = 'nav' | 'deal' | 'contact' | 'partner' | 'lender' | 'knowledge' | 'askfox'

export interface SearchResult {
  type: SearchResultType
  id: string
  title: string
  subtitle?: string
  href: string
  badge?: string
}

export type SourceStatus = 'ok' | 'empty' | 'degraded'

export interface SearchGroup {
  type: SearchResultType
  label: string
  status: SourceStatus
  results: SearchResult[]
}

// Trim, collapse internal whitespace, lowercase for case-insensitive matching.
export function normalizeQuery(q: string): string {
  return q.trim().replace(/\s+/g, ' ').toLowerCase()
}

// Minimal nav item shape the palette hands in. Items are already
// permission-filtered by the shell before they reach here.
export interface NavItemLike {
  label: string
  href: string
  iconKey?: string
  description?: string
}

// Rank navigation by label startsWith (0) > label includes (1) >
// description includes (2). Empty query returns nothing (the palette shows
// the full nav list itself when the box is empty).
export function filterNav(navItems: NavItemLike[], q: string): SearchResult[] {
  const nq = normalizeQuery(q)
  if (!nq) return []
  const scored: { rank: number; item: NavItemLike }[] = []
  for (const item of navItems) {
    const label = item.label.toLowerCase()
    const desc = (item.description ?? '').toLowerCase()
    let rank = -1
    if (label.startsWith(nq)) rank = 0
    else if (label.includes(nq)) rank = 1
    else if (desc.includes(nq)) rank = 2
    if (rank < 0) continue
    scored.push({ rank, item })
  }
  scored.sort((a, b) => a.rank - b.rank || a.item.label.localeCompare(b.item.label))
  return scored.map(({ item }) => ({
    type: 'nav',
    id: item.href,
    title: item.label,
    subtitle: item.description,
    href: item.href,
  }))
}

// A lender the palette can jump to. The shell passes these already gated on
// rates.view, so a role that cannot see Rates simply never receives any to
// search (the group is then absent, like Partners for a role without access).
export interface LenderTarget {
  slug: string
  name: string
}

// Rank lenders by display name / slug for the palette's "Lenders" group. A
// match jumps into the Rates tab's by-lender view for that lender. Name
// startsWith (0) beats a name-or-slug includes (1); ties break alphabetically.
// Capped so a bare "a" does not flood the panel. Empty query returns nothing.
export function rankLenders(lenders: LenderTarget[], q: string, limit = 8): SearchResult[] {
  const nq = normalizeQuery(q)
  if (!nq) return []
  const scored: { rank: number; target: LenderTarget }[] = []
  for (const t of lenders) {
    const name = t.name.toLowerCase()
    const slug = t.slug.toLowerCase()
    let rank = -1
    if (name.startsWith(nq)) rank = 0
    else if (name.includes(nq) || slug.includes(nq)) rank = 1
    if (rank < 0) continue
    scored.push({ rank, target: t })
  }
  scored.sort((a, b) => a.rank - b.rank || a.target.name.localeCompare(b.target.name))
  return scored.slice(0, limit).map(({ target }) => ({
    type: 'lender',
    id: `lender:${target.slug}`,
    title: target.name,
    subtitle: 'Rates · by lender',
    href: `/portal/admin/lenders?tab=rates&view=lenders&lender=${encodeURIComponent(target.slug)}`,
  }))
}

function dealSubtitle(fileRef: string | null, stage: string | null): string | undefined {
  const parts = [fileRef, stage].filter((p): p is string => Boolean(p))
  return parts.length ? parts.join(' · ') : undefined
}

// Join workbench file refs with Zoho deal names and rank deal matches. A
// deal matches when the query appears in its file ref OR its Zoho name.
// Workbench rows carry the deal-room id, so a matched workbench deal links
// straight to its room; a Zoho-only match (no workbench row) links to the
// deals list pre-filtered by name. Deals joined by zoho_potential_id appear
// exactly once (the Zoho row is consumed by the workbench pass).
export function rankDeals(workbench: WorkbenchDeal[], zohoSlim: SlimDeal[], q: string): SearchResult[] {
  const nq = normalizeQuery(q)
  if (!nq) return []
  const zohoById = new Map(zohoSlim.map(z => [z.id, z]))
  const usedZohoIds = new Set<string>()
  const seen = new Set<string>()
  const results: SearchResult[] = []

  // Workbench deals first — they own the deal-room id, and joining to Zoho
  // (via zoho_potential_id) lets one row carry both the file ref and the name.
  for (const w of workbench) {
    const z = w.zohoPotentialId ? zohoById.get(w.zohoPotentialId) : undefined
    const dealName = z?.dealName ?? null
    const hay = [w.fileRef, dealName].filter(Boolean).join(' ').toLowerCase()
    if (!hay.includes(nq)) continue
    if (seen.has(w.id)) continue
    seen.add(w.id)
    if (z) usedZohoIds.add(z.id)
    results.push({
      type: 'deal',
      id: w.id,
      title: dealName ?? w.fileRef,
      subtitle: dealSubtitle(w.fileRef, w.stage ?? z?.stage ?? null),
      href: `/portal/admin/deals/${w.id}`,
    })
  }

  // Zoho-only matches (name match, no workbench counterpart consumed above).
  for (const z of zohoSlim) {
    if (usedZohoIds.has(z.id)) continue
    if (!z.dealName.toLowerCase().includes(nq)) continue
    const key = `z:${z.id}`
    if (seen.has(key)) continue
    seen.add(key)
    results.push({
      type: 'deal',
      id: z.id,
      title: z.dealName,
      subtitle: dealSubtitle(null, z.stage || null),
      href: `/portal/admin/deals?q=${encodeURIComponent(z.dealName)}`,
    })
  }
  return results
}

// One group's raw material: its already-ranked results, plus whether its
// source errored (or timed out). groupResults turns that into a status.
export interface GroupInput {
  type: SearchResultType
  label: string
  results: SearchResult[]
  errored?: boolean
}

// A source that errored is 'degraded' regardless of result count; otherwise
// zero results is 'empty' and any results is 'ok'.
export function groupResults(inputs: GroupInput[]): SearchGroup[] {
  return inputs.map(g => ({
    type: g.type,
    label: g.label,
    status: g.errored ? 'degraded' : g.results.length === 0 ? 'empty' : 'ok',
    results: g.results,
  }))
}
