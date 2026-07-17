// The lifecycle spine (Brief B1, 2026-07-16) — ONE canonical definition of
// the phases a file moves through, in the words Michael's process and the
// BRX training deck use. The board, the Home pipeline table, and the deal
// room journey stepper all speak through this file.
//
// Four board phases plus one off-board phase. Underwriting runs until a
// commitment is in hand: a lender decline loops the file back through
// packaging to the next lender, still inside Underwriting. Fulfilment
// begins at commitment.
//
// This file DERIVES from config/pipeline.ts (phase boundaries are positions
// in PIPELINE_STAGE_ORDER) and from the board's own boardColumnFor — it
// never restates a stage list. Stage strings are DISPLAY values (Zoho reads
// return display space; the indirection is documented in config/pipeline.ts).
//
// LIVE FINDING (2026-07-16 census): reads now return 'Ready To Close'
// verbatim on one live file, despite the documented indirection saying that
// actual value displays as 'Broker Complete'. The stage is mapped here to
// complete_paid (its funnel position is unambiguous); its STAGE_WEIGHTS
// entry is deliberately NOT added — the weight-unmapped amber flag on Home
// and Revenue stays until Michael maps it in config/pipeline.ts.

import { FUNDED_STAGES, PIPELINE_STAGE_ORDER, TERMINAL_STAGES } from '@/config/pipeline'
import { boardColumnFor, type BoardColumn } from '@/lib/underwriting-bridge'
import { dealShapeOf } from '@/lib/deal-goal'

export type PhaseKey =
  | 'intake'
  | 'underwriting'
  | 'fulfilment'
  | 'complete_paid'
  | 'beyond_funding'

export interface LifecyclePhase {
  key: PhaseKey
  label: string
  // One plain-words sentence a day-one agent understands.
  description: string
}

export const LIFECYCLE_PHASES: readonly LifecyclePhase[] = [
  {
    key: 'intake',
    label: 'Intake',
    description: 'A new file arrives and the application comes in.',
  },
  {
    key: 'underwriting',
    label: 'Underwriting',
    description: 'We collect documents, underwrite, and work the file until a lender commits.',
  },
  {
    key: 'fulfilment',
    label: 'Fulfilment',
    description: 'The commitment is in and the conditions get cleared.',
  },
  {
    key: 'complete_paid',
    label: 'Complete & paid',
    description: 'The lawyer closes the file and the deal funds.',
  },
  {
    key: 'beyond_funding',
    label: 'Beyond funding',
    description: 'The funded client stays on the radar for renewals and savings.',
  },
] as const

const PHASE_INDEX: Record<PhaseKey, number> = Object.fromEntries(
  LIFECYCLE_PHASES.map((p, i) => [p.key, i]),
) as Record<PhaseKey, number>

export function phaseLabel(key: PhaseKey): string {
  return LIFECYCLE_PHASES[PHASE_INDEX[key]].label
}

// ─── Display-stage → phase ───────────────────────────────────────────────────
// Phase boundaries are POSITIONS in the imported funnel order, so a stage
// added to PIPELINE_STAGE_ORDER lands in a phase by position, not by a
// second hand-kept list. Lookup is case-insensitive: the live book already
// carries one case drift ('Ready To Close').

const ORDER = PIPELINE_STAGE_ORDER as readonly string[]

function segment(fromStage: string, toStageInclusive: string): readonly string[] {
  const from = ORDER.indexOf(fromStage)
  const to = ORDER.indexOf(toStageInclusive)
  return ORDER.slice(from, to + 1)
}

const PHASE_BY_DISPLAY = new Map<string, PhaseKey>()
for (const s of segment('Lead', 'Submitted')) PHASE_BY_DISPLAY.set(s.toLowerCase(), 'intake')
for (const s of segment('Collecting Documentation', 'Submitted to Lender'))
  PHASE_BY_DISPLAY.set(s.toLowerCase(), 'underwriting')
for (const s of segment('Conditionally Approved', 'Approved'))
  PHASE_BY_DISPLAY.set(s.toLowerCase(), 'fulfilment')
for (const s of segment('Broker Complete', 'Broker Complete'))
  PHASE_BY_DISPLAY.set(s.toLowerCase(), 'complete_paid')
