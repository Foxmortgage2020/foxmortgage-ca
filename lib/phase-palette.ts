// The Deals (Beta) colour system (2026-08-02).
//
// THE PROBLEM IT SOLVES. Michael's verdict on the first build was "plain and
// bland, no separation between stages or between the categories they sit in".
// The diagnosis: every column header looked identical, so finding a stage meant
// READING rather than glancing.
//
// THE RULE. Colour carries two facts and no others:
//
//   1. WHICH PHASE you are looking at — one hue family per phase.
//   2. HOW FAR ALONG within it — the same hue, deepening as a file advances.
//
// So a glance answers "Fund, near the end" without reading a word. What it
// deliberately does NOT do is give each stage its own arbitrary colour. Broki
// does that: six unrelated hues carrying no meaning, which have to be
// memorised. Colour that means nothing is decoration, and decoration is what
// made the first build hard to scan in the other direction.
//
// LIME IS NOT IN THIS FILE, and that is the point. Lime has exactly one
// meaning across the Command Centre — this needs you — and it is spent on the
// "You" blocked-by chip alone. Nothing here may drift toward it: every hue
// below is outside the 60–140° green band, checked by a test, so no phase tint
// can ever be mistaken for an attention signal.
//
// Warm hues are avoided for the same reason: amber is `caution` and red is
// `danger` in this design system, and a phase tint must not borrow either.
// Every hue here sits in the cool half of the wheel.
//
// Ramps are computed from POSITION, not from a per-stage table, so adding a
// stage in the record layer extends the ramp automatically and no code
// changes. That is the same principle as the columns themselves.

export interface PhaseHue {
  /** HSL hue in degrees. */
  h: number
  /** Saturation for the tinted surfaces. Kept low: these are backgrounds. */
  s: number
  /** A short name, so a reviewer can say yes or no to it in words. */
  name: string
}

/**
 * One hue family per phase, keyed by the phase's code.
 *
 * Presentation, not model: the record layer says which phases exist and in
 * what order, and this says what each looks like. A phase with no entry here
 * still renders — see hueFor — so a new phase in the table is never colourless.
 */
/**
 * A single sweep along the cool arc, cyan → magenta, in funnel order. Because
 * the hues advance monotonically, the phase bar itself reads as a journey:
 * earlier work is bluer, later work is warmer. Within a phase the same hue
 * deepens, so the two signals never fight — hue says WHERE, depth says HOW FAR.
 *
 * Teal was tried for Monitor and rejected after looking at it: at 165° it
 * renders green-dominant (rgb 47,167,137), and green on this page means "this
 * needs you". Nothing in the sweep now sits in the 60–140° green band, and a
 * test enforces that.
 */
export const PHASE_HUES: Record<string, PhaseHue> = {
  // Coolest and least committed: nobody here is anyone to us yet.
  attract: { h: 195, s: 44, name: 'cyan' },
  intake: { h: 215, s: 46, name: 'blue' },
  // The phase the business runs on sits in the middle of the sweep. Renamed
  // from `advise` in the record layer; the hue travelled with the meaning.
  underwriting: { h: 250, s: 46, name: 'indigo' },
  // Renamed from `fund`.
  fulfilment: { h: 285, s: 42, name: 'violet' },
  // Warmest of the five, so the loop's end reads as a different kind of work
  // from its beginning without ever becoming amber or red.
  monitor: { h: 320, s: 40, name: 'magenta' },
}

/** Deterministic fallback so an unmapped phase is tinted rather than blank.
 * Derived from the code's characters, and pinned outside the green band. */
export function hueFor(phaseCode: string): PhaseHue {
  const known = PHASE_HUES[phaseCode]
  if (known) return known
  let sum = 0
  for (let i = 0; i < phaseCode.length; i++) sum = (sum + phaseCode.charCodeAt(i) * 7) % 360
  // Map into 185–335, the same cool arc the named phases use: never green or
  // lime (60–140), never amber or red.
  return { h: 185 + (sum % 151), s: 40, name: 'unmapped' }
}

/** Position of a column within its phase, 0 for the first and 1 for the last.
 * A single-column phase sits at 0 rather than dividing by zero. */
export function rampPosition(index: number, total: number): number {
  if (total <= 1) return 0
  return Math.min(1, Math.max(0, index / (total - 1)))
}

export interface ColumnSkin {
  /** The column's own surface — barely tinted, so cards still read as white. */
  surface: string
  /** The header block, a step stronger than the surface. */
  header: string
  /** The rule above the header. Deepens as the file advances: this is the
   * "how far along" signal, and it is the only one that moves much. */
  accent: string
  /** Hairline between header and body. */
  border: string
}

/**
 * The skin for one column.
 *
 * Lightness falls and accent opacity rises with position, so a phase reads as
 * one family that gets more committed left to right. The numbers are gentle on
 * purpose — this is a working board, not a chart, and the cards have to stay
 * the loudest thing on it.
 */
