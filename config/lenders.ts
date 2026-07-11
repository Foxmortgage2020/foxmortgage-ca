// Lender display names, keyed by the QUOTE slug the rate_quotes rows carry
// (Rates v3). This is a THIRD slug space, distinct from the knowledge slugs
// (fn, td) the knowledge index publishes and from the penalty-calculator
// slugs in lib/lenders.ts. Rates surfaces name lenders by the same key the
// quotes carry, so identity resolves without a round trip to the knowledge
// bundle. <LenderMark> reads its logo file by this slug too.
//
// Coverage: seeded from the live rate_quotes dimension inventory recorded
// in CLAUDE.md (2026-07-10, post migration 0029) plus the slugs the brief
// names. Anything not listed falls back to a title-cased slug, so an
// unknown future lender still reads cleanly and no code change is needed to
// admit it. The hand-written list below is also the to-do list for lenders
// missing a knowledge page (rfa and strive have no knowledge page yet).

// Correct-casing display names. Acronyms and bank names are spelled the way
// the desk says them; the title-case fallback would mangle these (nbc-optimum
// would read "Nbc Optimum", rfa would read "Rfa").
export const LENDER_NAMES: Record<string, string> = {
  mcap: 'MCAP',
  merix: 'Merix Financial',
  unionlink: 'UnionLink',
  'first-national': 'First National',
  'first-national-excalibur': 'First National Excalibur',
  scotia: 'Scotiabank',
  neo: 'Neo Financial',
  cmls: 'CMLS Financial',
  npx: 'NPX',
  highclere: 'Highclere',
  strive: 'Strive Capital',
  'nbc-optimum': 'NBC Optimum',
  haventree: 'Haventree Bank',
  b2b: 'B2B Bank',
  rfa: 'RFA',
  bridgewater: 'Bridgewater Bank',
  shinhan: 'Shinhan Bank',
  manulife: 'Manulife Bank',
  'coast-capital': 'Coast Capital',
  radius: 'Radius Financial',
  'home-trust': 'Home Trust',
  rmg: 'RMG Mortgages',
  kootenay: 'Kootenay Savings',
}

/** The slugs with a hand-written display name. Also the missing-knowledge-page
 * to-do list: any of these without a knowledge page renders its logo/monogram
 * and name here, and its cross-links degrade to the honest no-page state. */
export const HAND_WRITTEN_LENDER_SLUGS = Object.keys(LENDER_NAMES)

/** Title-case a slug as the honest fallback for any lender not listed above.
 * "some-new-lender" -> "Some New Lender". Acronyms may miscase; that is the
 * documented cost of not maintaining a manifest. */
export function titleCaseSlug(slug: string): string {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(w => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

/** The display name for a quote slug: the hand-written name where one exists,
 * a title-cased slug otherwise. Never throws; an empty slug reads "Lender". */
export function lenderDisplayName(slug: string | null | undefined): string {
  if (!slug) return 'Lender'
  return LENDER_NAMES[slug] ?? titleCaseSlug(slug)
}

/** Monogram initials for the <LenderMark> fallback. Two-plus words take the
 * first letter of each of the first two (First National -> FN, Haventree Bank
 * -> HB); a short all-caps token reads whole (MCAP, RFA, NPX, B2B); otherwise
 * the first two letters. Deliberate, not an error state. */
export function lenderInitials(name: string, slug: string): string {
  const base = (name || slug || '?').trim()
  const words = base.split(/[\s-]+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  const w = words[0] ?? '?'
  if (w.length <= 4 && w === w.toUpperCase()) return w
  return w.slice(0, 2).toUpperCase()
}
