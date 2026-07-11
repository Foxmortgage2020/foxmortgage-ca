// Lenders-tab model (Rates v3): pure functions from the approved book to
// the browse cards and the honest three-state coverage map. No scenario
// required — this answers "where does this lender sit today".
//
// Honesty rules carried from the scenario model:
//   - A card never prints one unqualified "lowest rate": on a scenario-free
//     card that is the cheapest product regardless of who can get it, and
//     that is the number that gets misquoted on a call. Cards print the best
//     approved FIXED rate PER product class the lender actually offers, and
//     the deepest floating DISCOUNT separately.
//   - Adjustable and variable are different products and never merge: their
//     deepest discounts are reported as separate lines.
//   - Cash back tiers are their own rows and never a headline rate; a card
//     only flags that cash back exists.
//   - Only approved rows are quotable. Pending (extracted) sheets and
//     intel-only lenders appear as counts and nudges, never as numbers.

import { PRODUCT_CLASSES, TEST_LENDER_SLUG, type RateType } from '@/lib/scenario'
import { lenderDisplayName } from '@/config/lenders'
import type { RateQuoteFullRow } from '@/lib/underwriting'

export const STALE_DAYS = 30

/** Minimal shapes so the model tests without the full workbench rows. */
export interface PendingSheetLite {
  lenderSlug: string | null
  quoteCount: number
}
export interface IntelItemLite {
  lenderSlugGuess: string | null
}

export interface LenderClassRate {
  productClass: string
  fromRate: number
}
export interface LenderFloatingBest {
  rateType: Extract<RateType, 'adjustable' | 'variable'>
  discount: number
}
export interface LenderCard {
  slug: string
  approvedCount: number
  newestAsOf: string | null
  stale: boolean
  /** Best approved FIXED printed rate per class the lender offers, in the
   * canonical class order. Cash back tiers excluded. */
  classRates: LenderClassRate[]
  /** Deepest approved floating discount, adjustable and variable kept
   * separate. Cash back tiers excluded. */
  floatingBest: LenderFloatingBest[]
  hasCashback: boolean
  /** Extracted sheets awaiting Michael's approval (a nudge, never a rate). */
  pendingCount: number
}

export interface LenderCoverage {
  live: LenderCard[]
  /** Lenders with extracted sheets in the queue and NO approved quotes yet. */
  awaiting: { slug: string; pendingCount: number }[]
  /** Lenders with intel captured (a sheet arrived) but no quotes and no
   * pending sheets — the format has no deterministic parser yet. */
  coveragePending: { slug: string }[]
}

/** Whole days between two YYYY-MM-DD dates (b - a). Both parse as UTC
 * midnight, so this is calendar-day exact and timezone-stable. */