export function columnSkin(phaseCode: string, index: number, total: number): ColumnSkin {
  const { h, s } = hueFor(phaseCode)
  const t = rampPosition(index, total)
  const surfaceL = 98 - 3 * t // 98% → 95%
  const headerL = 95.5 - 6.5 * t // 95.5% → 89%
  const accentA = 0.35 + 0.65 * t // 0.35 → 1.0
  return {
    surface: `hsl(${h} ${s * 0.55}% ${surfaceL}%)`,
    header: `hsl(${h} ${s * 0.8}% ${headerL}%)`,
    accent: `hsl(${h} ${s + 12}% 42% / ${accentA.toFixed(2)})`,
    border: `hsl(${h} ${s * 0.6}% 86%)`,
  }
}

/** The phase card in the bar: the family's identity at full strength, used
 * only for the accent so the bar stays calm. */
export function phaseAccent(phaseCode: string): string {
  const { h, s } = hueFor(phaseCode)
  return `hsl(${h} ${s + 12}% 42%)`
}

export function phaseTint(phaseCode: string): string {
  const { h, s } = hueFor(phaseCode)
  return `hsl(${h} ${s * 0.7}% 96.5%)`
}

// ─── Projections ────────────────────────────────────────────────────────────
//
// A PROJECTION IS NEVER DRAWN LIKE AN ACTUAL. Michael's own practice-history
// chart draws funded volume solid and the weighted pipeline HATCHED above it,
// with a caption saying a forecast is not a result. The same convention holds
// here: any weighted figure sits on a hatched ground, so it is distinguishable
// at a glance rather than merely labelled. Labels are read; texture is seen.

/** A 45-degree hatch in the given hue, for the ground behind a weighted
 * figure. Deliberately the same idea as the chart, so the two surfaces teach
 * the same convention. */
// WHY THE HATCH IS GONE (2026-08-02c). It was tried and it failed, for a
// reason worth carrying so it does not recur: on the practice-history chart the
// number sits OUTSIDE the bar, so texture behind the bar costs nothing. Here
// the number sits INSIDE the fill, so the hatch ran straight through the
// digits. A hatch works behind a bar. It does not work behind type.
//
// The replacement is a solid fill in the BRX Mortgage green family. A LIGHT
// TINT of it rather than full strength: at full strength the fill is dark
// enough to need reversed-out white digits, and a row of solid dark-green
// blocks in every column footer reads as alarm rather than as information. The
// tint keeps the figure calm and the digits crisp.
//
// THE ZONE RULE. There are now two greens on this page carrying two meanings,
// so they are separated by WHERE they may appear rather than by shade:
//
//     projection green  →  column footers and the insights strip. NEVER a card.
//     needs-you lime    →  cards. NEVER a footer or the strip.
//
// They therefore cannot sit beside each other. This is enforced by
// construction: the projection tokens live here and are imported only by
// components/admin/deals-beta/ProjectionFigure.tsx, the lime lives only in
// components/admin/deals-beta/DealCard.tsx, and tests/shell.test.ts (the
// exhaustive lime audit) plus tests/phase-model.test.ts assert both halves
// against the source. A file that breaks the zone fails the suite.

/** The BRX Mortgage green family. NOTE FOR MICHAEL: this repo carries no BRX
 * brand hex anywhere, so this is a deep green chosen to sit in that family and
 * well away from the Fox lime (#95D600, hue 78) — this is hue 152, a forest
 * green rather than a yellow-green. If BRX's exact hex differs, it is one
 * change here and nothing else moves. */
export const PROJECTION_GREEN = {
  /** Full strength — used for the digits and the label, never as the fill. */
  ink: 'hsl(152 58% 22%)',
  /** The fill behind the figure. Light enough that dark-green digits stay
   * crisp; saturated enough that it is unmistakably green at a glance. */
  fill: 'hsl(152 44% 91%)',
  /** A hairline so the fill has an edge on a white card. */
  border: 'hsl(152 34% 78%)',
} as const

// ─── Deal type ──────────────────────────────────────────────────────────────
//
// A SEPARATE ENCODING CHANNEL, deliberately. Phases own FILLED tints; deal
// types own OUTLINED chips — border and text, transparent inside. Because the
// channel differs, a violet Renewal chip cannot be confused with the violet
// Fund column even though both are violet-ish. Separating the channel is what
// lets a small palette carry two independent meanings without collision.
//
// Purchase, Refinance and Renewal are a real distinction Michael reads
// constantly, and grey was throwing that away.

export interface TypeSkin {
  fg: string
  border: string
  bg: string
}

const TYPE_HUES: Record<string, { h: number; s: number }> = {
  purchase: { h: 220, s: 68 },
  refinance: { h: 172, s: 62 },
  renewal: { h: 322, s: 52 },
  switch: { h: 262, s: 52 },
  heloc: { h: 210, s: 16 },
}

/** Outlined chip colours for a deal type. An unrecognised type gets the
 * neutral slate treatment rather than an invented hue, because a colour it
 * does not own would imply a distinction that is not recorded. */
export function typeSkin(dealType: string | null): TypeSkin | null {
  if (!dealType) return null
  const key = dealType.trim().toLowerCase()
  const hue = TYPE_HUES[key] ?? { h: 210, s: 12 }
  return {
    fg: `hsl(${hue.h} ${hue.s}% 34%)`,
    border: `hsl(${hue.h} ${hue.s * 0.7}% 72%)`,
    bg: `hsl(${hue.h} ${hue.s * 0.6}% 97%)`,
  }
}
