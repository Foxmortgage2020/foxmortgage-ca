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

export interface LenderAlias {
  // Canonical quote/knowledge slug, where one exists (else null).
  slug: string | null
  // Canonical display name.
  display: string
  // True when the lender has approved quote sheets in the book.
  inBook: boolean
}

// Keys are the lowercased, trimmed export strings.
export const SMM_LENDER_ALIASES: Record<string, LenderAlias> = {
  // First National family → first-national (Excalibur is its own slug).
  'first national': { slug: 'first-national', display: 'First National', inBook: true },
  'first national financial': { slug: 'first-national', display: 'First National', inBook: true },
  'first national - prime': { slug: 'first-national', display: 'First National', inBook: true },
  'first national - excalibur': { slug: 'first-national-excalibur', display: 'First National Excalibur', inBook: true },
  // RFA family → rfa.
  'rfa': { slug: 'rfa', display: 'RFA', inBook: true },
  'rfa mortgage': { slug: 'rfa', display: 'RFA', inBook: true },
  'rfa prime': { slug: 'rfa', display: 'RFA', inBook: true },
  // Other in-book lenders.
  'rmg mortgages': { slug: 'rmg', display: 'RMG Mortgages', inBook: true },
  'mcap prime': { slug: 'mcap', display: 'MCAP', inBook: true },
  'cmls financial': { slug: 'cmls', display: 'CMLS Financial', inBook: true },
  'b2b bank': { slug: 'b2b', display: 'B2B Bank', inBook: true },
  'scotiabank': { slug: 'scotia', display: 'Scotiabank', inBook: true },
  // Intel-captured, coverage-pending (a slug for penalty/knowledge, but no
  // approved quotes yet, so inBook is false).
  'first ontario credit union': { slug: 'first-ontario', display: 'First Ontario Credit Union', inBook: false },
  // Real lenders Michael does not currently have sheets for: normalize for
  // display and penalty-methodology lookup, no quote-book competitor rates.
  'cibc': { slug: null, display: 'CIBC', inBook: false },
  'rbc': { slug: null, display: 'RBC', inBook: false },
  'td canada trust': { slug: null, display: 'TD Canada Trust', inBook: false },
  'national bank': { slug: null, display: 'National Bank', inBook: false },
  'westboro': { slug: null, display: 'Westboro', inBook: false },
  'lendwise': { slug: null, display: 'Lendwise', inBook: false },
}

export interface NormalizedLender {
  slug: string | null
  display: string
  inBook: boolean
  // False when the export string was not in the alias map (list it per upload).
  mapped: boolean
}

export function normalizeLender(raw: string | null | undefined): NormalizedLender {
  const t = (raw ?? '').trim()
  if (!t) return { slug: null, display: '(no lender)', inBook: false, mapped: false }
  const a = SMM_LENDER_ALIASES[t.toLowerCase()]
  if (a) return { slug: a.slug, display: a.display, inBook: a.inBook, mapped: true }
  return { slug: null, display: t, inBook: false, mapped: false }
}
