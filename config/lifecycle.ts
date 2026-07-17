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

// ─── Display stage → board column (B2a: the board positions from Zoho) ──────
// Zoho is the system of record for stage; the board positions every card by
// the linked deal's DISPLAY stage through this map (the workbench room stage
// is only the fallback when no Zoho deal is linked or fetched). Boundaries
// are positions in the imported funnel order, same discipline as the phase
// map above. Totality and phase consistency are tested: for every funnel
// stage, phaseForBoardColumn(columnForDisplayStage(s)) === phaseForDisplayStage(s).

const COLUMN_BY_DISPLAY = new Map<string, BoardColumn>()
for (const s of segment('Lead', 'Submitted')) COLUMN_BY_DISPLAY.set(s.toLowerCase(), 'intake')
for (const s of segment('Collecting Documentation', 'Underwriting In Progress'))
  COLUMN_BY_DISPLAY.set(s.toLowerCase(), 'evidence')
for (const s of segment('Ready to Submit', 'Ready to Submit'))
  COLUMN_BY_DISPLAY.set(s.toLowerCase(), 'packaging')
for (const s of segment('Submitted to Lender', 'Submitted to Lender'))
  COLUMN_BY_DISPLAY.set(s.toLowerCase(), 'with_lender')
for (const s of segment('Conditionally Approved', 'Approved'))
  COLUMN_BY_DISPLAY.set(s.toLowerCase(), 'conditions')
for (const s of segment('Broker Complete', 'Broker Complete'))
  COLUMN_BY_DISPLAY.set(s.toLowerCase(), 'ready')
for (const s of FUNDED_STAGES) COLUMN_BY_DISPLAY.set(s.toLowerCase(), 'funded')
// The same belts the phase map carries (legacy + verbatim actual-space reads;
// reads normalize at the fetcher boundary, these keep the map total on raw input).
COLUMN_BY_DISPLAY.set('qualification', 'intake')
COLUMN_BY_DISPLAY.set('ready to close', 'ready')
COLUMN_BY_DISPLAY.set('mortgage closed', 'funded')

/**
 * Maps a Zoho DISPLAY stage to its board column. Unknown stages return null
 * — the caller falls back to the room's own stage and says so on the card,
 * never a silent bucket.
 */