// Funded terminals sit past the board: per-file surfaces show Beyond funding.
for (const s of FUNDED_STAGES) PHASE_BY_DISPLAY.set(s.toLowerCase(), 'beyond_funding')
// Legacy stage still in STAGE_WEIGHTS but not the funnel order (finding).
PHASE_BY_DISPLAY.set('qualification', 'intake')
// The 2026-07-16 live finding (header note above): reads return this verbatim.
PHASE_BY_DISPLAY.set('ready to close', 'complete_paid')
// 'Mortgage Closed' is the actual-space twin of 'Mortgage Funded'; if a read
// ever returns it verbatim (the Ready To Close precedent), it is funded.
PHASE_BY_DISPLAY.set('mortgage closed', 'beyond_funding')

/**
 * Maps a Zoho DISPLAY stage to its lifecycle phase. Unknown non-terminal
 * stages return null — callers render that loudly (amber, "phase not
 * mapped"), never a silent bucket. Non-funded terminal stages (Archive,
 * Lost, Cancelled...) also return null: a dead file is off the spine.
 */
export function phaseForDisplayStage(stage: string): PhaseKey | null {
  const key = stage.toLowerCase().trim()
  const phase = PHASE_BY_DISPLAY.get(key) ?? null
  if (phase) return phase
  if ((TERMINAL_STAGES as readonly string[]).some(t => t.toLowerCase() === key)) return null
  return null
}

// ─── Board column → phase (total over the 7 column keys) ────────────────────
// The board's funded column groups under Complete & paid ON THE BOARD; a
// funded FILE's journey shows Beyond funding (journeyForStage below).

const PHASE_BY_COLUMN: Record<BoardColumn, PhaseKey> = {
  intake: 'intake',
  evidence: 'underwriting',
  packaging: 'underwriting',
  with_lender: 'underwriting',
  conditions: 'fulfilment',
  ready: 'complete_paid',
  funded: 'complete_paid',
}

export function phaseForBoardColumn(column: BoardColumn): PhaseKey {
  return PHASE_BY_COLUMN[column]
}

/** Groups the board's columns under their phase headers, board order kept. */
export function boardPhaseGroups<T extends { key: BoardColumn }>(
  columns: readonly T[],
): { key: PhaseKey; label: string; columns: T[] }[] {
  const groups: { key: PhaseKey; label: string; columns: T[] }[] = []
  for (const col of columns) {
    const phase = phaseForBoardColumn(col.key)
    const last = groups[groups.length - 1]
    if (last && last.key === phase) last.columns.push(col)
    else groups.push({ key: phase, label: phaseLabel(phase), columns: [col] })
  }
  return groups
}

/**
 * Groups pipeline rows by phase in lifecycle order, input order kept within
 * each group. Rows whose stage maps to no phase land in the trailing
 * 'unmapped' group — loud, never forced into a phase.
 */
export function groupByPhase<T>(
  items: readonly T[],
  stageOf: (item: T) => string,
): { key: PhaseKey | 'unmapped'; label: string; items: T[] }[] {
  const byPhase = new Map<PhaseKey | 'unmapped', T[]>()
  for (const item of items) {
    const phase = phaseForDisplayStage(stageOf(item)) ?? 'unmapped'
    const list = byPhase.get(phase) ?? []
    list.push(item)
    byPhase.set(phase, list)
  }
  const groups: { key: PhaseKey | 'unmapped'; label: string; items: T[] }[] = []
  for (const p of LIFECYCLE_PHASES) {
    const list = byPhase.get(p.key)
    if (list && list.length > 0) groups.push({ key: p.key, label: p.label, items: list })
  }
  const unmapped = byPhase.get('unmapped')
  if (unmapped && unmapped.length > 0)
    groups.push({ key: 'unmapped', label: 'Phase not mapped', items: unmapped })
  return groups
}

// ─── Per-phase steps (the BRX deck vocabulary, deal-shape aware) ─────────────
// Status semantics: 'live' = the platform does it today; 'manual' = Michael
// or an agent does it by hand today, the note names the manual path (the
// dashboard doubles as the SOP); 'planned' = capability coming, the note
// names what it will be and what it waits on. Placeholders describe missing
// CAPABILITY only, never missing data, and render quiet gray — lime stays
// reserved for a queued human decision (the Phase A rule).

export type StepShape = 'purchase' | 'refi' | 'renewal' | 'switch' | 'unknown'
export type StepStatus = 'live' | 'manual' | 'planned'

export interface LifecycleStep {
  key: string
  label: string
  status: StepStatus
  note?: string
  // Lowercase stage strings (display AND workbench space) this step is
  // current for, matched within the phase only. Planned steps carry none:
  // a capability that does not exist yet is never where a file is.
  stages?: readonly string[]
}

