// The four-phase model, pure (Deals Beta, 2026-08-01).
//
// Source: fox-underwriting docs/design/four-phase-model-handoff.md section 5.
// No fetching, no React, no clock — every function takes what it needs and is
// unit-tested in tests/four-phase.test.ts.
//
// THE RULE THIS MODULE EXISTS TO ENFORCE: never invent a number. Two places
// where that bites, both encoded here rather than left to a component:
//
//   1. DAYS IN STAGE is measured from the event that entered the deal's
//      CURRENT stage — not from the deal's latest event of any kind. Live data
//      has deals whose only stage event records entry into `submitted` while
//      the deal now sits in `lender_response`. Using the latest event there
//      would print "days since submitted" under a heading that says
//      lender_response, which is a fabricated figure wearing a real one's
//      clothes. When entry into the current stage is not recorded, there is no
//      number, and the card says why in words instead.
//   2. THE TWO UNITS ARE NEVER ADDED. Contact-level phases count people;
//      deal-level phases count files and carry a dollar total. There is
//      deliberately no function here that returns a combined total, so no
//      caller can accidentally produce one.

// ─── The four phases ────────────────────────────────────────────────────────

export type PhaseKey = 'intake' | 'advise' | 'fund' | 'monitor'
/** Order is the model's order and is not configurable — the bar never changes. */
export const PHASE_ORDER: readonly PhaseKey[] = ['intake', 'advise', 'fund', 'monitor']

/** contact = counts people, drawn dashed. deal = counts files with a dollar
 * total, drawn solid. The visual difference is load-bearing: it is what stops
 * the four counts reading as one pipeline. */
export type PhaseUnit = 'contact' | 'deal'

export interface PhaseMeta {
  key: PhaseKey
  label: string
  unit: PhaseUnit
  /** One plain sentence describing what the phase is for. */
  blurb: string
  /** Phases that render as boards in this build. The other two are honest
   * placeholders — see PHASE_PLACEHOLDER. */
  rendersBoard: boolean
}

export const PHASES: Record<PhaseKey, PhaseMeta> = {
  intake: {
    key: 'intake',
    label: 'Intake',
    unit: 'contact',
    blurb: 'Reach, capture, engage, discovery call, routed. Leads arrive by two doors.',
    rendersBoard: false,
  },
  advise: {
    key: 'advise',
    label: 'Advise',
    unit: 'deal',
    blurb: 'Application through the strategy session. Measured on conversion, not speed.',
    rendersBoard: true,
  },
  fund: {
    key: 'fund',
    label: 'Fund',
    unit: 'deal',
    blurb: 'Submission through funding. Measured on time and blockage, not conversion.',
    rendersBoard: true,
  },
  monitor: {
    key: 'monitor',
    label: 'Monitor',
    unit: 'contact',
    blurb: 'Enrolled, monitored, opportunity found, renewal window. Exits back into Advise.',
    rendersBoard: false,
  },
}

/** Why a non-board phase is not a board yet, in one plain sentence each. These
 * render on the page instead of a fake body — rule 4, the page says so. */
export const PHASE_PLACEHOLDER: Record<'intake' | 'monitor', string> = {
  intake:
    'Intake is not built yet because the capture and consent fields it needs do not exist. There is no source for them, and rec.consents currently holds no rows.',
  monitor:
    'Monitor is not built here on purpose. The Opportunities engine already does this job, and this panel should embed it rather than rebuild it.',
}

export function isPhaseKey(v: string | null | undefined): v is PhaseKey {
  return v === 'intake' || v === 'advise' || v === 'fund' || v === 'monitor'
}

// ─── Columns, built from configuration ──────────────────────────────────────

export interface StageLike {
  code: string
  label: string
  description: string | null
  sort_order: number
  phase: string | null
  is_active?: boolean
}

export interface DealLike {
  id: string
  file_ref: string | null
  deal_type: string | null
  stage_code: string | null
  mortgage_amount: number | null
  blocked_by: string | null
}

/** Columns for a phase, in sort_order. Stages come from the table at runtime,
 * so adding a stage row adds a column with no code change. A stage whose
 * `phase` is null belongs to no board and never appears. */
export function columnsForPhase(stages: readonly StageLike[], phase: PhaseKey): StageLike[] {
  return stages
    .filter(s => s.phase === phase && s.is_active !== false)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
}

export interface ColumnTotals {
  count: number
  /** Sum of mortgage_amount over the deals in this column. Deals with no
   * amount contribute nothing rather than a zero standing in for a figure. */
  amount: number
  /** True when at least one deal in the column has no mortgage_amount, so the
   * total can be labelled as covering only part of the column. */
  partial: boolean
}

export function columnTotals(deals: readonly DealLike[]): ColumnTotals {
  let amount = 0
  let partial = false
  for (const d of deals) {
    if (typeof d.mortgage_amount === 'number' && Number.isFinite(d.mortgage_amount)) {
      amount += d.mortgage_amount
    } else {
      partial = true
    }
  }
  return { count: deals.length, amount, partial }
}

export function dealsInStage(deals: readonly DealLike[], stageCode: string): DealLike[] {
  return deals.filter(d => d.stage_code === stageCode)
}

/** Files and dollars for a whole phase — deal-level phases only. There is no
 * contact-level equivalent that returns money, and no function anywhere that
 * adds a contact count to a deal count. */
export function phaseTotals(
  stages: readonly StageLike[],
  deals: readonly DealLike[],
  phase: PhaseKey,
): ColumnTotals {
  const codes = new Set(columnsForPhase(stages, phase).map(s => s.code))
  return columnTotals(deals.filter(d => d.stage_code && codes.has(d.stage_code)))
}