export function columnForDisplayStage(stage: string): BoardColumn | null {
  return COLUMN_BY_DISPLAY.get(stage.toLowerCase().trim()) ?? null
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

// B2b (Task 6): the Complete & paid steps are Broker complete → Compliance
// package → Paid. The compliance step's live state comes from the Zoho
// Compliance_Status field (read-only) on the room's Complete-and-paid
// section; the stage matchers below only place a file INTO the phase.
const COMPLETE_STEPS: LifecycleStep[] = [
  step('broker_complete', 'Broker complete', 'manual', {
    note: 'Michael confirms broker complete, instructs the lawyer, and moves the stage in Zoho by hand.',
    stages: ['broker complete', 'broker_complete', 'ready to close', 'ready'],
  }),
  step('compliance_package', 'Compliance package', 'manual', {
    note: 'Assemble the package per the BRX Ontario checklist and submit it with the compliance submission skill.',
  }),
  step('paid', 'Paid', 'live'),
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

// ─── The next action (B2b, Task 3): ONE mapping from lifecycle step to what
// Michael does next. Never per-page copy. An action with a roomSection is a
// real destination inside the deal room (a button); an action without one is
// by-hand work today (rendered as the `manual` chip with quiet text, no
// button — the note names the by-hand path). `manual: true` marks actions
// the platform cannot perform yet, whether or not a destination exists.

export type RoomSectionAnchor = 'documents' | 'notes' | 'conditions' | 'closeout' | 'room'

export interface NextAction {
  key: string
  label: string
  // True = the platform cannot perform this yet; the row carries the
  // `manual` chip and the note names the by-hand path.
  manual: boolean
  note?: string
  // Where the action lands inside the deal room. Absent = no route exists
  // yet (the action renders as quiet text, never a decorative button).
  roomSection?: RoomSectionAnchor
}

const A_CHASE_DOCUMENTS: NextAction = {
  key: 'chase_documents',
  label: 'Chase documents',
  manual: false,
  roomSection: 'documents',
}
const A_GENERATE_NOTES: NextAction = {
  key: 'generate_lender_notes',
  label: 'Generate lender notes',
  manual: false,
  roomSection: 'notes',
}
const A_WORK_CONDITIONS: NextAction = {
  key: 'work_conditions',
  label: 'Work conditions',
  manual: false,
  roomSection: 'conditions',
}
const A_CONFIRM_BROKER_COMPLETE: NextAction = {
  key: 'confirm_broker_complete',
  label: 'Confirm broker complete',
  manual: true,
  note: 'The stage change to Broker Complete is made by hand in Zoho.',
  roomSection: 'room',
}
const A_ASSEMBLE_COMPLIANCE: NextAction = {
  key: 'assemble_compliance',
  label: 'Assemble compliance package',
  manual: true,
  note: 'Assemble the package per the BRX Ontario checklist and submit it with the compliance submission skill.',
  roomSection: 'closeout',
}
const A_NUDGE_APPLICATION: NextAction = {
  key: 'nudge_application',
  label: 'Nudge the application',
  manual: true,
  note: 'No automated chase exists yet. Michael nudges the application by hand, with a call or a text.',
}
const A_REACH_OUT: NextAction = {
  key: 'reach_out',
  label: 'Reach out and qualify',
  manual: true,
  note: 'Michael reaches out and qualifies new leads by hand today.',
}
const A_PRESENT_OPTIONS: NextAction = {
  key: 'present_options',
  label: 'Present the options',
  manual: true,
  note: 'Michael builds the plan and presents the options himself.',
}
const A_NUDGE_LENDER: NextAction = {
  key: 'nudge_lender',
  label: 'Nudge the lender',
  manual: true,
  note: 'Michael watches for the lender decision and nudges when it drags.',
}

// Step key → action. Planned steps never match a stage, so they never reach
// this map at render time; the phase fallback below keeps the mapping total
// for stages no step claims (the legacy Qualification shape).
const ACTION_BY_STEP: Record<string, NextAction> = {
  qualify: A_REACH_OUT,
  application: A_NUDGE_APPLICATION,
  first_review: A_CHASE_DOCUMENTS,
  documents: A_CHASE_DOCUMENTS,
  underwrite: A_GENERATE_NOTES,
  plan: A_PRESENT_OPTIONS,
  preapproval_letter: A_PRESENT_OPTIONS,
  package_submit: A_GENERATE_NOTES,
  with_lender: A_NUDGE_LENDER,
  commitment: A_WORK_CONDITIONS,
  conditions: A_WORK_CONDITIONS,
  final_approval: A_CONFIRM_BROKER_COMPLETE,
  broker_complete: A_ASSEMBLE_COMPLIANCE,
  compliance_package: A_ASSEMBLE_COMPLIANCE,
}

const ACTION_BY_PHASE: Record<PhaseKey, NextAction | null> = {
  intake: A_NUDGE_APPLICATION,
  underwriting: A_CHASE_DOCUMENTS,
  fulfilment: A_WORK_CONDITIONS,
  complete_paid: A_ASSEMBLE_COMPLIANCE,
  // Funded files carry no next action here: the list renders the muted
  // "Moves to renewals" link instead (the Renewal Radar owns them).
  beyond_funding: null,
}

/**
 * The next action for a file, from its journey. Null for unmapped stages
 * (the row is already loud amber) and for Beyond funding (renewals own it).
 */
export function nextActionForJourney(journey: Journey): NextAction | null {
  if (!journey.mapped || !journey.currentPhase) return null
  const current = journey.steps.find(s => s.state === 'current')
  if (current) {
    const byStep = ACTION_BY_STEP[current.key]
    if (byStep) return byStep
  }
  return ACTION_BY_PHASE[journey.currentPhase]
}

// ─── The client's words (B5, 2026-07-17) ─────────────────────────────────────
//
// Everything above is the words WE use. This layer is the words the CLIENT
// reads on their own status page (/portal/file/[token]). It is a config, not
// strings scattered through a component, so Michael can change a sentence by
// editing one cell and no page needs touching.
//
// THE RULES THIS LAYER INHERITS, AND EVERY FUTURE SESSION WITH IT:
//
//  1. THE PORTAL NEVER TELLS A PERSON NO. Nothing here renders a
//     qualification judgment, a decline, a rate they did not get, or a
//     reason they fell short. A person's own status page is not where they
//     learn bad news — that is a conversation with Michael, not a web page.
//     If a future phase adds qualification, it does not add it HERE.
//  2. NO INTERNAL VOCABULARY, EVER. The client never reads "underwriting",
//     "packaging", "evidence", "conditions" as a system word, a lender's
//     name we have not committed to, a system name, or the word broker.
//     Michael is a Mortgage Agent Level 2. Tests assert this.
//  3. NO PLACEHOLDERS. The internal surfaces show planned capability on
//     purpose — it teaches the process. The client page must not: a
//     placeholder on a client's page just advertises what we cannot do yet.
//     Steps with status 'planned' carry words here for totality, and the
//     page filters them out. They must never render.
//  4. GRADE 6, WARM, CONTRACTIONS, PLAIN. Short sentences. No dashes, no
//     exclamation points, no semicolons. Read it aloud: it should sound
//     like Michael talking, not a system reporting.
//  5. TOTAL. Every phase and every step key above has words below, enforced
//     by tests/client-portal.test.ts — so adding a lifecycle step fails
//     loudly here rather than shipping a blank line to a client.
//
// Shape-awareness is inherited, not restated: PHASE_STEPS already decides
// which steps a purchase or a renewal sees, so keying these by step key
// makes the client words shape-aware for free.

export interface ClientWords {
  /** The client-facing name for this phase or step. */
  label: string
  /** One warm sentence: what is happening right now. */
  happening: string
  /** One sentence, only when the step genuinely needs something of them. */
  needFromYou?: string
}

/** What the client reads when a stage maps to no phase. Calm, never an error. */
export const CLIENT_UNMAPPED: ClientWords = {
  label: 'Your file',
  happening: "We're working on your file. Michael will be in touch with an update.",
}

export const CLIENT_PHASES: Record<PhaseKey, ClientWords> = {
  intake: {
    label: 'Getting started',
    happening: "Your file's open and we're getting your application together.",
  },
  underwriting: {
    label: 'Reviewing your file',
    happening: "We're going through everything and getting your file ready for lenders.",
  },
  fulfilment: {
    label: 'Finalizing your approval',
    happening: "Your lender said yes. Now we're tying up the last details.",
  },
  complete_paid: {
    label: 'Closing',
    happening: "Everything's done on our side and your lawyer takes it from here.",
  },
  beyond_funding: {
    label: 'Looking after it',
    happening: "Your mortgage is done. We keep an eye on it from here.",
  },
}

/**
 * Client words per step key. Keys match PHASE_STEPS exactly (tested).
 * 'planned' steps carry words so this map stays total as the lifecycle
 * grows, but the client page never renders them (rule 3).
 */
export const CLIENT_STEPS: Record<string, ClientWords> = {
  // Getting started
  qualify: {
    label: 'Getting to know your plans',
    happening: "Michael wants to hear what you're hoping to do, so he can point you the right way.",
    needFromYou: 'Give Michael a call or reply to his message whenever it suits you.',
  },
  application: {
    label: 'Your application',
    happening: "We're getting your application filled in.",
    needFromYou: 'Finishing your application is the one thing that gets this moving.',
  },
  application_chase: {
    label: 'A gentle reminder',
    happening: "We'll remind you if your application still needs something.",
  },
  first_review: {
    label: 'Reading it over',
    happening: "Michael's reading through everything you sent.",
  },

  // Reviewing your file
  documents: {
    label: 'Your paperwork',
    happening: "We're gathering the paperwork your lender needs to see.",
    needFromYou: "Sending anything we've asked for is what moves this along fastest.",
  },
  underwrite: {
    label: 'Checking the numbers',
    happening: "Michael's going through your file in detail and checking every number.",
  },
  plan: {
    label: 'Your options',
    happening: "Michael's putting your options together so you can pick what fits.",
  },
  preapproval_letter: {
    label: 'Your pre-approval letter',
    happening: "Michael's getting your letter ready so you can shop knowing your number.",
  },
  shopping: {
    label: 'Out looking',
    happening: "You're pre-approved and out looking. Tell us when you find the one.",
  },
  package_submit: {
    label: 'Off to your lender',
    happening: "Michael's putting your file together and sending it to your lender.",
  },
  with_lender: {
    label: "It's with your lender",
    happening: "Your file's with the lender and we're waiting on their answer. Michael checks in if it goes quiet.",
  },

  // Finalizing your approval
  commitment: {
    label: "Your approval's in",
    happening: "Your lender said yes. Michael's going through the paperwork now.",
  },
  conditions: {
    label: 'The last few items',
    happening: "Your lender asked for a few final things and we're working through them.",
    needFromYou: "If we've asked you for anything, sending it back quickly keeps your closing date safe.",
  },
  final_approval: {
    label: 'Final sign-off',
    happening: "We're confirming the last sign-off with your lender.",
  },

  // Closing
  broker_complete: {
    label: "Everything's set",
    happening: "Everything's done on our side. Your lawyer takes it from here.",
    needFromYou: 'Your lawyer will be in touch to book your signing.',
  },
  compliance_package: {
    label: 'Filing the paperwork',
    happening: "We're filing the last of the paperwork.",
  },
  paid: {
    label: 'All done',
    happening: 'Your mortgage is funded and everything is complete. Congratulations.',
  },

  // Looking after it
  renewal_watch: {
    label: "We're watching your renewal",
    happening: "We keep an eye on your renewal date so it never sneaks up on you.",
  },
  monitoring: {
    label: 'Strategic Mortgage Monitoring',
    happening:
      "Every month we check your mortgage against what's out there, and Michael reaches out when there's something worth doing.",
  },
  renewal_outreach: {
    label: 'Your renewal check-in',
    happening: "We'll be in touch well before your renewal comes up.",
  },
}

export interface ClientJourneyPhase {
  key: PhaseKey
  label: string
  state: JourneyState
}

export interface ClientJourney {
  /** False = the stage maps to no phase: the page shows the calm generic. */
  mapped: boolean
  phases: ClientJourneyPhase[]
  /** The current phase in the client's words; null when unmapped. */
  current: (ClientWords & { key: PhaseKey }) | null
  /** The current step's words, when a step claims the stage. */
  step: ClientWords | null
  /** The one thing we need from them, if this step needs anything. */
  needFromYou: string | null
}

/**
 * The client's view of a file's journey, from the same Journey the internal
 * surfaces render. Planned steps never surface (rule 3): they carry no
 * stages, so they can never be current, and the belt is here anyway.
 */
export function clientJourneyFor(journey: Journey): ClientJourney {
  if (!journey.mapped || !journey.currentPhase) {
    return {
      mapped: false,
      phases: LIFECYCLE_PHASES.map(p => ({
        key: p.key,
        label: CLIENT_PHASES[p.key].label,
        state: 'upcoming' as const,
      })),
      current: null,
      step: null,
      needFromYou: null,
    }
  }

  const phases: ClientJourneyPhase[] = journey.phases.map(p => ({
    key: p.key,
    label: CLIENT_PHASES[p.key].label,
    state: p.state,
  }))

  const currentStep = journey.steps.find(s => s.state === 'current' && s.status !== 'planned')
  const stepWords = currentStep ? (CLIENT_STEPS[currentStep.key] ?? null) : null

  return {
    mapped: true,
    phases,
    current: { key: journey.currentPhase, ...CLIENT_PHASES[journey.currentPhase] },
    step: stepWords,
    needFromYou: stepWords?.needFromYou ?? null,
  }
}

/** Every step key the lifecycle defines, deduped. The totality test's input. */
export function allStepKeys(): string[] {
  const keys = new Set<string>()
  for (const phase of Object.values(PHASE_STEPS)) {
    for (const steps of Object.values(phase)) {
      for (const s of steps) keys.add(s.key)
    }
  }
  return Array.from(keys)
}
