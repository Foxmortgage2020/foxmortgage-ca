// The phase model, pure (Deals Beta; five-phase update, 2026-08-02).
//
// Replaces lib/four-phase.ts. The name changed because the model did: B0c
// added Attract, a `rec.phases` table, and a third counting unit, and a module
// called four-phase describing five phases is the kind of stale name that
// misleads whoever reads it next.
//
// NOTHING ABOUT THE MODEL IS HARDCODED HERE. Phases, their order, their unit,
// whether they carry money, whether they even have steps, which stages belong
// to them, which stages are gates, where the loop returns, and what Attract's
// sources are — all of it arrives as rows and is read at runtime. This module
// holds RULES, not the shape. Adding a phase or a stage in the record layer
// changes this page with no code change, which is the whole point of a record
// layer you are trying to judge.
//
// TWO RULES IT EXISTS TO ENFORCE, unchanged from the first build:
//
//   1. DAYS IN STAGE is measured from the event that entered the deal's
//      CURRENT stage — never from the deal's latest event of any kind. Live
//      data has deals whose only event records entry into `submitted` while
//      the deal now sits in `lender_response`; using the latest event there
//      would print a real-looking figure for the wrong stage. When entry into
//      the current stage is not recorded there is no number, and the card says
//      why in words.
//   2. THE UNITS ARE NEVER ADDED. There are now THREE (arrivals, people,
//      files), not two. There is deliberately no function here that totals
//      across phases, so no caller can accidentally produce one.

// ─── Phases, straight from rec.phases ───────────────────────────────────────

/** A phase is whatever the table says it is. `unit` is the noun it counts,
 * `countsDollars` whether money is meaningful, `isOrdered` false means it has
 * no steps to move through (Attract), and `level` says what a row is. */
export interface PhaseLike {
  code: string
  label: string
  description: string | null
  sort_order: number
  unit: string
  counts_dollars: boolean
  is_ordered: boolean
  level: string
  is_active?: boolean
}

export interface StageLike {
  code: string
  label: string
  description: string | null
  sort_order: number
  phase: string | null
  category: string
  is_active?: boolean
  is_gate?: boolean
}

export interface DealLike {
  id: string
  file_ref: string | null
  deal_type: string | null
  stage_code: string | null
  mortgage_amount: number | null
  blocked_by: string | null
}

export interface PhaseReturnLike {
  code: string
  label: string
  description: string | null
  from_phase: string
  from_stage_code: string | null
  to_phase: string
  to_stage_code: string | null
  to_source_code: string | null
  sort_order: number
}

export interface AttractSourceLike {
  code: string
  label: string
  description: string | null
  channel_group: string | null
  sort_order: number
}

/** Active phases in configured order. The bar renders exactly these — five
 * today, whatever the table says tomorrow. */
export function orderedPhases(phases: readonly PhaseLike[]): PhaseLike[] {
  return phases
    .filter(p => p.is_active !== false)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
}

export function findPhase(phases: readonly PhaseLike[], code: string | null | undefined): PhaseLike | null {
  if (!code) return null
  return orderedPhases(phases).find(p => p.code === code) ?? null
}

/** The phase to land on when none is asked for: the first that actually counts
 * files, so the page opens on work rather than on a placeholder. Falls back to
 * the first phase if nothing counts dollars. */
export function defaultPhaseCode(phases: readonly PhaseLike[]): string | null {
  const ordered = orderedPhases(phases)
  return (ordered.find(p => p.counts_dollars) ?? ordered[0])?.code ?? null
}

/** Does this phase count files (and therefore hold deals and money)? Derived
 * from the row, never from the phase's name. */
export function isDealLevel(phase: PhaseLike): boolean {
  return phase.level === 'deal'
}

/** A phase with no steps renders its sources instead of a board. */
export function hasSteps(phase: PhaseLike): boolean {
  return phase.is_ordered
}

// ─── Columns ────────────────────────────────────────────────────────────────

/** Every stage of a phase, in sort_order — INCLUDING the empty ones. An empty
 * column is information and a missing column is a lie about the process, so
 * nothing here filters on occupancy. */
export function columnsForPhase(stages: readonly StageLike[], phaseCode: string): StageLike[] {
  return stages
    .filter(s => s.phase === phaseCode && s.is_active !== false)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
}

export function isGate(stage: StageLike): boolean {
  return stage.is_gate === true
}