const step = (
  key: string,
  label: string,
  status: StepStatus,
  extra?: { note?: string; stages?: readonly string[] },
): LifecycleStep => ({ key, label, status, ...extra })

const INTAKE_STEPS: LifecycleStep[] = [
  step('qualify', 'Reach out and qualify', 'manual', {
    note: 'Michael reaches out and qualifies new leads by hand today.',
    stages: ['lead', 'pending'],
  }),
  step('application', 'Get the application in', 'live', {
    stages: ['application started'],
  }),
  step('application_chase', 'Application chase', 'planned', {
    note: 'Automated reminders when an application stalls. Waits on the intake drip build.',
  }),
  step('first_review', 'Review the application', 'manual', {
    note: 'Michael reviews each new application by hand today.',
    stages: ['submitted', 'intake'],
  }),
]

const UW_COLLECT = step('documents', 'Collect the documents', 'manual', {
  note: 'Michael chases missing documents by hand today.',
  stages: ['collecting documentation', 'evidence', 'in_progress'],
})
const UW_UNDERWRITE = step('underwrite', 'Underwrite the file', 'live', {
  stages: ['underwriting in progress', 'underwriting'],
})
const UW_PLAN = step('plan', 'Create a plan', 'manual', {
  note: 'Michael builds the plan and presents the options himself.',
  stages: ['options'],
})
const UW_PACKAGE = step('package_submit', 'Package and submit', 'manual', {
  note: 'Michael packages the file and submits it to the lender by hand.',
  stages: ['ready to submit', 'packaging'],
})
const UW_WITH_LENDER = step('with_lender', 'Waiting on the lender', 'manual', {
  note: 'Michael watches for the lender decision and nudges when it drags.',
  stages: ['submitted to lender', 'submitted', 'submitted_to_lender', 'with_lender'],
})

// Purchase files carry the deck's Pre-Approval steps; refinance, renewal,
// and switch files run the compressed set. Unknown shape gets the neutral
// compressed set, never a guess.
const UW_PURCHASE: LifecycleStep[] = [
  UW_COLLECT,
  UW_UNDERWRITE,
  UW_PLAN,
  step('preapproval_letter', 'Pre-approval letter', 'manual', {
    note: 'Michael prepares and sends the letter by hand today.',
  }),
  step('shopping', 'Pre-approved · shopping', 'planned', {
    note: 'Tracks pre-approved clients while they shop. Waits on a shopping signal.',
  }),
  UW_PACKAGE,
  UW_WITH_LENDER,
]
const UW_COMPRESSED: LifecycleStep[] = [UW_COLLECT, UW_UNDERWRITE, UW_PLAN, UW_PACKAGE, UW_WITH_LENDER]

const FULFILMENT_STEPS: LifecycleStep[] = [
  step('commitment', 'Commitment in and read', 'live', {
    stages: ['conditionally approved', 'conditionally_approved', 'application sent to lender'],
  }),
  step('conditions', 'Clear the conditions', 'live', {
    stages: ['conditions', 'conditions fulfilled'],
  }),
  step('final_approval', 'Confirm final approval', 'manual', {
    note: 'Michael confirms final approval with the lender by hand.',
    stages: ['approved'],
  }),
]

const COMPLETE_STEPS: LifecycleStep[] = [
  step('instruct', 'Instruct the lawyer', 'manual', {
    note: 'Michael sends the lawyer instructions by hand today.',
    stages: ['broker complete', 'broker_complete', 'ready to close', 'ready'],
  }),
  step('fund', 'Close and fund', 'live'),
]

const BEYOND_STEPS: LifecycleStep[] = [
  step('renewal_watch', 'Renewal radar watching', 'live', {
    stages: ['funded', 'mortgage funded', 'mortgage closed'],
  }),
  step('monitoring', 'Strategic Mortgage Monitoring', 'live'),
  step('renewal_outreach', 'Renewal outreach', 'planned', {
    note: 'Approved renewal touches will send once the send switch turns on.',
  }),
]

const sameForAllShapes = (steps: LifecycleStep[]): Record<StepShape, LifecycleStep[]> => ({
  purchase: steps,
  refi: steps,
  renewal: steps,
  switch: steps,
  unknown: steps,
})

