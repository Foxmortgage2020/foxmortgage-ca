// The Deals (Beta) board's layout rules (handoff 58).
//
// PURE, and separate from lib/design-tokens.ts on purpose: that module holds
// values a designer decided, this one holds rules a reader depends on.
//
// WHAT CHANGED FROM HANDOFF 57. Its vertical stack is superseded by the three
// level structure Michael settled on after seeing the design export's three
// options, so the fold helpers that stack needed (foldStages, emptyStagesNote,
// phaseIsQuiet, spellSmall) are gone rather than left as dead exports: they
// existed for one session, nothing else used them, and the structure they
// served no longer exists. The countdown survives unchanged, including the
// fifth reading Michael ruled on, because it was right and is still right.

// ─── Michael's vocabulary ────────────────────────────────────────────────────
//
// HE THINKS IN STAGES CONTAINING SUB-STAGES. The database says phases
// containing stages. Both are correct in their own place, so the interface uses
// his words and the code keeps the database's, and this is the one seam where
// they meet. Nothing below renames a column or a variable.

/** What a database PHASE is called on screen. */
export const PHASE_WORD = 'stage'
/** What a database STAGE is called on screen. */
export const STAGE_WORD = 'sub-stage'

export function stageWord(n: number): string {
  return n === 1 ? PHASE_WORD : `${PHASE_WORD}s`
}
export function subStageWord(n: number): string {
  return n === 1 ? STAGE_WORD : `${STAGE_WORD}s`
}

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
// closing as a plain date instead. That leaves 16 red cards, which is the same
// sixteen the export's own summary strip counts.

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
  /** True for the two states that carry the urgent colour, and the same flag
   *  that turns a card's left bar lime. Returned rather than derived at a call
   *  site, so "needs work today" has exactly one definition. */
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

// ─── The card's left bar ─────────────────────────────────────────────────────
//
// EXACTLY TWO VALUES, and nothing else on the page is lime. A person answers
// "what am I working on today" by looking at which bars are lime and reading
// nothing at all. That only works because the lime is rationed this hard.

export type CardBar = 'needs' | 'controlled'

/** Lime means this file needs work today. Navy means it is under control.
 *  Keyed on the SAME urgency the countdown computes, so the sixteen files the
 *  summary strip counts and the sixteen lime bars are the same sixteen by
 *  construction rather than by two rules agreeing. */
export function cardBar(countdown: Countdown): CardBar {
  return countdown.urgent ? 'needs' : 'controlled'
}

// ─── One expanded phase at a time ────────────────────────────────────────────
//
// THE WHOLE POINT OF THE STRUCTURE. Twenty-five sub-stages laid side by side
// cannot be read; seven can. Level one is the five phases as a single row,
// level two expands ONE of them underneath, level three is the cards inside
// that phase's columns. So the widest thing on screen is seven columns.

/** The phase to expand, from the URL. An unknown or absent value opens nothing,
 *  which is the honest default: the board opens showing all five phases and
 *  waits to be asked. Never falls back to an arbitrary phase, because a board
 *  that silently picks one teaches the wrong thing about what it is showing. */
export function openPhaseCode(
  requested: string | null | undefined,
  phases: readonly { code: string }[],
): string | null {
  if (!requested) return null
  return phases.some(p => p.code === requested) ? requested : null
}

// ─── A phase's three figures ─────────────────────────────────────────────────

export interface PhaseFigures {
  count: number
  /** Expected volume: the sum of the amounts actually recorded. */
  value: number
  /** Weighted volume, or null where the phase carries no probability at all. */
  weighted: number | null
  /** How many files in the phase carry no amount, so a total is never quietly
   *  presented as complete when it is not. */
  missingAmounts: number
}

/**
 * The three figures on a phase row.
 *
 * A NULL PROBABILITY IS NOT ZERO and never enters the weighted sum. Intake and
 * Monitor carry null on every sub-stage, so `weighted` comes back null for them
 * and the row renders no weighted figure rather than a fabricated zero.
 */
export function phaseFigures(
  stages: readonly { code: string; probability?: number | null }[],
  filesIn: (stageCode: string) => readonly { mortgage_amount: number | null }[],
): PhaseFigures {
  let count = 0
  let value = 0
  let weighted = 0
  let priced = 0
  let missingAmounts = 0
  for (const s of stages) {
    const files = filesIn(s.code)
    count += files.length
    const p = typeof s.probability === 'number' ? s.probability : null
    if (p !== null) priced += 1
    for (const f of files) {
      const amt = typeof f.mortgage_amount === 'number' ? f.mortgage_amount : null
      if (amt === null) {
        missingAmounts += 1
        continue
      }
      value += amt
      if (p !== null) weighted += (amt * p) / 100
    }
  }
  return { count, value, weighted: priced === 0 ? null : weighted, missingAmounts }
}