export interface ColumnTotals {
  count: number
  /** Sum over deals that carry an amount. A deal with none contributes nothing
   * rather than a zero standing in for a figure. */
  amount: number
  /** True when at least one deal in the set has no amount, so a total can be
   * labelled as covering only part of the column. */
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

/**
 * Files and dollars for a whole phase.
 *
 * Returns null for any phase that is not deal-level, rather than a zero. A
 * zero would be a number, and this page does not print numbers it cannot
 * stand behind — Intake and Monitor have no contact-level stage data at all
 * yet, and Attract counts arrivals nobody has recorded. Making the absence a
 * null forces every caller to handle it instead of rendering "0 files".
 *
 * This is also the only totalling function in the module, and it is scoped to
 * ONE phase, which is what makes summing across units structurally impossible.
 */
export function phaseTotals(
  phase: PhaseLike,
  stages: readonly StageLike[],
  deals: readonly DealLike[],
): ColumnTotals | null {
  if (!isDealLevel(phase)) return null
  const codes = new Set(columnsForPhase(stages, phase.code).map(s => s.code))
  return columnTotals(deals.filter(d => d.stage_code && codes.has(d.stage_code)))
}

// ─── The Archive ────────────────────────────────────────────────────────────
// Terminal stages belong to no phase, so before this a lost file rendered
// nowhere at all. The outcome is the point: lost to a competitor is a
// remarketing lead and cancelled is not, so the stage label travels with the
// row rather than being flattened into "closed".

export function terminalStages(stages: readonly StageLike[]): StageLike[] {
  return stages
    .filter(s => s.category.startsWith('terminal_') && s.phase === null && s.is_active !== false)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
}

export interface ArchiveRow {
  deal: DealLike
  stage: StageLike
}

/** Deals sitting in a terminal stage, with the outcome attached. Ordered by
 * the stage's own sort_order so like outcomes group together. */
export function archiveRows(stages: readonly StageLike[], deals: readonly DealLike[]): ArchiveRow[] {
  const byCode = new Map(terminalStages(stages).map(s => [s.code, s]))
  const out: ArchiveRow[] = []
  for (const d of deals) {
    const stage = d.stage_code ? byCode.get(d.stage_code) : undefined
    if (stage) out.push({ deal: d, stage })
  }
  return out.sort(
    (a, b) =>
      a.stage.sort_order - b.stage.sort_order ||
      (a.deal.file_ref ?? '').localeCompare(b.deal.file_ref ?? ''),
  )
}

// ─── The return rail ────────────────────────────────────────────────────────

/** Where a return lands, in words, resolved against the configured stages and
 * sources. Returns null if the row points at something that no longer exists,
 * rather than rendering a dangling label. */
export function returnTarget(
  ret: PhaseReturnLike,
  phases: readonly PhaseLike[],
  stages: readonly StageLike[],
  sources: readonly AttractSourceLike[],
): string | null {
  const phase = findPhase(phases, ret.to_phase)
  if (!phase) return null
  if (ret.to_stage_code) {
    const stage = stages.find(s => s.code === ret.to_stage_code)
    return stage ? `${phase.label} · ${stage.label}` : null
  }
  if (ret.to_source_code) {
    const src = sources.find(s => s.code === ret.to_source_code)
    return src ? `${phase.label} · ${src.label}` : null
  }
  return phase.label
}

export function orderedReturns(returns: readonly PhaseReturnLike[]): PhaseReturnLike[] {
  return returns.slice().sort((a, b) => a.sort_order - b.sort_order)
}

// ─── Days in stage ──────────────────────────────────────────────────────────

export interface StageEventLike {
  deal_id: string
  to_stage: string | null
  changed_at: string | null
}

/** Why a deal shows no days figure. Rendered as words, never as a 0 or a dash
 * — a dash reads as zero, and a deal that has not moved since March must never
 * render as 0 days. */
export type DaysUnknownReason = 'no_history' | 'entry_not_recorded'

export type DaysInStage =
  | { known: true; days: number; since: string }
  | { known: false; reason: DaysUnknownReason }

export const DAYS_UNKNOWN_COPY: Record<DaysUnknownReason, string> = {
  no_history: 'no stage history',
  entry_not_recorded: 'stage entry not recorded',
}

/**
 * Days the deal has been in the stage it is in NOW.
 *
 * Only an event whose `to_stage` equals the deal's current `stage_code` can
 * answer this. A deal whose history stops short of its current stage has a
 * history but not the fact being asked for, and that is a different state from
 * having no history at all — the two stay distinguished so the card can say
 * which. `nowISO` is passed in; this module never reads a clock.
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

  // A deal can re-enter a stage; the current dwell starts at the LATEST entry.
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

/** The chip, or nothing. Only the four known values produce one; null, empty
 * and anything unrecognised produce nothing at all. A wrong "who is holding
 * this up" is worse than no answer. */
export function blockedByChip(value: string | null | undefined): BlockedBy | null {
  if (!value) return null
  const v = value.trim().toLowerCase()
  return v === 'you' || v === 'client' || v === 'lender' || v === 'lawyer' ? v : null
}

/** Only You is a call to act, and only You gets the lime. The others are
 * information and stay quiet — the You chip only means something because they
 * do. */
export function isActionableChip(chip: BlockedBy | null): boolean {
  return chip === 'you'
}

// ─── Borrowers ──────────────────────────────────────────────────────────────

export interface DealClientLike {
  deal_id: string
  role: string | null
  full_name: string | null
}

export interface NamedBorrower {
  name: string
  role: string
}

export function roleLabel(role: string | null): string {
  if (!role) return 'applicant'
  const map: Record<string, string> = {
    primary_applicant: 'primary',
    co_applicant: 'co-applicant',
    guarantor: 'guarantor',
  }
  return map[role] ?? role.replace(/_/g, ' ')
}

export function borrowersFor(deal: DealLike, links: readonly DealClientLike[]): NamedBorrower[] {
  const rank = (r: string | null) => (r === 'primary_applicant' ? 0 : 1)
  return links
    .filter(l => l.deal_id === deal.id && l.full_name)
    .slice()
    .sort((a, b) => rank(a.role) - rank(b.role))
    .map(l => ({ name: l.full_name as string, role: roleLabel(l.role) }))
}

// ─── Deal type ──────────────────────────────────────────────────────────────

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

export function fmtTotal(amount: number): string {
  return `$${Math.round(amount).toLocaleString('en-CA')}`
}

export function fmtAmount(amount: number | null): string | null {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null
  return `$${Math.round(amount).toLocaleString('en-CA')}`
}