export const PHASE_STEPS: Record<PhaseKey, Record<StepShape, LifecycleStep[]>> = {
  intake: sameForAllShapes(INTAKE_STEPS),
  underwriting: {
    purchase: UW_PURCHASE,
    refi: UW_COMPRESSED,
    renewal: UW_COMPRESSED,
    switch: UW_COMPRESSED,
    unknown: UW_COMPRESSED,
  },
  fulfilment: sameForAllShapes(FULFILMENT_STEPS),
  complete_paid: sameForAllShapes(COMPLETE_STEPS),
  beyond_funding: sameForAllShapes(BEYOND_STEPS),
}

/**
 * The step-set shape for a file, from the house deal-shape mapper
 * (lib/deal-goal.ts, never re-derived). The Finmo goal wins a conflict —
 * the same honesty rule the deal header follows — and fills in when the
 * record type is unknown. The house mapper folds switch into renewal, so
 * the 'switch' key is reachable only when that mapper ever splits them;
 * both carry the same compressed step set today.
 */
export function stepShapeFor(
  dealType: string | null | undefined,
  finmoGoal: string | null | undefined,
): StepShape {
  const ds = dealShapeOf(dealType)
  const gs = dealShapeOf(finmoGoal)
  const conflict = ds !== 'other' && gs !== 'other' && ds !== gs
  const shape = conflict ? gs : ds !== 'other' ? ds : gs
  if (shape === 'purchase') return 'purchase'
  if (shape === 'refinance') return 'refi'
  if (shape === 'renewal') return 'renewal'
  return 'unknown'
}

// ─── The journey (per-file): phases with states + the current phase steps ───

export type JourneyState = 'done' | 'current' | 'upcoming'

export interface JourneyPhase extends LifecyclePhase {
  state: JourneyState
}

export interface JourneyStep extends LifecycleStep {
  state: JourneyState
}

export interface Journey {
  // False = the stage maps to no phase; render the loud amber state.
  mapped: boolean
  rawStage: string | null
  phases: JourneyPhase[]
  currentPhase: PhaseKey | null
  // The current phase's steps for this shape; empty when unmapped.
  steps: JourneyStep[]
  // The current step's label in plain words, or the phase description when
  // no step claims the stage.
  caption: string | null
}

/**
 * The per-file journey. The caller declares its stage space — the two
 * vocabularies collide on 'submitted' (display space = intake, a workbench
 * room = with the lender), so guessing is not honest. 'room' resolves
 * through the board's own boardColumnFor (one vocabulary map, never
 * duplicated) with the display map as fallback; 'display' resolves the
 * display map only. A funded file shows Beyond funding current.
 */
export function journeyForStage(input: {
  stage: string | null
  shape: StepShape
  space: 'display' | 'room'
}): Journey {
  const raw = input.stage
  const key = (raw ?? '').toLowerCase().trim()

  let phase: PhaseKey | null = null
  if (key) {
    if (input.space === 'room') {
      const b = boardColumnFor(key)
      if (b.mapped) phase = b.column === 'funded' ? 'beyond_funding' : phaseForBoardColumn(b.column)
      if (!phase) phase = phaseForDisplayStage(key)
    } else {
      phase = phaseForDisplayStage(key)
    }
  }

  if (!phase) {
    return {
      mapped: false,
      rawStage: raw,
      phases: LIFECYCLE_PHASES.map(p => ({ ...p, state: 'upcoming' as const })),
      currentPhase: null,
      steps: [],
      caption: null,
    }
  }

  const currentIdx = PHASE_INDEX[phase]
  const phases: JourneyPhase[] = LIFECYCLE_PHASES.map((p, i) => ({
    ...p,
    state: i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'upcoming',
  }))

  const stepDefs = PHASE_STEPS[phase][input.shape]
  const matchIdx = stepDefs.findIndex(s => (s.stages ?? []).includes(key))
  const steps: JourneyStep[] = stepDefs.map((s, i) => ({
    ...s,
    state:
      // A planned capability is never done and never where the file is.
      s.status === 'planned'
        ? 'upcoming'
        : matchIdx === -1
          ? 'upcoming'
          : i < matchIdx
            ? 'done'
            : i === matchIdx
              ? 'current'
              : 'upcoming',
  }))

  return {
    mapped: true,
    rawStage: raw,
    phases,
    currentPhase: phase,
    steps,
    caption: matchIdx >= 0 ? stepDefs[matchIdx].label : LIFECYCLE_PHASES[currentIdx].description,
  }
}
