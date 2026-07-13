// Strategic Mortgage Monitoring export lender strings are inconsistent
// ("First National", "First National Financial", "First National - Prime",
// "First National - Excalibur", "RFA", "RFA Prime", "RFA Mortgage"). This maps
// each export string to the canonical quote slug where the lender is in the
// approved book, and to a display name where it is not. The client's CURRENT
// lender being outside the book is fine: the opportunity comparison is against
// Michael's best available approved offer, not the client's lender's own rate.
// The slug drives penalty-methodology lookup; inBook records whether the lender
// has approved quote sheets. Unmapped strings are listed per upload so this map
// can grow — never guessed at analysis time.

import type { LenderTier } from '@/config/lender-tiers'

export interface LenderAlias {
  // Canonical quote/knowledge slug, where one exists (else null).
  slug: string | null
  // Canonical display name.
  display: string
  // True when the lender has approved quote sheets in the book.
  inBook: boolean
  // The PAPER GRADE of this feed string's lending ('a' | 'b' | 'private'),
  // program-specific where the string names a program ("First National -
  // Excalibur" is b while "First National - Prime" is a). null = unknown,
  // fail-closed: an unknown-tier mortgage routes to review and never prices.
  // Mirrors the registry tiers (config/lender-tiers.ts); every value is
  // unconfirmed until Michael's pass.
  tier: LenderTier | null
  // Program name where the feed string names one.
  program?: string
}

// Keys are the lowercased, trimmed export strings. This is the explicit
// feed-string → (lender, program, tier) map: every string carries its tier
// judgment individually (never inherited by fuzzy matching), and a string
// not in this map fails closed to unknown.
export const SMM_LENDER_ALIASES: Record<string, LenderAlias> = {
  // First National family → first-national (Excalibur is its own slug AND
  // its own tier: the family's tier differs per program).
  'first national': { slug: 'first-national', display: 'First National', inBook: true, tier: 'a', program: 'prime' },
  'first national financial': { slug: 'first-national', display: 'First National', inBook: true, tier: 'a', program: 'prime' },
  'first national - prime': { slug: 'first-national', display: 'First National', inBook: true, tier: 'a', program: 'prime' },
  'first national - excalibur': { slug: 'first-national-excalibur', display: 'First National Excalibur', inBook: true, tier: 'b', program: 'excalibur' },
  // RFA family → rfa.
  'rfa': { slug: 'rfa', display: 'RFA', inBook: true, tier: 'a' },
  'rfa mortgage': { slug: 'rfa', display: 'RFA', inBook: true, tier: 'a' },
  'rfa prime': { slug: 'rfa', display: 'RFA', inBook: true, tier: 'a', program: 'prime' },
  // Other in-book lenders.
  'rmg mortgages': { slug: 'rmg', display: 'RMG Mortgages', inBook: true, tier: 'a' },
  'mcap': { slug: 'mcap', display: 'MCAP', inBook: true, tier: 'a' },
  'mcap prime': { slug: 'mcap', display: 'MCAP', inBook: true, tier: 'a', program: 'prime' },
  'cmls financial': { slug: 'cmls', display: 'CMLS Financial', inBook: true, tier: 'a' },
  // B2B Bank runs prime AND alternative programs and the feed string does not
  // say which one the client holds: tier stays UNKNOWN (fail-closed to
  // review) until Michael confirms per file. Seeding 'a' here would price a
  // B2B alternative-program client against A rates below the sanity trip.
  'b2b bank': { slug: 'b2b', display: 'B2B Bank', inBook: true, tier: null },
  'scotiabank': { slug: 'scotia', display: 'Scotiabank', inBook: true, tier: 'a' },
  // Intel-captured, coverage-pending (a slug for penalty/knowledge, but no
  // approved quotes yet, so inBook is false).
  'first ontario credit union': { slug: 'first-ontario', display: 'First Ontario Credit Union', inBook: false, tier: 'a' },
  // Real lenders Michael does not currently have sheets for: normalize for
  // display and penalty-methodology lookup, no quote-book competitor rates.
  'cibc': { slug: null, display: 'CIBC', inBook: false, tier: 'a' },
  'rbc': { slug: null, display: 'RBC', inBook: false, tier: 'a' },
  'td canada trust': { slug: null, display: 'TD Canada Trust', inBook: false, tier: 'a' },
  'national bank': { slug: null, display: 'National Bank', inBook: false, tier: 'a' },
  'westboro': { slug: null, display: 'Westboro', inBook: false, tier: 'private' },
  'lendwise': { slug: null, display: 'Lendwise', inBook: false, tier: 'a' },
}

export interface NormalizedLender {
  slug: string | null
  display: string
  inBook: boolean
  // False when the export string was not in the alias map (list it per upload).
  mapped: boolean
  // The paper grade from the explicit map; null = unknown, fail-closed.
  tier: LenderTier | null
  program?: string
}

export function normalizeLender(raw: string | null | undefined): NormalizedLender {
  const t = (raw ?? '').trim()
  if (!t) return { slug: null, display: '(no lender)', inBook: false, mapped: false, tier: null }
  const a = SMM_LENDER_ALIASES[t.toLowerCase()]
  if (a) return { slug: a.slug, display: a.display, inBook: a.inBook, mapped: true, tier: a.tier, program: a.program }
  return { slug: null, display: t, inBook: false, mapped: false, tier: null }
}