function daysBetween(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`)
  const tb = Date.parse(`${b}T00:00:00Z`)
  if (Number.isNaN(ta) || Number.isNaN(tb)) return 0
  return Math.round((tb - ta) / 86_400_000)
}

const CLASS_ORDER = new Map(PRODUCT_CLASSES.map((c, i) => [c as string, i]))

/** One card per lender that has approved quotes. `todayYMD` (Toronto) drives
 * the staleness chip; pass the pending-sheet reviews to seed the awaiting
 * nudge on live cards. */
export function lenderCards(
  approved: RateQuoteFullRow[],
  todayYMD: string,
  pendingByLender: Map<string, number> = new Map(),
): LenderCard[] {
  const byLender = new Map<string, RateQuoteFullRow[]>()
  for (const q of approved) {
    // Only approved rows are quotable, and the reserved TEST lender never
    // mingles with live browse cards (same posture as the scenario matcher).
    if (q.status !== 'approved' || q.lenderSlug === TEST_LENDER_SLUG) continue
    if (!byLender.has(q.lenderSlug)) byLender.set(q.lenderSlug, [])
    byLender.get(q.lenderSlug)!.push(q)
  }

  const cards: LenderCard[] = []
  byLender.forEach((rows, slug) => {
    // Per-class best fixed printed rate (cash back tiers excluded).
    const bestByClass = new Map<string, number>()
    for (const q of rows) {
      if (q.rateType !== 'fixed' || q.rate === null || q.cashbackPct !== null) continue
      const cur = bestByClass.get(q.productClass)
      if (cur === undefined || q.rate < cur) bestByClass.set(q.productClass, q.rate)
    }
    const classRates: LenderClassRate[] = Array.from(bestByClass.entries())
      .map(([productClass, fromRate]) => ({ productClass, fromRate }))
      .sort((a, b) => (CLASS_ORDER.get(a.productClass) ?? 99) - (CLASS_ORDER.get(b.productClass) ?? 99))

    // Deepest floating discount, adjustable and variable kept apart.
    const deepest = new Map<'adjustable' | 'variable', number>()
    for (const q of rows) {
      if (q.rateType === 'fixed' || q.primeVariance === null || q.cashbackPct !== null) continue
      const rt = q.rateType
      const cur = deepest.get(rt)
      if (cur === undefined || q.primeVariance < cur) deepest.set(rt, q.primeVariance)
    }
    const floatingBest: LenderFloatingBest[] = (['adjustable', 'variable'] as const)
      .filter(rt => deepest.has(rt))
      .map(rt => ({ rateType: rt, discount: deepest.get(rt)! }))

    const dated = rows.map(q => q.asOfDate).filter((d): d is string => Boolean(d))
    const newestAsOf = dated.length ? dated.sort().at(-1)! : null
    const stale = newestAsOf !== null && daysBetween(newestAsOf, todayYMD) > STALE_DAYS

    cards.push({
      slug,
      approvedCount: rows.length,
      newestAsOf,
      stale,
      classRates,
      floatingBest,
      hasCashback: rows.some(q => q.cashbackPct !== null),
      pendingCount: pendingByLender.get(slug) ?? 0,
    })
  })
  return cards.sort((a, b) => lenderDisplayName(a.slug).localeCompare(lenderDisplayName(b.slug)))
}

/** Aggregate pending sheet reviews to a per-lender extracted-quote count.
 * Sheets whose lender is an unresolved ingest guess (null) are dropped —
 * a null-lender nudge would point nowhere. */
export function pendingByLenderMap(pending: PendingSheetLite[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const p of pending) {
    if (!p.lenderSlug || p.lenderSlug === TEST_LENDER_SLUG) continue
    m.set(p.lenderSlug, (m.get(p.lenderSlug) ?? 0) + Math.max(0, p.quoteCount))
  }
  return m
}

export type LenderSort = 'name' | 'newest' | 'products' | 'insured'

export const LENDER_SORTS: { value: LenderSort; label: string }[] = [
  { value: 'name', label: 'Lender name' },
  { value: 'newest', label: 'Newest sheet' },
  { value: 'products', label: 'Most products' },
  { value: 'insured', label: 'Best insured rate' },
]

function insuredFrom(c: LenderCard): number | null {
  return c.classRates.find(r => r.productClass === 'insured')?.fromRate ?? null
}

/** Sort the live cards. Name is the default; the other keys push the
 * un-answerable rows (no date, no insured rate) honestly to the end. */
export function sortLenderCards(cards: LenderCard[], sort: LenderSort): LenderCard[] {
  const byName = (a: LenderCard, b: LenderCard) =>
    lenderDisplayName(a.slug).localeCompare(lenderDisplayName(b.slug))
  const out = [...cards]
  switch (sort) {
    case 'newest':
      return out.sort((a, b) => {
        if (a.newestAsOf && b.newestAsOf && a.newestAsOf !== b.newestAsOf) {
          return a.newestAsOf < b.newestAsOf ? 1 : -1
        }
        if (!a.newestAsOf && b.newestAsOf) return 1
        if (a.newestAsOf && !b.newestAsOf) return -1
        return byName(a, b)
      })
    case 'products':
      return out.sort((a, b) => b.approvedCount - a.approvedCount || byName(a, b))
    case 'insured':
      return out.sort((a, b) => {
        const ia = insuredFrom(a)
        const ib = insuredFrom(b)
        if (ia !== null && ib !== null && ia !== ib) return ia - ib
        if (ia === null && ib !== null) return 1
        if (ia !== null && ib === null) return -1
        return byName(a, b)
      })
    default:
      return out.sort(byName)
  }
}

/** The three honest coverage states, all disjoint. A live lender that also
 * has pending sheets keeps its live card (with a pendingCount nudge) and is
 * NOT double-listed under awaiting. */
export function lenderCoverage(
  approved: RateQuoteFullRow[],
  pending: PendingSheetLite[],
  intel: IntelItemLite[],
  todayYMD: string,
): LenderCoverage {
  const pendingMap = pendingByLenderMap(pending)
  const live = lenderCards(approved, todayYMD, pendingMap)
  const liveSlugs = new Set(live.map(c => c.slug))

  const awaiting = Array.from(pendingMap.entries())
    .filter(([slug]) => !liveSlugs.has(slug))
    .map(([slug, pendingCount]) => ({ slug, pendingCount }))
    .sort((a, b) => b.pendingCount - a.pendingCount || lenderDisplayName(a.slug).localeCompare(lenderDisplayName(b.slug)))

  const awaitingSlugs = new Set(awaiting.map(a => a.slug))
  const intelSlugs = new Set(
    intel
      .map(i => i.lenderSlugGuess)
      .filter((s): s is string => Boolean(s) && s !== TEST_LENDER_SLUG),
  )
  const coveragePending = Array.from(intelSlugs)
    .filter(slug => !liveSlugs.has(slug) && !awaitingSlugs.has(slug))
    .map(slug => ({ slug }))
    .sort((a, b) => lenderDisplayName(a.slug).localeCompare(lenderDisplayName(b.slug)))

  return { live, awaiting, coveragePending }
}
