// The Deals (Beta) design tokens (handoff 58).
//
// THE SOURCE OF TRUTH IS THE DESIGN EXPORT, not this file and not any brief.
// `docs/design/Fox_Mortgage_Pipeline_Board.html` is a bundled export a design
// tool produced after several rounds with Michael, and he approved its look.
// Every value below was read out of that file rather than transcribed from
// prose, because three builds in this programme drifted from prose descriptions
// of a design and each cost a session.
//
// TWO VALUES DELIBERATELY DO NOT COME FROM THE EXPORT. The export was produced
// from screenshots of the live product, so its navy and lime are a second-hand
// read of colours this repo already owns, and both had drifted. Michael ruled on
// the replacements 2026-08-06:
//
//   navy  #1B2A41 (export)  ->  #032133   tailwind.config.ts navy.DEFAULT
//   lime  #C6F24E (export)  ->  #C6F53F   tailwind.config.ts decision.DEFAULT
//
// Both are the repo's own live tokens. Navy is what CLAUDE.md declares the
// brand navy and what every admin surface renders through `text-navy`. Lime is
// the decision token, the Command Centre's attention currency, which the lime
// audit already polices. Every other colour in the export stands exactly as it
// was exported.
//
// PURE. No React, no imports, no environment. Values and two helpers.
//
// WHAT THIS MODULE DOES NOT OWN: layout. Flex and grid decisions live in the
// components. It owns colour, type and the small shape values the export set.

// ─── Surfaces ────────────────────────────────────────────────────────────────

export const SURFACE = {
  /** The page. A warm paper tone, not the old blue-grey and not white. */
  canvas: '#EFEDE8',
  panel: '#FFFFFF',
  /** Every visible border on the board. */
  border: '#E8E5E0',
  /** The lighter rule used inside a card, between its tiers. */
  hairline: '#F1EFEB',
  /** The card's last row, where the waiting-on line sits. */
  chaseBg: '#FCFBF9',
} as const

export const RADIUS = {
  /** Cards, stage columns, the search field. */
  card: 7,
  /** View chips and buttons. */
  chip: 6,
  /** Small chips, the BETA tag, avatars. */
  small: 4,
  /** The Attract source pills. */
  pill: 20,
  /** The phase swatch and the stage tone bar. */
  swatch: 2,
  /** The tiny square beside the waiting-on line. */
  dot: 1,
} as const

export const STROKE = {
  hairline: 1,
  /** The colour bar down the left edge of a file card. */
  cardBar: 4,
} as const

// ─── Text ────────────────────────────────────────────────────────────────────

export const TEXT = {
  /** THE REPO'S NAVY, not the export's. Headings, names, figures. */
  navy: '#032133',
  /** Secondary prose. The export calls this DIM and FAINT, one value. */
  dim: '#5E6B7E',
  /** Body copy inside dense blocks. */
  body: '#3D4A5C',
  /** Monospace metadata on a card: reference, stage, days in stage. */
  metaMono: '#7A8798',
  /** A zero count, and other present-but-empty figures. */
  ghost: '#9AA4B1',
  /** A MISSING value. Rendered italic with a dotted underline as well, so a
   *  gap never reads as a fact. See MISSING_VALUE below. */
  missing: '#6F7C8D',
  /** The faintest mono, for a keyboard hint or a zero on a source pill. */
  faintMono: '#C0C8D1',
} as const

export const ROLE = {
  /** THE REPO'S LIME, not the export's. Nothing else on the board is lime, so
   *  a person can answer "what am I working on" from the lime bars alone. */
  lime: '#C6F53F',
  /** A closing date already past on a file that has not closed, or one inside
   *  the window. The only red on the board, and only inside a card. */
  red: '#B3261E',
  /** Weighted and projected figures. Footers and strips only, never a card. */
  forest: '#14654A',
} as const

/** The five phase hues, deliberately muted rather than saturated. Read from the
 *  export's PH constant. Hue names the phase; nothing else encodes it. */
export const PHASE_HUE: Record<string, string> = {
  attract: '#7C8899',
  intake: '#5E77B4',
  underwriting: '#2E8391',
  fulfilment: '#AE6A61',
  monitor: '#9A5B85',
}

/** A phase the record layer adds later still gets a tone rather than nothing. */
export const PHASE_HUE_FALLBACK = '#7C8899'

/** HOW A MISSING VALUE RENDERS, in one place. The export gives an absent amount
 *  or an absent closing date all three of these at once, so a gap is legible
 *  even in a column of numbers. */
export const MISSING_VALUE = {
  color: TEXT.missing,
  fontStyle: 'italic' as const,
  textDecoration: 'underline dotted' as const,
  textUnderlineOffset: '3px',
}

// ─── Type ────────────────────────────────────────────────────────────────────
//
// FOUR WEIGHTS ARE IN USE: 400, 500, 600 and 700. Handoff 57's brief said two
// and pinned it with a test; the export supersedes that, and the test was
// REPLACED rather than deleted (tests/board-tokens.test.ts still fails on any
// weight outside this set).
//
// The scale runs 7.5px to 21px. That is much smaller than handoff 57 used and
// the reduction is the point: the board has to hold five phases, seven columns
// and sixty-six cards without shouting.

