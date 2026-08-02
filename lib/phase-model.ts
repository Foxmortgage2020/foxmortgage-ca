// The phase model, pure (Deals Beta rebuild, 2026-08-02b).
//
// NOTHING ABOUT THE MODEL IS HARDCODED HERE. Phases, their order, unit,
// whether they carry money, whether they have steps at all, which stages
// belong to them, which are gates, each stage's probability, where the loop
// returns, Attract's sources, the card-tag rules and the milestone types all
// arrive as ROWS and are read at runtime. This module holds RULES, not shape.
//
// The record layer has moved three times under this page. `advise` and `fund`
// are gone as codes (superseded by `underwriting` and `fulfilment`), Monitor
// grew from five steps to seven, and stages gained a probability. None of that
// required a change here beyond the rules below, which is the property the
// page exists to demonstrate.
//
// FOUR RULES IT EXISTS TO ENFORCE:
//
//   1. DAYS IN STAGE is measured from the event that entered the deal's
//      CURRENT stage — never from its latest event of any kind. When entry
//      into the current stage is not recorded there is no number, and the two
//      absent states stay distinguished.
//   2. THE UNITS ARE NEVER ADDED. Three of them (arrivals, people, files).
//      There is no function here that totals across phases.
//   3. A NULL PROBABILITY IS NOT ZERO. Intake and Monitor stages carry null
//      because they count people; 0 is what a LOST deal means. A null never
//      renders as 0, never enters a sum, and never lets its phase into a
//      weighted total.
//   4. A PROJECTION IS NOT AN ACTUAL. Weighted figures are computed here and
//      carry a flag that forces the caller to mark them.

// ─── Phases ─────────────────────────────────────────────────────────────────

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
  probability?: number | null
}

export interface DealLike {
  id: string
  file_ref: string | null
  deal_type: string | null
  stage_code: string | null
  status: string | null
  mortgage_amount: number | null
  blocked_by: string | null
  [key: string]: unknown
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

/** Land on the first phase that counts files, so the page opens on work. */
export function defaultPhaseCode(phases: readonly PhaseLike[]): string | null {
  const ordered = orderedPhases(phases)
  return (ordered.find(p => p.counts_dollars) ?? ordered[0])?.code ?? null
}

export function isDealLevel(phase: PhaseLike): boolean {
  return phase.level === 'deal'
}

export function hasSteps(phase: PhaseLike): boolean {
  return phase.is_ordered
}

// ─── Columns ────────────────────────────────────────────────────────────────

/** Every stage of a phase in sort_order, INCLUDING empty ones. Nothing here
 * filters on occupancy: an empty column is information, a missing column is a
 * lie about the process. */
export function columnsForPhase(stages: readonly StageLike[], phaseCode: string): StageLike[] {
  return stages
    .filter(s => s.phase === phaseCode && s.is_active !== false)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
}

export function isGate(stage: StageLike): boolean {
  return stage.is_gate === true
}

export function dealsInStage(deals: readonly DealLike[], stageCode: string): DealLike[] {
  return deals.filter(d => d.stage_code === stageCode)
}

export interface ColumnTotals {
  count: number
  amount: number
  /** True when at least one deal carries no amount, so a total can be labelled
   * as covering only part of the column. */
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

/** Files and dollars for a whole phase, or NULL for anything not deal-level.
 * Null rather than zero is what makes summing across units impossible: a
 * caller cannot add a number it never received. */
export function phaseTotals(
  phase: PhaseLike,
  stages: readonly StageLike[],
  deals: readonly DealLike[],
): ColumnTotals | null {
  if (!isDealLevel(phase)) return null
  const codes = new Set(columnsForPhase(stages, phase.code).map(s => s.code))
  return columnTotals(deals.filter(d => d.stage_code && codes.has(d.stage_code)))
}

// ─── Probability and weighting ──────────────────────────────────────────────

/** A stage's probability, or null. Anything outside 0–100 is refused rather
 * than clamped: a clamp would silently invent a figure. */
export function stageProbability(stage: StageLike | null | undefined): number | null {
  const p = stage?.probability
  if (typeof p !== 'number' || !Number.isFinite(p)) return null
  if (p < 0 || p > 100) return null
  return p
}

export interface Weighted {
  /** Sum of amount x probability over the deals that HAVE a probability. */
  amount: number
  /** How many deals contributed. */
  counted: number
  /** How many were skipped because their stage carries no probability. A
   * caller that renders the figure without checking this is reporting a
   * partial answer as a whole one. */
  skippedNoProbability: number
  /** Always true. Carried so a caller destructuring this cannot forget that
   * what it is holding is a projection rather than a recorded figure. */
  isProjection: true
}

/**
 * Weighted value of a set of deals.
 *
 * A deal whose stage has a NULL probability is skipped and counted in
 * `skippedNoProbability` — it does not contribute zero, because zero is a
 * claim (it is what a lost deal means) and null is the absence of one.
 */
export function weightedValue(
  deals: readonly DealLike[],
  stages: readonly StageLike[],
): Weighted {
  const byCode = new Map(stages.map(s => [s.code, s]))
  let amount = 0
  let counted = 0
  let skipped = 0
  for (const d of deals) {
    const prob = stageProbability(d.stage_code ? byCode.get(d.stage_code) : null)
    const amt = typeof d.mortgage_amount === 'number' && Number.isFinite(d.mortgage_amount)
      ? d.mortgage_amount
      : null
    if (prob === null || amt === null) {
      skipped++
      continue
    }
    amount += amt * (prob / 100)
    counted++
  }
  return { amount, counted, skippedNoProbability: skipped, isProjection: true }
}

/** The footer figure for one column: its total, its stage probability, and the
 * weighted result. Returns null when the stage carries no probability, so a
 * contact-level column simply has no footer rather than a zeroed one. */
export interface ColumnWeight {
  probability: number
  weighted: number
  isProjection: true
}

export function columnWeight(stage: StageLike, deals: readonly DealLike[]): ColumnWeight | null {
  const prob = stageProbability(stage)
  if (prob === null) return null
  const { amount } = columnTotals(deals)
  return { probability: prob, weighted: amount * (prob / 100), isProjection: true }
}

// ─── Terminal stages and the Archive ────────────────────────────────────────

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

/** Terminal files with the outcome attached, grouped by outcome. Lost to a
 * competitor is a remarketing lead and cancelled is not, so the two never
 * collapse into "closed". */
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

/** Deals sitting in a stage that belongs to a live phase — the board's
 * population, excluding archived files. */
export function boardDeals(stages: readonly StageLike[], deals: readonly DealLike[]): DealLike[] {
  const phased = new Set(stages.filter(s => s.phase !== null).map(s => s.code))
  return deals.filter(d => d.stage_code && phased.has(d.stage_code))
}

// ─── The return rail ────────────────────────────────────────────────────────

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

export type DaysUnknownReason = 'no_history' | 'entry_not_recorded'

export type DaysInStage =
  | { known: true; days: number; since: string }
  | { known: false; reason: DaysUnknownReason }

export const DAYS_UNKNOWN_COPY: Record<DaysUnknownReason, string> = {
  no_history: 'no stage history',
  entry_not_recorded: 'stage entry not recorded',
}

/** Unchanged from the first build, deliberately. Only an event whose
 * `to_stage` equals the deal's CURRENT `stage_code` can answer this; history
 * that stops short is a different state from no history at all. */
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