// ─── Days in stage ──────────────────────────────────────────────────────────

export interface StageEventLike {
  deal_id: string
  to_stage: string | null
  changed_at: string | null
}

/** Why a deal shows no days figure. The card renders these as words, never as
 * a 0 or a dash — a dash reads as zero, and a deal that has not moved since
 * March must never render as 0 days. */
export type DaysUnknownReason = 'no_history' | 'entry_not_recorded'

export type DaysInStage =
  | { known: true; days: number; since: string }
  | { known: false; reason: DaysUnknownReason }

export const DAYS_UNKNOWN_COPY: Record<DaysUnknownReason, string> = {
  no_history: 'no stage history',
  entry_not_recorded: 'stage entry not recorded',
}

/**
 * Days the deal has been in the stage it is in now.
 *
 * Only an event whose `to_stage` equals the deal's CURRENT `stage_code` can
 * answer this. A deal with events that stop short of its current stage has a
 * history but not the one fact being asked for, and that is a different state
 * from having no history at all — the two are distinguished so the card can
 * say which.
 *
 * `nowISO` is passed in; this module never reads a clock.
 */
export function daysInStage(
  deal: DealLike,
  events: readonly StageEventLike[],
  nowISO: string,
): DaysInStage {
  const mine = events.filter(e => e.deal_id === deal.id)
  if (mine.length === 0) return { known: false, reason: 'no_history' }
  if (!deal.stage_code) return { known: false, reason: 'entry_not_recorded' }

  const entries = mine.filter(e => e.to_stage === deal.stage_code && e.changed_at)
  if (entries.length === 0) return { known: false, reason: 'entry_not_recorded' }

  // The most recent entry into the current stage: a deal can re-enter a stage,
  // and the current dwell starts at the latest entry, not the first.
  let latest = entries[0].changed_at as string
  for (const e of entries) {
    if ((e.changed_at as string) > latest) latest = e.changed_at as string
  }
  const ms = Date.parse(nowISO) - Date.parse(latest)
  if (!Number.isFinite(ms)) return { known: false, reason: 'entry_not_recorded' }
  return { known: true, days: Math.max(0, Math.floor(ms / 86_400_000)), since: latest.slice(0, 10) }
}

// ─── Blocked by ─────────────────────────────────────────────────────────────

export type BlockedBy = 'you' | 'client' | 'lender' | 'lawyer'
export const BLOCKED_BY_LABELS: Record<BlockedBy, string> = {
  you: 'You',
  client: 'Client',
  lender: 'Lender',
  lawyer: 'Lawyer',
}

/**
 * The chip, or nothing. Only the four known values produce a chip; null,
 * empty, and anything unrecognised produce nothing at all. Do not guess — a
 * wrong "who is holding this up" is worse than no answer, because the whole
 * point of the chip is that scanning for You answers what to do today.
 */
export function blockedByChip(value: string | null | undefined): BlockedBy | null {
  if (!value) return null
  const v = value.trim().toLowerCase()
  return v === 'you' || v === 'client' || v === 'lender' || v === 'lawyer' ? v : null
}

/** Only You gets the attention treatment. The others sit quiet — they are
 * information, not a call to act. */
export function isActionableChip(chip: BlockedBy | null): boolean {
  return chip === 'you'
}

// ─── Borrower names ─────────────────────────────────────────────────────────

export interface DealClientLike {
  deal_id: string
  role: string | null
  full_name: string | null
}

export interface NamedBorrower {
  name: string
  role: string
}

/** Role codes render as words. An unknown role keeps its raw value rather than
 * being dropped or relabelled as something it is not. */
export function roleLabel(role: string | null): string {
  if (!role) return 'applicant'
  const map: Record<string, string> = {
    primary_applicant: 'primary',
    co_applicant: 'co-applicant',
    guarantor: 'guarantor',
  }
  return map[role] ?? role.replace(/_/g, ' ')
}

/** Borrowers for a deal, primary first, then the rest in stable order. Rows
 * with no resolvable name are dropped rather than rendered as a blank. */
export function borrowersFor(
  deal: DealLike,
  links: readonly DealClientLike[],
): NamedBorrower[] {
  const rank = (r: string | null) => (r === 'primary_applicant' ? 0 : 1)
  return links
    .filter(l => l.deal_id === deal.id && l.full_name)
    .slice()
    .sort((a, b) => rank(a.role) - rank(b.role))
    .map(l => ({ name: l.full_name as string, role: roleLabel(l.role) }))
}

// ─── Purpose ────────────────────────────────────────────────────────────────

/** Deal purpose as a word. Null renders as nothing, never as "unknown", which
 * would read as a recorded value. */
export function purposeLabel(dealType: string | null): string | null {
  if (!dealType) return null
  const v = dealType.trim().toLowerCase()
  const map: Record<string, string> = {
    purchase: 'Purchase',
    refinance: 'Refinance',
    renewal: 'Renewal',
    switch: 'Switch',
    heloc: 'HELOC',
  }
  return map[v] ?? dealType
}

// ─── Money ──────────────────────────────────────────────────────────────────

/** Column and phase totals. Whole dollars — these are sums for scanning, not
 * statements of a balance. */
export function fmtTotal(amount: number): string {
  return `$${Math.round(amount).toLocaleString('en-CA')}`
}

/** A single deal's mortgage amount, or null when there is none recorded. */
export function fmtAmount(amount: number | null): string | null {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null
  return `$${Math.round(amount).toLocaleString('en-CA')}`
}