export type FontWeight = 400 | 500 | 600 | 700

export interface TypeToken {
  size: number
  weight: FontWeight
  /** Unitless line height, where the export set one. */
  leading?: number
  /** Tracking, where the export set one. */
  tracking?: string
  /** True where the export uses IBM Plex Mono. Numbers are monospaced so they
   *  align down a column, which is the whole reason the face is there. */
  mono?: boolean
}

export const TYPE = {
  // Page furniture
  pageTitle: { size: 21, weight: 600, leading: 1.1 },
  pageSubtitle: { size: 12.5, weight: 400, leading: 1.5 },
  beta: { size: 9.5, weight: 500, leading: 1, tracking: '.08em', mono: true },

  // The KPI strip
  kpiFigure: { size: 15, weight: 600, leading: 1 },
  kpiLabel: { size: 12, weight: 400, leading: 1 },
  kpiValueLabel: { size: 11.5, weight: 400, leading: 1 },
  kpiValue: { size: 12.5, weight: 600, leading: 1, mono: true },

  // View chips
  chipOn: { size: 11.5, weight: 600, leading: 1 },
  chipOff: { size: 11.5, weight: 500, leading: 1 },

  // A phase row
  phaseName: { size: 13.5, weight: 600, leading: 1 },
  phaseBlurb: { size: 11.5, weight: 400, leading: 1.35 },
  phaseMeta: { size: 11, weight: 500, leading: 1, mono: true },
  phaseValue: { size: 11, weight: 500, leading: 1, mono: true },
  phaseWeighted: { size: 11, weight: 600, leading: 1, mono: true },

  // A stage column
  stageName: { size: 12, weight: 600, leading: 1.25 },
  stageCount: { size: 20, weight: 600, leading: 1 },
  stageTeach: { size: 10.5, weight: 400, leading: 1.3 },
  gate: { size: 7.5, weight: 600, leading: 1, tracking: '.14em', mono: true },

  // A file card
  cardMeta: { size: 9.5, weight: 500, leading: 1, mono: true },
  cardWho: { size: 13, weight: 600, leading: 1.25 },
  cardAmount: { size: 12.5, weight: 600, leading: 1, mono: true },
  cardAddress: { size: 11, weight: 400, leading: 1.35 },
  cardDue: { size: 10.5, weight: 600, leading: 1, mono: true },
  cardInStage: { size: 10.5, weight: 400, leading: 1, mono: true },
  cardChase: { size: 10.5, weight: 400, leading: 1.3 },

  // Section headings and quiet lines
  sectionTitle: { size: 13, weight: 600, leading: 1 },
  sectionNote: { size: 11.5, weight: 400, leading: 1 },
  footNote: { size: 11, weight: 400, leading: 1 },
  pillLabel: { size: 11, weight: 500, leading: 1 },
} as const satisfies Record<string, TypeToken>

/** The two faces, as CSS variables set by lib/board-fonts.ts. The fallbacks
 *  matter: if a webfont never arrives the board still renders in a face of the
 *  right proportion rather than in Times. */
export const FONT = {
  ui: "var(--font-hanken), system-ui, -apple-system, 'Segoe UI', sans-serif",
  mono: "var(--font-plex-mono), ui-monospace, 'SF Mono', Menlo, monospace",
} as const

/** A type token as an inline style, so a size, a weight or a face is never
 * typed as a literal at a call site. */
export function typeStyle(t: TypeToken): {
  fontFamily: string
  fontSize: string
  fontWeight: number
  lineHeight?: number
  letterSpacing?: string
} {
  return {
    fontFamily: t.mono ? FONT.mono : FONT.ui,
    fontSize: `${t.size}px`,
    fontWeight: t.weight,
    ...(t.leading === undefined ? {} : { lineHeight: t.leading }),
    ...(t.tracking === undefined ? {} : { letterSpacing: t.tracking }),
  }
}

/** Border-radius as a style value. */
export function radius(r: number): string {
  return `${r}px`
}

/** A phase's hue, never invented per stage. */
export function phaseHue(code: string): string {
  return PHASE_HUE[code] ?? PHASE_HUE_FALLBACK
}

/** The navy at low alpha. The export draws several borders as a navy tint
 *  rather than as a flat grey, which is what keeps them from looking dirty
 *  against the warm canvas. Built from the token so the substituted navy
 *  carries through. */
export function navyAlpha(alpha: number): string {
  return `color-mix(in srgb, ${TEXT.navy} ${Math.round(alpha * 100)}%, transparent)`
}

/**
 * A stage's tone: the phase hue, lightened by how far along the stage sits.
 *
 * Hue says WHICH phase and depth says HOW FAR ALONG, which is the rule the
 * board has carried since the palette was built. The export draws this as a
 * short bar at the top of each stage column.
 */
export function stageTone(phaseCode: string, index: number, total: number): string {
  const hue = phaseHue(phaseCode)
  if (total <= 1) return hue
  // Earliest stage sits at 45% strength, the last at full.
  const t = Math.min(1, Math.max(0, index / (total - 1)))
  const alpha = 0.45 + 0.55 * t
  return `color-mix(in srgb, ${hue} ${Math.round(alpha * 100)}%, transparent)`
}