  let latest = entries[0].changed_at as string
  for (const e of entries) if ((e.changed_at as string) > latest) latest = e.changed_at as string
  const ms = Date.parse(nowISO) - Date.parse(latest)
  if (!Number.isFinite(ms)) return { known: false, reason: 'entry_not_recorded' }
  return { known: true, days: Math.max(0, Math.floor(ms / 86_400_000)), since: latest.slice(0, 10) }
}

// ─── Card tags ──────────────────────────────────────────────────────────────
//
// THE RULE FORMAT IS THREE SCALAR COLUMNS AND MUST STAY THAT WAY. field,
// operator, value. It cannot express a conjunction, a join or a time window,
// and the answer to wanting one is a record-layer change, not a rules engine
// here.

export interface CardTagLike {
  code: string
  label: string
  description: string | null
  colour_token: string | null
  rule_field: string
  rule_operator: string
  rule_value: string | null
  sort_order: number
}

/** Why a tag produced no verdict, as distinct from producing "false". */
export type TagOutcome =
  | { state: 'active' }
  | { state: 'inactive' }
  /** The rule names a field the deal row does not carry, so the rule cannot be
   * evaluated at all. NOT the same as the condition being false. */
  | { state: 'unevaluable'; reason: 'missing_field' | 'missing_value' | 'unknown_operator' }

/**
 * Evaluate one tag rule against one deal.
 *
 * THE CASE THAT MATTERS: `no_next_step` tests `next_activity_at is_null`, and
 * `rec.deals` HAS NO SUCH COLUMN (Postgres answers 42703). Treating an absent
 * column as a null value would put "No next step" on every file — a signal
 * invented out of a field nobody records. So a rule whose field is not present
 * on the row is `unevaluable` and renders nothing.
 *
 * A rule needing a value it does not have (`gte` with a null threshold) is
 * likewise unevaluable rather than defaulted to zero.
 */
export function evaluateTag(tag: CardTagLike, deal: DealLike): TagOutcome {
  if (!(tag.rule_field in deal)) {
    return { state: 'unevaluable', reason: 'missing_field' }
  }
  const actual = deal[tag.rule_field]

  switch (tag.rule_operator) {
    case 'is_null':
      return actual === null || actual === undefined ? { state: 'active' } : { state: 'inactive' }
    case 'is_not_null':
      return actual !== null && actual !== undefined ? { state: 'active' } : { state: 'inactive' }
    case 'eq':
      if (tag.rule_value === null) return { state: 'unevaluable', reason: 'missing_value' }
      return String(actual) === tag.rule_value ? { state: 'active' } : { state: 'inactive' }
    case 'neq':
      if (tag.rule_value === null) return { state: 'unevaluable', reason: 'missing_value' }
      return String(actual) !== tag.rule_value ? { state: 'active' } : { state: 'inactive' }
    case 'gte':
    case 'gt':
    case 'lte':
    case 'lt': {
      if (tag.rule_value === null) return { state: 'unevaluable', reason: 'missing_value' }
      const threshold = Number(tag.rule_value)
      const value = Number(actual)
      if (!Number.isFinite(threshold) || !Number.isFinite(value)) {
        return { state: 'unevaluable', reason: 'missing_value' }
      }
      const ok =
        tag.rule_operator === 'gte' ? value >= threshold
        : tag.rule_operator === 'gt' ? value > threshold
        : tag.rule_operator === 'lte' ? value <= threshold
        : value < threshold
      return ok ? { state: 'active' } : { state: 'inactive' }
    }
    default:
      // An operator this build does not know is never guessed at.
      return { state: 'unevaluable', reason: 'unknown_operator' }
  }
}

/** The tags that actually render on a card: active verdicts only. */
export function tagsForDeal(tags: readonly CardTagLike[], deal: DealLike): CardTagLike[] {
  return tags
    .filter(t => evaluateTag(t, deal).state === 'active')
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
}

/** Tags that could not be evaluated at all, for the honest note on the page.
 * Deduplicated by code — the reason is a property of the rule, not the row. */
export function unevaluableTags(
  tags: readonly CardTagLike[],
  deals: readonly DealLike[],
): { tag: CardTagLike; reason: string }[] {
  const out = new Map<string, { tag: CardTagLike; reason: string }>()
  const probe = deals[0]
  if (!probe) return []
  for (const t of tags) {
    const outcome = evaluateTag(t, probe)
    if (outcome.state === 'unevaluable') out.set(t.code, { tag: t, reason: outcome.reason })
  }
  return Array.from(out.values())
}

// ─── Milestones ─────────────────────────────────────────────────────────────

export interface MilestoneTypeLike {
  code: string
  label: string
  description: string | null
  moves_stage: boolean
  moves_to_stage_code: string | null
  sort_order: number
}

export interface DealMilestoneLike {
  deal_id: string
  milestone_type: string
  occurred_at: string | null
  note?: string | null
}

export interface RenderedMilestone {
  code: string
  label: string
  occurred_at: string | null
}

/** Dated markers for one card, oldest first. A milestone whose type is not
 * configured is dropped rather than rendered as a raw code. */
export function milestonesForDeal(
  deal: DealLike,
  milestones: readonly DealMilestoneLike[],
  types: readonly MilestoneTypeLike[],
): RenderedMilestone[] {
  const byCode = new Map(types.map(t => [t.code, t]))
  return milestones
    .filter(m => m.deal_id === deal.id && byCode.has(m.milestone_type))
    .slice()
    .sort((a, b) => (a.occurred_at ?? '').localeCompare(b.occurred_at ?? ''))
    .map(m => ({
      code: m.milestone_type,
      label: byCode.get(m.milestone_type)!.label,
      occurred_at: m.occurred_at,
    }))
}

// ─── The insights strip ─────────────────────────────────────────────────────
//
// Only what is real. A tile that cannot be computed honestly is OMITTED rather
// than shown with a placeholder, and the omission is named on the page.

export interface InsightTile {
  key: string
  label: string
  value: number
  /** Per-deal average, where one is meaningful. */
  perDeal: number | null
  /** How many deals the figure covers, and out of how many. */
  counted: number
  total: number
  /** Projections render differently from actuals — never merely labelled. */
  isProjection: boolean
  note: string | null
}

export interface Insights {
  tiles: InsightTile[]
  /** Tiles that were deliberately not built, with the reason, so the absence
   * is visible rather than silent. */
  omitted: { label: string; reason: string }[]
}

/**
 * The strip.
 *
 * `deals` is the whole population (board + archive). Amounts are summed over
 * deals that carry one; deals with no amount are excluded from a figure rather
 * than counted as zero.
 */
export function buildInsights(
  deals: readonly DealLike[],
  stages: readonly StageLike[],
): Insights {
  const byCode = new Map(stages.map(s => [s.code, s]))
  const amountOf = (d: DealLike) =>
    typeof d.mortgage_amount === 'number' && Number.isFinite(d.mortgage_amount)
      ? d.mortgage_amount
      : null
  const withAmount = deals.filter(d => amountOf(d) !== null)
  const sum = (ds: readonly DealLike[]) => ds.reduce((n, d) => n + (amountOf(d) ?? 0), 0)

  const isTerminal = (d: DealLike) => {
    const s = d.stage_code ? byCode.get(d.stage_code) : null
    return s ? s.category.startsWith('terminal_') : false
  }
  const isWon = (d: DealLike) => {
    const s = d.stage_code ? byCode.get(d.stage_code) : null
    return s ? s.category === 'terminal_won' : false
  }

  const open = withAmount.filter(d => !isTerminal(d))
  const won = withAmount.filter(isWon)
  // The weighted figure covers OPEN files only. A funded deal is an actual,
  // not a projection, and folding a certainty into a forecast is exactly how a
  // forecast starts lying.
  const weighted = weightedValue(open, stages)

  const tiles: InsightTile[] = [
    {
      key: 'total',
      label: 'Total deal amount',
      value: sum(withAmount),
      perDeal: withAmount.length ? sum(withAmount) / withAmount.length : null,
      counted: withAmount.length,
      total: deals.length,
      isProjection: false,
      note: null,
    },
    {
      key: 'open',
      label: 'Open deal amount',
      value: sum(open),
      perDeal: open.length ? sum(open) / open.length : null,
      counted: open.length,
      total: deals.length,
      isProjection: false,
      note: null,
    },
    {
      key: 'won',
      label: 'Closed won',
      value: sum(won),
      perDeal: won.length ? sum(won) / won.length : null,
      counted: won.length,
      total: deals.length,
      isProjection: false,
      note: null,
    },
    {
      key: 'weighted',
      label: 'Weighted pipeline',
      value: weighted.amount,
      perDeal: weighted.counted ? weighted.amount / weighted.counted : null,
      counted: weighted.counted,
      total: open.length,
      isProjection: true,
      note: 'open files, by stage probability',
    },
  ]

  const omitted = [
    {
      label: 'Average deal age',
      // The honest reason, stated rather than worked around.
      reason:
        'every deal row carries the same created_at, the date the record layer was seeded, so an age computed from it measures the migration rather than the file',
    },
  ]

  return { tiles, omitted }
}

// ─── Blocked by ─────────────────────────────────────────────────────────────

export type BlockedBy = 'you' | 'client' | 'lender' | 'lawyer'
export const BLOCKED_BY_LABELS: Record<BlockedBy, string> = {
  you: 'You',
  client: 'Client',
  lender: 'Lender',
  lawyer: 'Lawyer',
}

export function blockedByChip(value: unknown): BlockedBy | null {
  if (typeof value !== 'string' || !value) return null
  const v = value.trim().toLowerCase()
  return v === 'you' || v === 'client' || v === 'lender' || v === 'lawyer' ? v : null
}

/** Only You is a call to act, and only You gets the lime. */
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

// ─── Deal type, money ───────────────────────────────────────────────────────

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

export function fmtTotal(amount: number): string {
  return `$${Math.round(amount).toLocaleString('en-CA')}`
}

/** Compact form for tiles and footers, where the exact cent is noise. */
export function fmtCompact(amount: number): string {
  const n = Math.round(amount)
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}k`
  return `$${n.toLocaleString('en-CA')}`
}

export function fmtAmount(amount: number | null): string | null {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null
  return `$${Math.round(amount).toLocaleString('en-CA')}`
}

// ─── Collapse state ─────────────────────────────────────────────────────────
//
// Collapse rides the URL rather than component state, so the board stays a
// SERVER component with no client JavaScript and the read-only promise stays a
// property of its shape.

export function parseCollapsed(raw: string | null | undefined): Set<string> {
  if (!raw) return new Set()
  return new Set(
    raw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean),
  )
}

export function toggleCollapsed(current: Set<string>, code: string): string {
  const next = new Set(current)
  if (next.has(code)) next.delete(code)
  else next.add(code)
  return Array.from(next).sort().join(',')
}
