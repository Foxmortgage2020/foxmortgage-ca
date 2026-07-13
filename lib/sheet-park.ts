// Province-excluded sheet parking — pure, no I/O. Every new sheet from a
// lender whose registry provinces exclude EVERY serviceable market refills
// the approval queue with quotes Michael can only reject (the Kootenay loop:
// a fresh BC-only sheet arrives, extracts, and sits in pending). Those sheets
// are PARKED out of the actionable queue onto a visible shelf: nothing is
// deleted, nothing is decided, and the moment the registry confirms a
// serviceable province the same sheets return to pending on the next render
// (the park is re-derived from the registry every time, so release is
// automatic and needs no write).
//
// HONESTY NOTE (deviation from the ideal, stated): the brief asks for
// status='held' with held_reason='province_ineligible' plus an audit entry.
// The portal cannot write the workbench (database-enforced read-only role)
// and the rate-sheets gate vocabulary is approve|reject only — no hold. A
// true held-status at arrival time belongs in the fox-underwriting
// extraction pipeline (or a new gates hold action); until that lands, this
// deterministic presentation-layer park delivers the queue behavior, and the
// park is visible rather than audited.

import { resolveProvince, type ProvinceFact } from '@/lib/eligibility'

/** The markets the practice serves. A lender excluded from every one of
 * these has nothing Michael can approve today. Extend as the practice does. */
export const SERVICEABLE_PROVINCES: readonly string[] = ['ON']

export interface ParkVerdict {
  parked: boolean
  /** Plain reason for the shelf row (null when not parked). */
  reason: string | null
  /** The registry fact's as-of, so the shelf shows its provenance. */
  asOf: string | null
}

/** A sheet parks ONLY on a proven exclusion: the lender's registry provinces
 * are known and contain no serviceable market. Unknown or national never
 * parks (fail-open here on purpose — parking hides work from the queue, so
 * it takes affirmative registry evidence, the same posture as the client-doc
 * province gate but pointed the other way). */
export function provinceParkVerdict(
  lenderSlug: string | null,
  live?: Map<string, ProvinceFact> | null,
): ParkVerdict {
  if (!lenderSlug) return { parked: false, reason: null, asOf: null }
  const resolutions = SERVICEABLE_PROVINCES.map(p => resolveProvince(lenderSlug, p, live))
  const excludedEverywhere =
    resolutions.length > 0 && resolutions.every(r => r.status === 'ineligible')
  if (!excludedEverywhere) return { parked: false, reason: null, asOf: null }
  const first = resolutions[0]
  const where = Array.isArray(first.provinces) ? first.provinces.join(', ') : String(first.provinces)
  return {
    parked: true,
    reason: `Lends in ${where} only; not licensed in ${SERVICEABLE_PROVINCES.join(', ')}. Parked so the queue holds only decidable sheets; returns to pending if the registry confirms a serviceable province.`,
    asOf: first.asOf,
  }
}

export interface ParkedSheet<T> {
  card: T
  reason: string
  asOf: string | null
}

/** Partition a sheet queue into the actionable queue and the parked shelf. */
export function partitionSheetQueue<T extends { lenderSlug: string | null }>(
  cards: T[],
  live?: Map<string, ProvinceFact> | null,
): { actionable: T[]; parked: ParkedSheet<T>[] } {
  const actionable: T[] = []
  const parked: ParkedSheet<T>[] = []
  for (const card of cards) {
    const v = provinceParkVerdict(card.lenderSlug, live)
    if (v.parked) parked.push({ card, reason: v.reason!, asOf: v.asOf })
    else actionable.push(card)
  }
  return { actionable, parked }
}
