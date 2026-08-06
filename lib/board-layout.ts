// The Deals (Beta) board's layout rules (handoff 57).
//
// PURE, and separate from lib/design-tokens.ts on purpose: that module holds
// values a designer decided, this one holds rules a reader depends on. Both are
// isomorphic, so the server component and the tests share one source of truth.
//
// TWO JOBS:
//   1. THE COUNTDOWN. What a closing date means today, in four states, only two
//      of which are red.
//   2. THE FOLD. Which stages and which phases collapse to a single line, which
//      is what lets twenty-eight stages read on one screen without the board
//      scrolling sideways.

// ─── The countdown ───────────────────────────────────────────────────────────
//
// FOUR STATES AND ONLY TWO ARE RED. The threshold is fourteen days because that
// is when broker conditions come due against a closing. If every card were red,
// red would mean nothing.
//
// THE FIFTH READING, RULED ON BY MICHAEL 2026-08-06. Applying the four states
// literally painted 75 of the 97 board cards red, and 59 of those were FUNDED
// files whose closing correctly already happened. A passed closing is an alarm
// only where the file has not reached its end, so a terminal stage reads the
// closing as a plain date instead. That leaves 16 red cards on today's book,
// which is the signal the design was drawn for. The rule keys on the stage's
// own `category` column rather than on a stage code, so a terminal stage added
// to the record layer later behaves correctly with no change here.

export type CountdownState = 'far' | 'soon' | 'passed' | 'closed' | 'no_date'

export const CLOSING_URGENT_DAYS = 14

/** The stage categories that mean the file reached its end. Read from the
 *  record layer's own vocabulary, never from a stage code. */
export function isTerminalCategory(category: string | null | undefined): boolean {
  return category === 'terminal_won' || category === 'terminal_lost'
}

/** Whole days from one YMD to another. Both are parsed at UTC noon so a
 * daylight-saving boundary can never shift the count by one. */
export function daysBetweenYMD(fromYMD: string, toYMD: string): number | null {
  const a = Date.parse(`${fromYMD.slice(0, 10)}T12:00:00Z`)
  const b = Date.parse(`${toYMD.slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((b - a) / 86400000)
}

/** A date the way this board prints one. Toronto, because the practice is. */
export function fmtDate(ymd: string): string {
  const d = new Date(`${ymd.slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return ymd
  return d.toLocaleDateString('en-CA', {
    timeZone: 'America/Toronto',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export interface Countdown {
  state: CountdownState
  label: string
  /** True for the two states that carry the urgent colour. Returned rather than
   *  derived at the call site, so the colour rule lives in exactly one place. */
  urgent: boolean
}

export function closingCountdown(input: {
  closingDate: string | null | undefined
  todayYMD: string
  /** The stage's own category, from rec.deal_stages. */
  stageCategory: string | null | undefined
}): Countdown {
  const raw = input.closingDate?.slice(0, 10)
  if (!raw) return { state: 'no_date', label: 'No date', urgent: false }

  const days = daysBetweenYMD(input.todayYMD, raw)
  if (days === null) return { state: 'no_date', label: 'No date', urgent: false }

  if (days < 0) {
    // The file already ended: the closing did not slip, it happened.
    if (isTerminalCategory(input.stageCategory)) {
      return { state: 'closed', label: `Closed ${fmtDate(raw)}`, urgent: false }
    }
    return { state: 'passed', label: 'Closing passed', urgent: true }
  }
  if (days <= CLOSING_URGENT_DAYS) {
    return {
      state: 'soon',
      label: days === 0 ? 'Closing today' : `${days} day${days === 1 ? '' : 's'} out`,
      urgent: true,
    }
  }
  return { state: 'far', label: `${days} days out`, urgent: false }
}

// ─── The fold ────────────────────────────────────────────────────────────────
//
// WHY THE BOARD RESTRUCTURED RATHER THAN RESTYLED. Twenty-eight stages laid
// side by side overflowed 1512 by 588px and still needed collapse controls, and
// no amount of paint fixes that. Phases stack vertically now, each phase's
// stages sit side by side under its own header, and anything empty folds to one
// line. On today's book that leaves Underwriting and Fulfilment open with three
// stages each, and Attract, Intake and Monitor as three quiet lines.

const SMALL_NUMBERS = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen', 'Twenty',
]

/** Small counts read as words in a sentence, which is how the fold lines were
 * written. Anything larger falls back to digits rather than inventing prose. */
export function spellSmall(n: number): string {
  return n >= 0 && n < SMALL_NUMBERS.length ? SMALL_NUMBERS[n]! : String(n)
}

export interface FoldedStages<T> {
  /** Stages holding at least one file, in their configured order. */
  occupied: T[]
  /** Stages holding none. They fold to one line at the foot of the phase. */
  empty: T[]
}

/** Split a phase's stages into the ones that render as columns and the ones
 * that fold. An empty stage is still a fact about the process, so it is named
 * rather than dropped. */
export function foldStages<T>(columns: readonly T[], countFor: (c: T) => number): FoldedStages<T> {
  const occupied: T[] = []
  const empty: T[] = []
  for (const c of columns) (countFor(c) > 0 ? occupied : empty).push(c)
  return { occupied, empty }
}

/** The one line an empty set of stages folds to. Null when none are empty. */
export function emptyStagesNote(count: number): string | null {
  if (count <= 0) return null
  if (count === 1) return 'One more stage in this phase has no files.'
  return `${spellSmall(count)} more stages in this phase have no files.`
}

/** A phase with nothing in it folds to its header line alone. Contact-level
 * phases count people rather than files and hold nobody today, and Attract has
 * no stages at all by configuration, so all three fold by the same rule rather
 * than by three special cases. */
export function phaseIsQuiet(fileCount: number): boolean {
  return fileCount <= 0
}

// ─── The phase header's weighted figure ──────────────────────────────────────

export interface PhaseWeighted {
  weighted: number
  /** Always true. Present so a caller cannot destructure the number without
   *  meeting the flag, the same guard the column footers use. */
  isProjection: true
}

/**
 * A phase's weighted total: the sum over its stages of amount times
 * probability.
 *
 * A NULL PROBABILITY IS NOT ZERO and never enters the sum. Intake and Monitor
 * carry null on every stage, so this returns null for them and the header
 * renders no weighted figure at all rather than a fabricated zero. That is the
 * same rule the column footers already follow, and it is why contact-level
 * phases carry no footer.
 */
export function phaseWeighted(
  stages: readonly { code: string; probability?: number | null }[],
  amountInStage: (code: string) => number,
): PhaseWeighted | null {
  let total = 0
  let priced = 0
  for (const s of stages) {
    const p = typeof s.probability === 'number' ? s.probability : null
    if (p === null) continue
    priced += 1
    total += (amountInStage(s.code) * p) / 100
  }
  return priced === 0 ? null : { weighted: total, isProjection: true }
}
