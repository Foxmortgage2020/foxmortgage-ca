// The Deals (Beta) design tokens (handoff 57).
//
// THIS MODULE IS THE ANTI-DRIFT MECHANISM, and that matters more than any
// single value in it. Michael spent a morning iterating on mockups until he
// approved a look, and three separate builds this week drifted from prose
// descriptions of a design, each costing a session. So the values live here,
// once, and `tests/board-tokens.test.ts` fails on any hardcoded hex anywhere on
// the board surface. A future session that wants a different grey changes it
// here and everything moves together, or it does not change at all.
//
// PURE. No React, no imports, no environment. Values and one formatting helper.
//
// WHAT THIS MODULE DOES NOT OWN: spacing and layout. Padding, gaps and widths
// stay on Tailwind's scale, because they were not specified and inventing a
// second spacing system would be exactly the drift this file exists to stop.

// ─── Surfaces ────────────────────────────────────────────────────────────────
//
// The blue-grey page canvas is gone, and so is every tinted region panel.
// Regions separate by hairline and whitespace. The ONE exception is the column
// ground, which carries figure-ground rather than decoration: the white cards
// have to sit on something for the eye to group them.

export const SURFACE = {
  /** The page itself. Warm off-white, replacing the blue-grey Michael named. */
  canvas: '#F4F4F0',
  /** A content panel sitting on the canvas. */
  panel: '#FFFFFF',
  panelBorder: '#E8E8E2',
  /** The only tinted region on the page: the ground a stage's cards sit on. */
  columnGround: '#E4E4DE',
  card: '#FFFFFF',
  cardBorder: '#CFCFC7',
  /** Between the card's four tiers. */
  cardHairline: '#EDEDE7',
  /** Between regions, where a fill would once have been used. */
  sectionHairline: '#EAEAE4',
  /** The thin separator between the phase header's three figures. */
  figurePipe: '#DCDCD5',
} as const

export const RADIUS = {
  panel: 10,
  column: 9,
  card: 7,
  countPill: 10,
  /** The weighted figure's own chip. Not specified in the brief; kept at the
   *  value it already had so the footers do not move. */
  figure: 4,
} as const

export const STROKE = {
  panel: 1,
  /** The card's stroke is 2px on purpose: figure-ground does the separating,
   *  and a hairline disappears against the column ground. */
  card: 2,
  /** The rule above a stage column, carrying its phase hue. */
  stageRule: 4,
} as const

// ─── Text ────────────────────────────────────────────────────────────────────

export const TEXT = {
  primary: '#1A1A17',
  secondary: '#6E6E67',
  muted: '#8C8C85',
  /** ABSENT VALUES, and they are their own token for a reason. "Not specified"
   *  and "No date" have to visibly recede rather than read as content, because
   *  a missing field rendered in body grey is indistinguishable from a fact. */
  absent: '#B4B4AC',
  /** Brand navy for headings on this surface. */
  navy: '#1B2A41',
  /** The file reference. A repeating coloured anchor lets the eye count cards
   *  down a column without reading any of them, so it is never demoted to grey. */
  fileRef: '#2E5C96',
  /** A countdown that is not urgent. Specified separately from `secondary`
   *  because the footer's two sides have to read as one row. */
  countdown: '#57574F',
} as const

// ─── Roles ───────────────────────────────────────────────────────────────────

export const ROLE = {
  /** THE NEEDS-YOU CHIP, SPECIFIED BUT NOT YET APPLIED (handoff 57).
   *
   *  The board's needs-you chip still renders through the Tailwind `decision`
   *  tokens (#C6F53F on #3D4F0A), because two tests pin that chip to those exact
   *  class names: the exhaustive lime audit in tests/shell.test.ts greps
   *  DealCard for the literal ternary, and the zone test in
   *  tests/phase-model.test.ts asserts the card matches /bg-decision/. Both are
   *  on this session's do-not-edit list, and redefining the Tailwind token
   *  instead would repaint six other surfaces the brief protects.
   *
   *  The approved values live here so the switch is one edit on the day the
   *  lime pass reaches the rest of the Command Centre. Michael ruled on this
   *  deviation rather than it being assumed. */
  needsYouBg: '#EDF3D9',
  needsYouInk: '#4A5D0A',
  /** A closing that has passed on a file that has not closed, and a closing
   *  inside the 14-day window. Nothing else on this board is red. */
  urgent: '#B3261E',
  /** The digits on a weighted figure. The fill and border stay in
   *  lib/phase-palette.ts PROJECTION_GREEN, which owns the zone rule. */
  projectionInk: '#1D6E56',
} as const

/** The pre-existing brand navy, carried by the file page's tab underline and
 *  its overview accent. NOT part of the new scale: it lives here only so those
 *  two literals are not hardcoded, and both render exactly as they did before.
 *  The file page is out of scope this session and is visually untouched. */
export const LEGACY_BRAND_NAVY = '#032133'

// ─── Type ────────────────────────────────────────────────────────────────────
//
// ONLY TWO WEIGHTS EXIST: 400 and 500. Nothing heavier appears anywhere on this
// surface, enforced by test. Sentence case everywhere, no title case, no caps.

export interface TypeToken {
  size: number
  weight: 400 | 500
  /** Only where it was specified. Everything else inherits. */
  lineHeight?: number
}

export const TYPE = {
  pageTitle: { size: 30, weight: 500 },
  /** The large figures on the insights strip. */
  figure: { size: 26, weight: 500 },
  phaseName: { size: 17, weight: 500 },
  /** The one-line description under a phase name. */
  phaseDescription: { size: 13, weight: 400 },
  stageName: { size: 15, weight: 500 },
  /** The one-line description of what a stage means. The single most useful
   *  element for someone who has never seen the system. */
  stageDescription: { size: 12, weight: 400 },
  countPill: { size: 12, weight: 500 },
  fileRef: { size: 13, weight: 500 },
  cardAmount: { size: 20, weight: 500 },
  /** Body copy and borrower names. */
  body: { size: 14, weight: 400 },
  /** The card's context tier, and every metadata line. */
  meta: { size: 12, weight: 400 },
  /** The context tier's stated line height. */
  context: { size: 12, weight: 400, lineHeight: 1.65 },
  /** A countdown inside the window, or already passed on an open file. */
  urgentMeta: { size: 12, weight: 500 },
} as const satisfies Record<string, TypeToken>

/** A type token as an inline style, so a size or a weight is never typed as a
 * literal at a call site. */
export function typeStyle(t: TypeToken): {
  fontSize: string
  fontWeight: number
  lineHeight?: number
} {
  return {
    fontSize: `${t.size}px`,
    fontWeight: t.weight,
    ...(t.lineHeight === undefined ? {} : { lineHeight: t.lineHeight }),
  }
}

/** Border-radius as a style value. */
export function radius(r: number): string {
  return `${r}px`
}
