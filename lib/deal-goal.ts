// Deal-type vs Finmo-goal honesty (2026-07-16). The deals row's `deal_type` can
// disagree with the Finmo application's `goal` (BRXM-F053107: the record says
// purchase, Finmo says refinance). The deal header must NOT present the record's
// type as unqualified fact when the two conflict; it shows the Finmo goal with a
// conflict marker. Display only — the deals row is corrected at source in Zoho by
// Michael; this file writes nothing.
//
// The shape mapping mirrors the workbench's dealShapeOf (fox-underwriting
// src/skills/notes/lenderNotesSnapshot.ts) so the portal and the note agree on
// what "conflict" means. Kept as a small local copy (the portal never imports
// workbench code, guardrail 8).

export type DealShape = 'purchase' | 'refinance' | 'renewal' | 'other'

export function dealShapeOf(value: string | null | undefined): DealShape {
  const g = (value ?? '').toLowerCase()
  if (/refinanc|refi\b|equity[\s-]?take|take[\s-]?out/.test(g)) return 'refinance'
  if (/renew/.test(g)) return 'renewal'
  if (/switch|transfer/.test(g)) return 'renewal'
  if (/purchas|buy/.test(g)) return 'purchase'
  return 'other'
}

const titleize = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export interface DealGoalDisplay {
  /** True only when BOTH the record type and the Finmo goal map to a KNOWN and
   * DIFFERENT shape — an unknown on either side is not a conflict. */
  conflict: boolean
  /** The friendly label to show as the primary chip: the Finmo goal on a
   * conflict, else the record type. */
  primaryLabel: string
  dealTypeLabel: string
  goalLabel: string | null
}

/**
 * What the deal-type chip should show. On a conflict the PRIMARY label is the
 * Finmo goal (never the record type presented as fact), with the record type
 * carried as the marker.
 */
export function dealGoalDisplay(dealType: string | null | undefined, finmoGoal: string | null | undefined): DealGoalDisplay {
  const dealTypeLabel = dealType && dealType.trim() ? titleize(dealType) : 'Unknown'
  const goalLabel = finmoGoal && finmoGoal.trim() ? titleize(finmoGoal) : null
  const ds = dealShapeOf(dealType)
  const gs = dealShapeOf(finmoGoal)
  const conflict = !!goalLabel && ds !== 'other' && gs !== 'other' && ds !== gs
  return { conflict, primaryLabel: conflict ? goalLabel! : dealTypeLabel, dealTypeLabel, goalLabel }
}
