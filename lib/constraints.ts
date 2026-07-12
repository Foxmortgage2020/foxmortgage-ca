// Client lender constraints (Part 2). Per-client rules a rate sheet never
// knows: a prior bad experience, an existing banking relationship, a refusal to
// deal with an institution. Stored in FOXCA (lib/constraints-store.ts), keyed to
// the Zoho contact or household so they follow the client across every surface.
// Pure model here; the reason is the point, so every constraint carries one.
//
// Constraints NEVER override structural eligibility: applyConstraints runs over
// a list that province + program eligibility has ALREADY filtered, so requiring
// an ineligible lender yields an honest empty state, not a broken result.

export const CONSTRAINT_TYPES = ['excluded', 'required', 'preferred'] as const
export type ConstraintType = (typeof CONSTRAINT_TYPES)[number]

export const CONSTRAINT_LABEL: Record<ConstraintType, string> = {
  excluded: 'Excluded',
  required: 'Required',
  preferred: 'Preferred',
}
export const CONSTRAINT_HELP: Record<ConstraintType, string> = {
  excluded: 'Never show this lender for this client.',
  required: 'Show only this lender (or these lenders).',
  preferred: 'Show this lender first and highlight it, without excluding others.',
}

export function isConstraintType(x: unknown): x is ConstraintType {
  return typeof x === 'string' && (CONSTRAINT_TYPES as readonly string[]).includes(x)
}

export interface Constraint {
  id: string
  clientKey: string
  lenderSlug: string
  lenderLabel: string | null
  type: ConstraintType
  reason: string
  actingEmail: string
  createdAt: string
  retiredAt: string | null
  retiredBy: string | null
}

/** Active constraints only (retiredAt null). History is retained; retired
 * constraints stay visible in the timeline but never apply. */
export function activeConstraints(all: Constraint[]): Constraint[] {
  return all.filter(c => c.retiredAt == null)
}

export interface ConstraintApplication {
  /** Lender slugs to show, after constraints, in preference order. */
  visible: string[]
  /** Excluded slugs (by an 'excluded' constraint, or by a 'required' set that
   * does not include them). */
  excluded: { slug: string; reason: string }[]
  /** The required lender slugs, when any 'required' constraint is active. */
  required: string[]
  /** Preferred slugs (shown first / highlighted). */
  preferred: string[]
  /** A 'required' constraint whose lender is not in the eligible input list:
   * the honest empty/near-empty state (required lender cannot do the deal). */
  requiredButUnavailable: { slug: string; reason: string }[]
}

/**
 * Apply active constraints to an eligibility-filtered list of lender slugs.
 * Order of precedence: required (show only these) → excluded (hide) → preferred
 * (first). A required lender missing from the input (eligibility removed it) is
 * reported in requiredButUnavailable so the UI explains the empty result rather
 * than showing a wrong one.
 */
export function applyConstraints(eligibleSlugs: string[], active: Constraint[]): ConstraintApplication {
  const inList = new Set(eligibleSlugs)
  const excludedC = active.filter(c => c.type === 'excluded')
  const requiredC = active.filter(c => c.type === 'required')
  const preferredC = active.filter(c => c.type === 'preferred')

  const excluded: { slug: string; reason: string }[] = []
  const requiredButUnavailable: { slug: string; reason: string }[] = []

  let candidates = [...eligibleSlugs]

  // Required: show only the required lenders (intersect with the eligible list).
  const requiredSlugs = requiredC.map(c => c.lenderSlug)
  if (requiredC.length > 0) {
    for (const c of requiredC) {
      if (!inList.has(c.lenderSlug)) requiredButUnavailable.push({ slug: c.lenderSlug, reason: c.reason })
    }
    const requiredSet = new Set(requiredSlugs)
    for (const slug of eligibleSlugs) {
      if (!requiredSet.has(slug)) excluded.push({ slug, reason: 'Not the required lender for this client.' })
    }
    candidates = eligibleSlugs.filter(slug => requiredSet.has(slug))
  }

  // Excluded: hide these lenders.
  for (const c of excludedC) {
    if (candidates.includes(c.lenderSlug)) {
      excluded.push({ slug: c.lenderSlug, reason: c.reason })
    }
  }
  const excludedSet = new Set(excludedC.map(c => c.lenderSlug))
  candidates = candidates.filter(slug => !excludedSet.has(slug))

  // Preferred: bring to the front, keep the rest in place.
  const preferredSlugs = preferredC.map(c => c.lenderSlug).filter(slug => candidates.includes(slug))
  const preferredSet = new Set(preferredSlugs)
  const visible = [...preferredSlugs, ...candidates.filter(slug => !preferredSet.has(slug))]

  return {
    visible,
    excluded,
    required: requiredSlugs,
    preferred: preferredSlugs,
    requiredButUnavailable,
  }
}

/** Whether the deal has a documented, cost-quantified suitability constraint —
 * the compliance signal (Part 4). A single active constraint with a reason is
 * the documented preference; the cost is attached at render time. */
export function hasActiveConstraint(all: Constraint[]): boolean {
  return activeConstraints(all).length > 0
}
