// The qualification explorer (B9) — band boundaries and band copy in ONE home.
//
// THE LAW THIS SURFACE OBEYS: this explorer NEVER tells a person no. Michael's
// practice reaches alternative lenders, private lenders, and equity and
// net-worth programs that no ratio form can see, so a hard "you do not qualify"
// would be factually wrong as well as unkind. Every band is information plus an
// invitation. Enforced by a test: no client string on this surface, in any
// band, may contain "do not qualify", "don't qualify", "denied", "declined",
// "rejected", or "ineligible" (tests/qualification.test.ts + the client-portal
// never-says-no sweep).
//
// Copy rules (client-facing, grade 6, warm): short sentences, contractions, no
// em dashes, no exclamation points, no semicolons. The wording is drafted here
// for Michael's word-level sign-off (the sign-off table is in the report).

export type BandKey = 'fits' | 'options' | 'alternatives' | 'conversation'
export type BandTone = 'green' | 'amber' | 'navy'

export interface QualificationBand {
  key: BandKey
  tone: BandTone
  headline: string
  blurb: string
}

// The boundaries, as percentages of income. GDS is home costs over income; TDS
// adds the borrower's other debts, so TDS is always >= GDS. Band 1 checks both
// (GDS within 39 AND TDS within 44). The stretch bands check "either ratio" as
// the brief words it: since TDS >= GDS, "either ratio within X" binds on GDS
// (the lower one), while the 44 binds TDS only in the green band. This is the
// deliberately generous reading a never-says-no surface should take.
export const BAND1_GDS_MAX = 39
export const BAND1_TDS_MAX = 44
export const BAND2_MAX = 48
export const BAND3_MAX = 60

export const QUALIFICATION_BANDS: Record<BandKey, QualificationBand> = {
  fits: {
    key: 'fits',
    tone: 'green',
    headline: 'This one fits comfortably.',
    blurb: 'These numbers sit right inside what most lenders look for. A strong place to start.',
  },
  options: {
    key: 'options',
    tone: 'amber',
    headline: 'There are good options here.',
    blurb: 'This is a little above the usual mark, and there is room to work with. Worth a quick chat with Michael.',
  },
  alternatives: {
    key: 'alternatives',
    tone: 'amber',
    headline: 'There are still paths that fit.',
    blurb: 'This one takes a closer look. Michael works with lenders whose options a standard form never shows.',
  },
  conversation: {
    key: 'conversation',
    tone: 'navy',
    headline: 'Let us talk this one through.',
    blurb: 'Numbers like these need a real conversation. Some options, like equity and net-worth lending, never show up on a form. Michael can walk you through what fits.',
  },
}

/**
 * The one band for a pair of ratios (percentages), evaluated as a cascade in
 * band order. First match wins. Because TDS >= GDS always, the "either ratio"
 * bands bind on GDS; the test suite pins each boundary.
 */
export function bandKeyForRatios(gdsPct: number, tdsPct: number): BandKey {
  if (gdsPct <= BAND1_GDS_MAX && tdsPct <= BAND1_TDS_MAX) return 'fits'
  // "Either ratio within 48" — literally gds <= 48 || tds <= 48.
  if (gdsPct <= BAND2_MAX || tdsPct <= BAND2_MAX) return 'options'
  if (gdsPct <= BAND3_MAX || tdsPct <= BAND3_MAX) return 'alternatives'
  return 'conversation'
}

export function resolveBand(key: BandKey): QualificationBand {
  return QUALIFICATION_BANDS[key]
}

// The always-on footer, verbatim. Not a commitment and not a rate offer.
export const QUALIFICATION_FOOTER = 'For guidance only, not a mortgage commitment or a rate offer.'

// The client-facing section words and control helpers. Kept here so the
// never-says-no and copy-rule sweeps can read them, and so Michael can edit the
// words in one place.
export const QUALIFICATION_COPY = {
  sectionTitle: 'Can I afford it?',
  sectionIntro: 'Try different prices and down payments to see how the numbers move. This is a guide, not a promise.',
  controls: {
    price: { label: 'Home price', helper: 'The price of the home you want to try.' },
    downPayment: { label: 'Down payment', helper: 'What you plan to put down.' },
    propertyTax: {
      label: 'Monthly property taxes',
      helper: 'Property taxes change from home to home, so this is a starting guess. Set it to the listing when you know it.',
    },
    condo: {
      label: 'Monthly condo fees',
      helper: 'Half of your condo fees count toward the math. Leave this at zero if there are none.',
    },
  },
  lockedTitle: 'Set by Michael from your file',
  locked: {
    income: 'Yearly income',
    debts: 'Monthly debts',
    heat: 'Heating estimate',
    contractRate: 'Your rate',
    stressRate: 'Stress-test rate',
    amortization: 'Amortization',
  },
  gdsLabel: 'Home costs',
  tdsLabel: 'All your costs',
  reset: 'Reset to Michael’s numbers',
  mortgageLabel: 'Estimated mortgage',
  insuredNote: 'This includes default mortgage insurance, added because the down payment is under 20 percent.',
  // A grade-6 helper when the down payment is below the legal minimum for the
  // price. Never a failure state, just a plain fact and the number to aim for.
  minimumDownLead: 'The smallest down payment for a home at this price is',
} as const

// The banned client-copy variants this surface must never render, in any band
// or state. The never-says-no rule, made explicit for the sweep.
export const QUALIFICATION_NEVER_SAYS_NO = [
  'do not qualify',
  "don't qualify",
  'don’t qualify',
  'denied',
  'declined',
  'rejected',
  'ineligible',
]
