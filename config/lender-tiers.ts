// Lender TIERS — the SERVER-SIDE mirror of the workbench lender registry's
// tier facts (fox-underwriting/knowledge/lender-registry.json, seeded
// 2026-07-13). Same posture as config/lender-provinces.ts: the registry is
// authoritative; server surfaces (the Opportunities board, the SMM analysis,
// the savings PDF route) cannot mint a gates token, so they read this mirror.
// KEEP IN LOCKSTEP with lender-registry.json.
//
// The tier is the PAPER GRADE of the lending: 'a' (prime), 'b' (alternative),
// 'private'. The doctrine is like-for-like by default: a mortgage prices
// against comparables in its OWN tier, and pricing a B or private file
// against A rates manufactures savings the client may not qualify for.
// Escalation (graduation to a better tier) is an opportunity Michael
// assesses, never an automatic price.
//
// A slug with NO entry here is UNKNOWN, fail-closed: unknown-tier paper
// routes to review and prices against nothing; an unknown-tier QUOTE never
// serves as a comparable for any tier. Every seeded entry is
// confirmed: false until Michael confirms it in the same pass as provinces;
// the unconfirmed count is surfaced on the Rates page beside the province
// count. Keyed by the QUOTE slug (the rate_quotes vocabulary).

export type LenderTier = 'a' | 'b' | 'private'

export interface TierFact {
  tier: LenderTier
  confirmed: boolean
  source: string
  asOf: string
}

const SEEDED = '2026-07-13'
const seed = (tier: LenderTier, source: string): TierFact => ({
  tier,
  confirmed: false,
  source: `${source} Seeded from documented knowledge ${SEEDED}; Michael confirms.`,
  asOf: SEEDED,
})

// The book's 23 lender slugs. highclere and npx are deliberately ABSENT
// (unknown): no documented basis for a tier — fail closed, never guessed.
export const TIER_MIRROR: Record<string, TierFact> = {
  'first-national': seed('a', 'First National Prime, prime monoline lending.'),
  mcap: seed('a', 'MCAP prime monoline lending.'),
  rfa: seed('a', 'RFA prime monoline lending.'),
  scotia: seed('a', 'Scotiabank prime bank lending.'),
  merix: seed('a', 'Merix prime monoline lending.'),
  rmg: seed('a', 'RMG prime monoline lending.'),
  cmls: seed('a', 'CMLS prime monoline lending.'),
  'nbc-optimum': seed('a', 'National Bank Optimum prime broker channel.'),
  strive: seed('a', 'Strive prime monoline lending.'),
  neo: seed('a', 'Neo Financial prime mortgage lending.'),
  manulife: seed('a', 'Manulife Bank prime lending.'),
  'coast-capital': seed('a', 'Coast Capital prime credit-union lending.'),
  kootenay: seed('a', 'Kootenay Savings prime credit-union lending.'),
  radius: seed('a', 'Radius Financial prime monoline lending.'),
  unionlink: seed('a', 'UnionLink credit-union prime channel.'),
  // b2b is deliberately ABSENT: it runs prime AND alternative programs and a
  // bare quote slug cannot say which — unknown, fail-closed, until program-
  // level confirmation (same reason its feed string carries tier null).
  shinhan: seed('a', 'Shinhan Bank Canada, Schedule II bank retail lending.'),
  'first-national-excalibur': seed('b', "First National's Excalibur alternative (B) program."),
  haventree: seed('b', 'Haventree Bank, alternative (B) lending.'),
  'home-trust': seed('b', 'Home Trust Classic, alternative (B) lending; the insured Accelerator program is prime, program confirmation pending.'),
  bridgewater: seed('b', 'Bridgewater Bank, alternative (B) lending.'),
}

export const TIER_MIRROR_AS_OF = SEEDED

/** The tier fact for a quote slug, or null when unknown (fail-closed). */
export function tierFor(slug: string | null | undefined): TierFact | null {
  if (!slug) return null
  return TIER_MIRROR[slug] ?? null
}

/** How many of the given slugs carry no CONFIRMED tier (unknown or seeded
 * unconfirmed) — the Rates page gap counter, beside the province count. */
export function unconfirmedTierCount(slugs: string[]): number {
  return Array.from(new Set(slugs)).filter(s => TIER_MIRROR[s]?.confirmed !== true).length
}

/** The tiers a client on `from` paper could graduate INTO (better paper
 * only). Graduation is an opportunity Michael assesses, never a price. */
export function graduationTargets(from: LenderTier): LenderTier[] {
  if (from === 'private') return ['b', 'a']
  if (from === 'b') return ['a']
  return []
}
