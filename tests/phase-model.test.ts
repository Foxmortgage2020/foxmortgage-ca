// The phase model and its colour system (Deals Beta rebuild, 2026-08-02b).
//
// Fixtures are the LIVE shape read from rec on 2026-08-02: five active phases
// (attract, intake, underwriting, fulfilment, monitor — `advise` and `fund`
// superseded), 28 active stages = intake 7 / underwriting 6 / fulfilment 5 /
// monitor 7 + 3 terminal, four gates, probability on the two deal-level phases
// only, two return paths, five attract sources, two card tags (one active), two
// milestone types, zero deal milestones, seven deals.

import { describe, expect, it } from 'vitest'
import {
  archiveRows,
  blockedByChip,
  boardDeals,
  buildInsights,
  columnTotals,
  columnWeight,
  columnsForPhase,
  conditionsForDeal,
  daysInStage,
  daysSinceFirstEvent,
  dealsInStage,
  defaultPhaseCode,
  findDealByRef,
  evaluateTag,
  findPhase,
  fmtCompact,
  fmtTotal,
  hasSteps,
  isActionableChip,
  isDealLevel,
  isGate,
  milestonesForDeal,
  orderedPhases,
  orderedReturns,
  parseCollapsed,
  phaseTotals,
  returnTarget,
  stageProbability,
  tagsForDeal,
  terminalStages,
  unplacedDeals,
  toggleCollapsed,
  unevaluableTags,
  weightedValue,
  type CardTagLike,
  type DealLike,
  type PhaseLike,
  type PhaseReturnLike,
  type StageEventLike,
  type StageLike,
} from '../lib/phase-model'
import { PHASE_HUES, PROJECTION_GREEN, columnSkin, hueFor, phaseAccent, rampPosition, typeSkin } from '../lib/phase-palette'
import { readFileSync } from 'node:fs'

const PHASES: PhaseLike[] = [
  { code: 'attract', label: 'Attract', description: null, sort_order: 10, unit: 'arrivals', counts_dollars: false, is_ordered: false, level: 'source' },
  { code: 'intake', label: 'Intake', description: null, sort_order: 20, unit: 'people', counts_dollars: false, is_ordered: true, level: 'contact' },
  { code: 'underwriting', label: 'Underwriting', description: null, sort_order: 30, unit: 'files', counts_dollars: true, is_ordered: true, level: 'deal' },
  { code: 'fulfilment', label: 'Fulfilment', description: null, sort_order: 40, unit: 'files', counts_dollars: true, is_ordered: true, level: 'deal' },
  { code: 'monitor', label: 'Monitor', description: null, sort_order: 50, unit: 'people', counts_dollars: false, is_ordered: true, level: 'contact' },
  // Superseded by the rename; must never render.
  { code: 'advise', label: 'Advise (superseded)', description: null, sort_order: 930, unit: 'files', counts_dollars: true, is_ordered: true, level: 'deal', is_active: false },
  { code: 'fund', label: 'Fund (superseded)', description: null, sort_order: 940, unit: 'files', counts_dollars: true, is_ordered: true, level: 'deal', is_active: false },
]

const st = (
  code: string, phase: string | null, sort_order: number,
  probability: number | null = null, category = 'open', is_gate = false,
): StageLike => ({ code, label: code, description: `${code} desc`, sort_order, phase, category, is_gate, probability })

const STAGES: StageLike[] = [
  st('new','intake',100), st('contacted','intake',110), st('engaged','intake',120),
  st('discovery_booked','intake',130), st('discovery_held','intake',140),
  st('invited','intake',150), st('routed','intake',160,null,'open',true),
  st('application','underwriting',200,20), st('application_complete','underwriting',210,25),
  st('documents','underwriting',220,30), st('documents_complete','underwriting',230,40),
  st('strategy_session','underwriting',240,42), st('proceeding','underwriting',250,44,'open',true),
  st('submitted','fulfilment',300,45), st('lender_response','fulfilment',310,90),
  st('conditions','fulfilment',320,95), st('lawyer_closing','fulfilment',330,98),
  st('funded','fulfilment',340,100,'terminal_won',true),
  st('enrolled','monitor',400), st('checkin_30d','monitor',410), st('annual_review','monitor',420),
  st('opportunity_found','monitor',430), st('renewal_window','monitor',440),
  st('in_conversation','monitor',450), st('decided','monitor',460,null,'open',true),
  st('lost_to_competition',null,900,0,'terminal_lost'),
  st('declined',null,910,0,'terminal_lost'),
  st('cancelled',null,920,0,'terminal_lost'),
]

const deal = (over: Partial<DealLike> & { id: string }): DealLike => ({
  file_ref: 'BRXM-F000000', deal_type: 'purchase', stage_code: 'application', status: 'active',
  mortgage_amount: 100000, blocked_by: null, ...over,
})

const LIVE: DealLike[] = [
  deal({ id:'1', file_ref:'BRXM-F050350', stage_code:'application',     mortgage_amount:494000,  deal_type:'purchase',  blocked_by:'client' }),
  deal({ id:'2', file_ref:'BRXM-F059751', stage_code:'documents',       mortgage_amount:359000,  deal_type:'renewal' }),
  deal({ id:'3', file_ref:'BRXM-F060561', stage_code:'submitted',       mortgage_amount:685400,  deal_type:'renewal',   blocked_by:'lender' }),
  deal({ id:'4', file_ref:'BRXM-F057400', stage_code:'lender_response', mortgage_amount:1160000, deal_type:'refinance', blocked_by:'lender' }),
  deal({ id:'5', file_ref:'BRXM-F025547', stage_code:'lender_response', mortgage_amount:580000,  deal_type:'refinance', blocked_by:'lender' }),
  deal({ id:'6', file_ref:'BRXM-F053724', stage_code:'funded',          mortgage_amount:635000,  deal_type:'purchase',  status:'won' }),
  deal({ id:'7', file_ref:'BRXM-F053725', stage_code:'funded',          mortgage_amount:527773,  deal_type:'purchase',  status:'won' }),
]

// ─── Phases come from the table, including the rename ───────────────────────

describe('phases are configuration', () => {
  it('renders the five ACTIVE phases and drops the superseded codes', () => {
    expect(orderedPhases(PHASES).map(p => p.code)).toEqual([
      'attract', 'intake', 'underwriting', 'fulfilment', 'monitor',
    ])
  })

  it('the advise -> underwriting rename needs no code change', () => {
    // The board reads whatever codes the table holds; nothing here knows the
    // old names, which is what let the record layer move three times.
    expect(findPhase(PHASES, 'advise')).toBeNull()
    expect(findPhase(PHASES, 'fund')).toBeNull()
    expect(findPhase(PHASES, 'underwriting')!.label).toBe('Underwriting')
    expect(defaultPhaseCode(PHASES)).toBe('underwriting')
  })

  it('level and is_ordered drive behaviour, not the phase name', () => {
    expect(hasSteps(findPhase(PHASES, 'attract')!)).toBe(false)
    expect(isDealLevel(findPhase(PHASES, 'attract')!)).toBe(false)
    expect(isDealLevel(findPhase(PHASES, 'fulfilment')!)).toBe(true)
    expect(isDealLevel(findPhase(PHASES, 'monitor')!)).toBe(false)
    expect(hasSteps(findPhase(PHASES, 'monitor')!)).toBe(true)
  })

  it('three units, and no function totals across them', () => {
    expect(new Set(orderedPhases(PHASES).map(p => p.unit))).toEqual(
      new Set(['arrivals', 'people', 'files']),
    )
    for (const c of ['attract', 'intake', 'monitor']) {
      expect(phaseTotals(findPhase(PHASES, c)!, STAGES, LIVE)).toBeNull()
    }
  })
})

// ─── Every sub-stage renders ────────────────────────────────────────────────

describe('every sub-stage is visible, occupied or not', () => {
  it('the live column counts are 7 / 6 / 5 / 7', () => {
    expect(columnsForPhase(STAGES, 'intake')).toHaveLength(7)
    expect(columnsForPhase(STAGES, 'underwriting')).toHaveLength(6)
    expect(columnsForPhase(STAGES, 'fulfilment')).toHaveLength(5)
    expect(columnsForPhase(STAGES, 'monitor')).toHaveLength(7)
    expect(columnsForPhase(STAGES, 'attract')).toHaveLength(0)
  })

  it('columns are never filtered by occupancy', () => {
    const cols = columnsForPhase(STAGES, 'underwriting')
    expect(cols).toHaveLength(6)
    expect(cols.filter(c => dealsInStage(LIVE, c.code).length > 0)).toHaveLength(2)
  })

  it('terminal stages belong to no phase and appear in no column', () => {
    const all = orderedPhases(PHASES).flatMap(p => columnsForPhase(STAGES, p.code).map(s => s.code))
    for (const t of ['lost_to_competition', 'declined', 'cancelled']) expect(all).not.toContain(t)
  })

  it('the four gates are marked', () => {
    expect(STAGES.filter(isGate).map(s => s.code)).toEqual([
      'routed', 'proceeding', 'funded', 'decided',
    ])
  })
})

// ─── THE probability rule ───────────────────────────────────────────────────

describe('a null probability is not zero', () => {
  it('contact-level stages carry null, and null is never coerced', () => {
    for (const c of ['new', 'routed', 'enrolled', 'decided']) {
      expect(stageProbability(STAGES.find(s => s.code === c)!)).toBeNull()
    }
    expect(stageProbability(STAGES.find(s => s.code === 'application')!)).toBe(20)
    expect(stageProbability(STAGES.find(s => s.code === 'funded')!)).toBe(100)
  })

  it('zero is a real probability and stays zero — it is what lost means', () => {
    expect(stageProbability(STAGES.find(s => s.code === 'declined')!)).toBe(0)
  })

  it('an out-of-range probability is refused rather than clamped', () => {
    expect(stageProbability({ ...st('x', null, 1), probability: 140 })).toBeNull()
    expect(stageProbability({ ...st('x', null, 1), probability: -5 })).toBeNull()
    expect(stageProbability({ ...st('x', null, 1), probability: Number.NaN })).toBeNull()
  })

  it('a null-probability deal is SKIPPED from a weighted total, not zeroed', () => {
    const mixed = [
      deal({ id: 'a', stage_code: 'application', mortgage_amount: 100000 }), // 20%
      deal({ id: 'b', stage_code: 'enrolled', mortgage_amount: 900000 }), // null
    ]
    const w = weightedValue(mixed, STAGES)
    expect(w.amount).toBe(20000)
    expect(w.counted).toBe(1)
    expect(w.skippedNoProbability).toBe(1)
    // Had the null been treated as 0 the amount would be identical, so assert
    // the SKIP is reported — that is the difference the caller must see.
    expect(w.skippedNoProbability).toBeGreaterThan(0)
  })

  it('a column with no probability has no footer at all', () => {
    const enrolled = STAGES.find(s => s.code === 'enrolled')!
    expect(columnWeight(enrolled, [])).toBeNull()
    const lender = STAGES.find(s => s.code === 'lender_response')!
    expect(columnWeight(lender, dealsInStage(LIVE, 'lender_response'))).toEqual({
      probability: 90,
      weighted: 1566000,
      isProjection: true,
    })
  })

  it('every weighted figure is flagged as a projection', () => {
    expect(weightedValue(LIVE, STAGES).isProjection).toBe(true)
    expect(columnWeight(STAGES.find(s => s.code === 'submitted')!, [])!.isProjection).toBe(true)
  })
})

// ─── Counts, totals, insights ───────────────────────────────────────────────

describe('counts and insights', () => {
  it('the live phase totals are underwriting 2 / $853,000 and fulfilment 5 / $3,588,173', () => {
    expect(phaseTotals(findPhase(PHASES, 'underwriting')!, STAGES, LIVE)).toMatchObject({ count: 2, amount: 853000 })
    expect(phaseTotals(findPhase(PHASES, 'fulfilment')!, STAGES, LIVE)).toMatchObject({ count: 5, amount: 3588173 })
  })

  it('a deal with no amount is excluded rather than counted as zero', () => {
    const t = columnTotals([deal({ id: 'a', mortgage_amount: 500000 }), deal({ id: 'b', mortgage_amount: null })])
    expect(t).toEqual({ count: 2, amount: 500000, partial: true })
  })

  it('the insights tiles are the four that are computable', () => {
    const ins = buildInsights(LIVE, STAGES)
    expect(ins.tiles.map(t => t.key)).toEqual(['total', 'open', 'won', 'weighted'])
    const by = (k: string) => ins.tiles.find(t => t.key === k)!
    expect(by('total').value).toBe(4441173)
    expect(by('open').value).toBe(3278400)
    expect(by('won').value).toBe(1162773)
    // Open files only, by stage probability:
    // 494000*.20 + 359000*.30 + 685400*.45 + 1160000*.90 + 580000*.90
    expect(by('weighted').value).toBeCloseTo(2080930, 0)
  })

  it('the weighted tile covers OPEN files only — a funded deal is an actual', () => {
    const ins = buildInsights(LIVE, STAGES)
    const w = ins.tiles.find(t => t.key === 'weighted')!
    expect(w.isProjection).toBe(true)
    expect(w.counted).toBe(5)
    // Folding the two funded files in at 100% would push it past open total.
    expect(w.value).toBeLessThan(ins.tiles.find(t => t.key === 'open')!.value)
  })

  it('only the weighted tile is a projection', () => {
    const ins = buildInsights(LIVE, STAGES)
    expect(ins.tiles.filter(t => t.isProjection).map(t => t.key)).toEqual(['weighted'])
  })

  it('no tile is ever labelled "average deal age" — created_at is the seed date', () => {
    // The tile that replaced it measures days since the first stage event and
    // says so; see the dedicated block below. A familiar label over a changed
    // calculation is worse than an absent tile, so the old label must not
    // reappear anywhere.
    const ins = buildInsights(LIVE, STAGES, [], '2026-08-02T00:00:00.000Z')
    for (const t of ins.tiles) expect(t.label.toLowerCase()).not.toContain('deal age')
  })
})

// ─── Card tags ──────────────────────────────────────────────────────────────

const NO_NEXT_STEP: CardTagLike = {
  code: 'no_next_step', label: 'No next step', description: null, colour_token: 'warning',
  rule_field: 'next_activity_at', rule_operator: 'is_null', rule_value: null, sort_order: 10,
}
const LARGE_DEAL: CardTagLike = {
  code: 'large_deal', label: 'Large deal', description: null, colour_token: 'accent',
  rule_field: 'mortgage_amount', rule_operator: 'gte', rule_value: null, sort_order: 20,
}

describe('card tags evaluate three scalar columns, and nothing more', () => {
  it('a rule naming a field the row does not carry is UNEVALUABLE, not true', () => {
    // rec.deals has no next_activity_at column (Postgres answers 42703).
    // Treating absent as null would tag every file "No next step" — a signal
    // invented out of a field nobody records.
    expect(evaluateTag(NO_NEXT_STEP, LIVE[0])).toEqual({
      state: 'unevaluable', reason: 'missing_field',
    })
    expect(tagsForDeal([NO_NEXT_STEP], LIVE[0])).toEqual([])
    for (const d of LIVE) expect(tagsForDeal([NO_NEXT_STEP], d)).toEqual([])
  })

  it('the unevaluable rule is reported so the absence is visible', () => {
    const out = unevaluableTags([NO_NEXT_STEP], LIVE)
    expect(out).toHaveLength(1)
    expect(out[0].tag.code).toBe('no_next_step')
    expect(out[0].reason).toBe('missing_field')
  })

  it('a threshold rule with no threshold is unevaluable, never defaulted to 0', () => {
    expect(evaluateTag(LARGE_DEAL, LIVE[0])).toEqual({
      state: 'unevaluable', reason: 'missing_value',
    })
    // A zero default would tag every file with an amount as "large".
    expect(tagsForDeal([LARGE_DEAL], LIVE[0])).toEqual([])
  })

  it('evaluates the operators it does know, on fields that exist', () => {
    const present: CardTagLike = { ...NO_NEXT_STEP, rule_field: 'blocked_by' }
    expect(evaluateTag(present, deal({ id: 'x', blocked_by: null })).state).toBe('active')
    expect(evaluateTag(present, deal({ id: 'x', blocked_by: 'lender' })).state).toBe('inactive')
    const big: CardTagLike = { ...LARGE_DEAL, rule_value: '600000' }
    expect(evaluateTag(big, deal({ id: 'x', mortgage_amount: 685400 })).state).toBe('active')
    expect(evaluateTag(big, deal({ id: 'x', mortgage_amount: 494000 })).state).toBe('inactive')
  })

  it('an operator this build does not know is never guessed at', () => {
    const weird: CardTagLike = { ...NO_NEXT_STEP, rule_field: 'blocked_by', rule_operator: 'matches_regex' }
    expect(evaluateTag(weird, LIVE[0])).toEqual({ state: 'unevaluable', reason: 'unknown_operator' })
  })
})

// ─── Milestones ─────────────────────────────────────────────────────────────

describe('milestones are dated markers, not stages', () => {
  const TYPES = [
    { code: 'lawyer_instructed', label: 'Lawyer instructed', description: null, moves_stage: false, moves_to_stage_code: null, sort_order: 10 },
    { code: 'broker_complete', label: 'Broker complete', description: null, moves_stage: true, moves_to_stage_code: 'lawyer_closing', sort_order: 20 },
  ]

  it('renders nothing today, because the table is empty', () => {
    expect(milestonesForDeal(LIVE[0], [], TYPES)).toEqual([])
  })

  it('renders lawyer_instructed on a file in Conditions when it lands', () => {
    const d = deal({ id: 'c', stage_code: 'conditions' })
    const rows = milestonesForDeal(
      d,
      [{ deal_id: 'c', milestone_type: 'lawyer_instructed', occurred_at: '2026-08-01T10:00:00Z' }],
      TYPES,
    )
    expect(rows).toEqual([
      { code: 'lawyer_instructed', label: 'Lawyer instructed', occurred_at: '2026-08-01T10:00:00Z' },
    ])
  })

  it('an unconfigured milestone type is dropped, never shown as a raw code', () => {
    const d = deal({ id: 'c' })
    expect(milestonesForDeal(d, [{ deal_id: 'c', milestone_type: 'mystery', occurred_at: null }], TYPES)).toEqual([])
  })

  it('another deal’s milestones never leak in', () => {
    const d = deal({ id: 'c' })
    expect(milestonesForDeal(d, [{ deal_id: 'other', milestone_type: 'lawyer_instructed', occurred_at: null }], TYPES)).toEqual([])
  })
})

// ─── The Archive ────────────────────────────────────────────────────────────

describe('the archive', () => {
  it('lists the three terminal outcomes and is empty today', () => {
    expect(terminalStages(STAGES).map(s => s.code)).toEqual([
      'lost_to_competition', 'declined', 'cancelled',
    ])
    expect(archiveRows(STAGES, LIVE)).toEqual([])
  })

  it('keeps the outcome attached and grouped', () => {
    const ended = [
      deal({ id: 'x', file_ref: 'B', stage_code: 'cancelled' }),
      deal({ id: 'y', file_ref: 'A', stage_code: 'lost_to_competition' }),
    ]
    expect(archiveRows(STAGES, ended).map(r => r.stage.code)).toEqual([
      'lost_to_competition', 'cancelled',
    ])
  })

  it('archived files are excluded from the board population', () => {
    const withEnded = [...LIVE, deal({ id: 'z', stage_code: 'declined', mortgage_amount: 1 })]
    expect(boardDeals(STAGES, withEnded).map(d => d.id)).not.toContain('z')
    expect(boardDeals(STAGES, withEnded)).toHaveLength(7)
  })
})

// ─── The partition (handoff 52) ─────────────────────────────────────────────
// Board, Archive and No stage must account for every live record exactly once.
// This is the invariant Michael's reconciliation sitting depends on: a record
// in no view is a record he finishes the sitting believing he handled, and a
// record in two views is counted twice by whoever reads the switch row.

describe('board, archive and unplaced partition the live book', () => {
  // Every failure mode the census looked for, in one population: phased,
  // terminal-with-a-phase (funded — belongs to the BOARD, which is why the
  // live Archive reads 29 while terminal-category deals number 95), terminal,
  // null stage, and a code the page's stage list does not carry.
  const population = [
    ...LIVE,
    deal({ id: 'ended', stage_code: 'lost_to_competition' }),
    deal({ id: 'blank', stage_code: null }),
    deal({ id: 'orphan', stage_code: 'a_code_nobody_configured' }),
  ]

  it('every record lands in exactly one bucket, and the buckets sum', () => {
    const board = boardDeals(STAGES, population).map(d => d.id)
    const archived = archiveRows(STAGES, population).map(r => r.deal.id)
    const unplaced = unplacedDeals(STAGES, population).map(u => u.deal.id)
    const all = [...board, ...archived, ...unplaced]
    expect(all.length).toBe(population.length)
    expect(new Set(all).size).toBe(population.length)
  })

  it('funded sits on the BOARD, not in the archive: terminal category, live phase', () => {
    expect(boardDeals(STAGES, population).map(d => d.id)).toContain('6')
    expect(archiveRows(STAGES, population).map(r => r.deal.id)).not.toContain('6')
  })

  it('unplaced states its reason and never invents a stage', () => {
    const rows = unplacedDeals(STAGES, population)
    expect(rows.map(u => [u.deal.id, u.reason])).toEqual([
      ['blank', 'no_stage'],
      ['orphan', 'unknown_stage'],
    ])
    // The deal object is passed through untouched: nothing writes a stage.
    expect(rows.find(u => u.deal.id === 'blank')?.deal.stage_code).toBeNull()
  })

  it('is the complement, so a new stage row moves a record OUT with no code change', () => {
    const grown = [...STAGES, st('a_code_nobody_configured', 'monitor', 470)]
    expect(unplacedDeals(grown, population).map(u => u.deal.id)).toEqual(['blank'])
    expect(boardDeals(grown, population).map(d => d.id)).toContain('orphan')
  })
})

// ─── The return rail ────────────────────────────────────────────────────────

describe('the return rail reads configuration', () => {
  const RETURNS: PhaseReturnLike[] = [
    { code: 'a', label: 'Renewal returns to the strategy session', description: null, from_phase: 'monitor', from_stage_code: 'decided', to_phase: 'underwriting', to_stage_code: 'strategy_session', to_source_code: null, sort_order: 10 },
    { code: 'b', label: 'The book is itself a source', description: null, from_phase: 'monitor', from_stage_code: 'decided', to_phase: 'attract', to_stage_code: null, to_source_code: 'book', sort_order: 20 },
  ]
  const SOURCES = [{ code: 'book', label: 'The book', description: null, channel_group: 'referral', sort_order: 20 }]

  it('draws BOTH returns, and follows the phase rename', () => {
    const rows = orderedReturns(RETURNS)
    expect(rows).toHaveLength(2)
    expect(returnTarget(rows[0], PHASES, STAGES, SOURCES)).toBe('Underwriting · strategy_session')
    expect(returnTarget(rows[1], PHASES, STAGES, SOURCES)).toBe('Attract · The book')
  })

  it('a return pointing at something gone renders nothing', () => {
    expect(returnTarget({ ...RETURNS[0], to_phase: 'advise' }, PHASES, STAGES, SOURCES)).toBeNull()
    expect(returnTarget({ ...RETURNS[0], to_stage_code: 'gone' }, PHASES, STAGES, SOURCES)).toBeNull()
  })
})

// ─── Days in stage, unchanged ───────────────────────────────────────────────

describe('days in stage never invents a figure', () => {
  const NOW = '2026-08-02T18:00:00.000Z'

  it('measures from the event that entered the CURRENT stage', () => {
    const d = deal({ id: 'x', stage_code: 'funded' })
    const ev: StageEventLike[] = [
      { deal_id: 'x', to_stage: 'submitted', changed_at: '2026-04-20T21:13:05.886Z' },
      { deal_id: 'x', to_stage: 'funded', changed_at: '2026-06-24T15:16:46.391Z' },
    ]
    expect(daysInStage(d, ev, NOW)).toMatchObject({ known: true, days: 39, since: '2026-06-24' })
  })

  it('the two absent states stay distinguished', () => {
    expect(daysInStage(deal({ id: 'y' }), [], NOW)).toEqual({ known: false, reason: 'no_history' })
    const d = deal({ id: 'z', stage_code: 'lender_response' })
    expect(daysInStage(d, [{ deal_id: 'z', to_stage: 'submitted', changed_at: '2026-05-21T16:24:18.645Z' }], NOW))
      .toEqual({ known: false, reason: 'entry_not_recorded' })
  })

  it('never falls back to the latest event of any kind', () => {
    const d = deal({ id: 'z', stage_code: 'lender_response' })
    const r = daysInStage(d, [{ deal_id: 'z', to_stage: 'submitted', changed_at: '2026-05-21T16:24:18.645Z' }], NOW)
    expect(r.known).toBe(false)
    expect(JSON.stringify(r)).not.toMatch(/\d{2,}/)
  })

  it('re-entering a stage measures from the latest entry', () => {
    const d = deal({ id: 'r', stage_code: 'conditions' })
    expect(daysInStage(d, [
      { deal_id: 'r', to_stage: 'conditions', changed_at: '2026-05-01T00:00:00.000Z' },
      { deal_id: 'r', to_stage: 'conditions', changed_at: '2026-07-25T00:00:00.000Z' },
    ], NOW)).toMatchObject({ known: true, since: '2026-07-25' })
  })
})

// ─── Collapse ───────────────────────────────────────────────────────────────

describe('collapse rides the URL, so the board stays a server component', () => {
  it('parses and round-trips', () => {
    expect(parseCollapsed(null)).toEqual(new Set())
    expect(parseCollapsed('a,b')).toEqual(new Set(['a', 'b']))
    expect(parseCollapsed(' a , , b ')).toEqual(new Set(['a', 'b']))
  })

  it('toggles on and off', () => {
    expect(toggleCollapsed(new Set(), 'submitted')).toBe('submitted')
    expect(toggleCollapsed(new Set(['submitted']), 'submitted')).toBe('')
    expect(toggleCollapsed(new Set(['a']), 'b')).toBe('a,b')
  })
})

// ─── Chips, borrowers, money ────────────────────────────────────────────────

describe('chips and formatting', () => {
  it('only the four known blocked_by values render, and only You is actionable', () => {
    expect(blockedByChip('you')).toBe('you')
    for (const v of [null, undefined, '', '  ', 'underwriter', 42]) expect(blockedByChip(v)).toBeNull()
    expect(isActionableChip('you')).toBe(true)
    for (const c of ['client', 'lender', 'lawyer', null] as const) expect(isActionableChip(c)).toBe(false)
  })

  it('formats totals and compacts', () => {
    expect(fmtTotal(3588173)).toBe('$3,588,173')
    expect(fmtCompact(3588173)).toBe('$3.59M')
    expect(fmtCompact(685400)).toBe('$685k')
    expect(fmtCompact(420)).toBe('$420')
  })
})

// ─── The colour system ──────────────────────────────────────────────────────

describe('colour carries phase and progress, and nothing else', () => {
  const inGreenBand = (h: number) => h >= 60 && h <= 140

  it('no phase hue sits in the green band, so nothing competes with lime', () => {
    for (const [code, hue] of Object.entries(PHASE_HUES)) {
      expect(inGreenBand(hue.h), `${code} (${hue.h}°) is greenish`).toBe(false)
    }
  })

  it('the renamed phases carry hues, not the hash fallback', () => {
    expect(PHASE_HUES.underwriting).toBeDefined()
    expect(PHASE_HUES.fulfilment).toBeDefined()
    expect(hueFor('underwriting').name).toBe('indigo')
    expect(hueFor('fulfilment').name).toBe('violet')
  })

  it('an unmapped phase still gets a hue outside the green band', () => {
    for (const code of ['recover', 'zzz', 'brand_new_phase']) {
      const h = hueFor(code).h
      expect(h).toBeGreaterThanOrEqual(185)
      expect(h).toBeLessThanOrEqual(335)
    }
  })

  it('a phase keeps ONE hue across all its columns, deepening along it', () => {
    const cols = columnsForPhase(STAGES, 'fulfilment')
    const hue = hueFor('fulfilment').h
    for (let i = 0; i < cols.length; i++) {
      expect(columnSkin('fulfilment', i, cols.length).accent).toContain(`hsl(${hue} `)
    }
    const alpha = (s: string) => Number(s.match(/\/ ([\d.]+)\)/)![1])
    expect(alpha(columnSkin('fulfilment', 0, 5).accent))
      .toBeLessThan(alpha(columnSkin('fulfilment', 4, 5).accent))
  })

  it('the ramp adapts to the column count', () => {
    expect(rampPosition(0, 7)).toBe(0)
    expect(rampPosition(6, 7)).toBe(1)
    expect(rampPosition(0, 1)).toBe(0)
    expect(Number.isFinite(rampPosition(0, 0))).toBe(true)
  })

  it('deal types are a separate channel, none of them green', () => {
    const hueOfHsl = (s: string) => Number(s.match(/hsl\((\d+)/)![1])
    for (const t of ['purchase', 'refinance', 'renewal', 'switch', 'heloc']) {
      expect(inGreenBand(hueOfHsl(typeSkin(t)!.fg)), `${t} is greenish`).toBe(false)
    }
    expect(new Set(['purchase', 'refinance', 'renewal'].map(t => typeSkin(t)!.fg)).size).toBe(3)
    expect(typeSkin(null)).toBeNull()
    expect(phaseAccent('underwriting')).not.toBe(phaseAccent('fulfilment'))
  })
})


// ─── The projection colour and the zone rule ────────────────────────────────

describe('projection green, and the zone that keeps it apart from lime', () => {
  const CARD = 'components/admin/deals-beta/DealCard.tsx'
  const FIGURE = 'components/admin/deals-beta/ProjectionFigure.tsx'
  const PREVIEW = 'components/admin/deals-beta/DealPreview.tsx'
  const BOARD = 'components/admin/DealsBetaBoard.tsx'
  const read = (p: string) => readFileSync(p, 'utf8')
  /** Import statements only — a header comment may name a token it must not
   * import, and explaining the rule is not breaking it. */
  const imports = (src: string) =>
    src.split('\n').filter(l => /^\s*import\b/.test(l) || /^\s+[A-Za-z{}, ]+from '/.test(l)).join('\n')

  it('the hatch is gone everywhere — it ran through the digits', () => {
    for (const f of [BOARD, CARD, FIGURE, PREVIEW, 'lib/phase-palette.ts']) {
      expect(read(f), `${f} still hatches`).not.toMatch(/repeating-linear-gradient\(45deg/)
    }
    expect(read('lib/phase-palette.ts')).not.toContain('projectionHatch')
    expect(read('lib/phase-palette.ts')).not.toContain('NEUTRAL_HATCH')
  })

  it('the projection green is a solid fill, well clear of the Fox lime', () => {
    // Lime is hue 78, a bright yellow-green. This is 152, a forest green.
    for (const v of Object.values(PROJECTION_GREEN)) expect(v).toMatch(/^hsl\(152 /)
    expect(PROJECTION_GREEN.fill).not.toContain('gradient')
  })

  // THE ZONE RULE, asserted from both sides.
  it('a CARD may carry lime and can never carry projection green', () => {
    const src = read(CARD)
    expect(src).toMatch(/bg-decision/)
    // Assert on the IMPORT, not on any mention: the file's header comment
    // explains the zone rule and names both tokens on purpose.
    expect(imports(src)).not.toMatch(/PROJECTION_GREEN|ProjectionFigure/)
  })

  it('the PROJECTION FIGURE may carry green and can never carry lime', () => {
    const src = read(FIGURE)
    expect(imports(src)).toContain('PROJECTION_GREEN')
    expect(src).not.toMatch(/bg-decision|text-decision-ink/)
  })

  it('the orchestrator and the preview carry NO lime at all', () => {
    // Lime lives on cards only. The board, its footers, the strip and the
    // preview panel are structurally unable to acquire one.
    for (const f of [BOARD, PREVIEW]) {
      expect(read(f), `${f} must not render lime`).not.toMatch(/bg-decision|text-decision-ink/)
    }
  })

  it('the preview panel carries no projection green either', () => {
    // It shows ONE file, which puts it on the card side of the zone.
    const src = read(PREVIEW)
    expect(imports(src)).not.toMatch(/PROJECTION_GREEN|ProjectionFigure/)
  })

  it('colour never carries the meaning alone — the word rides with it', () => {
    const board = read(BOARD)
    expect(board).toMatch(/ProjectionLabel>\{weight\.probability\}% weighted/)
    expect(board).toMatch(/<ProjectionLabel>projected<\/ProjectionLabel>/)
  })

  it('the preview panel has no edit control of any kind', () => {
    const src = read(PREVIEW)
    for (const bad of ['<form', 'onSubmit', 'onClick', "method: 'POST'", '<button', '<input', '<textarea', '<select']) {
      expect(src, `preview must not contain ${bad}`).not.toContain(bad)
    }
  })
})

// ─── The deal age tile ──────────────────────────────────────────────────────

describe('age since first stage event', () => {
  const NOW = '2026-08-02T00:00:00.000Z'
  const EV: StageEventLike[] = [
    { deal_id: '1', to_stage: 'submitted', changed_at: '2026-05-21T00:00:00.000Z' },
    { deal_id: '1', to_stage: 'lender_response', changed_at: '2026-07-01T00:00:00.000Z' },
    { deal_id: '3', to_stage: 'submitted', changed_at: '2026-07-28T00:00:00.000Z' },
  ]

  it('measures from the EARLIEST event, not the latest', () => {
    expect(daysSinceFirstEvent(deal({ id: '1' }), EV, NOW)).toBe(73)
    expect(daysSinceFirstEvent(deal({ id: '3' }), EV, NOW)).toBe(5)
  })

  it('a deal with no events contributes nothing rather than a zero', () => {
    expect(daysSinceFirstEvent(deal({ id: 'none' }), EV, NOW)).toBeNull()
  })

  it('the tile is labelled for what it MEASURES, not as "deal age"', () => {
    const ins = buildInsights(LIVE, STAGES, EV, NOW)
    const age = ins.tiles.find(t => t.key === 'age')!
    expect(age.label).toBe('Average days since first stage event')
    // A familiar label over a changed calculation is worse than an absent tile.
    expect(age.label.toLowerCase()).not.toContain('deal age')
    expect(age.unit).toBe('days')
    expect(age.isProjection).toBe(false)
  })

  it('it carries its own coverage, so 2 of 7 never reads as 7 of 7', () => {
    const ins = buildInsights(LIVE, STAGES, EV, NOW)
    const age = ins.tiles.find(t => t.key === 'age')!
    expect(age.counted).toBe(2)
    expect(age.total).toBe(7)
    expect(age.value).toBe(39) // (73 + 5) / 2
  })

  it('the omission note is gone once the tile exists', () => {
    const ins = buildInsights(LIVE, STAGES, EV, NOW)
    expect(ins.omitted).toEqual([])
  })

  it('with no events at all the tile is omitted rather than shown as zero', () => {
    const ins = buildInsights(LIVE, STAGES, [], NOW)
    expect(ins.tiles.map(t => t.key)).not.toContain('age')
    expect(ins.omitted[0].label).toBe('Average days since first stage event')
  })
})

// ─── The preview panel's data ───────────────────────────────────────────────

describe('preview selection and conditions', () => {
  const CONDS = [
    { deal_id: '4', cond_number: 'c-2', text: 'b', status: 'satisfied', category: 'general_verification', owner: 'broker', due_date: null, load_bearing: false },
    { deal_id: '4', cond_number: 'c-1', text: 'a', status: 'open', category: 'general_verification', owner: 'borrower', due_date: '2026-06-04', load_bearing: true },
    { deal_id: '1', cond_number: 'x-1', text: 'other', status: 'open', category: null, owner: null, due_date: null, load_bearing: null },
  ]

  it('selects by file ref, falls back to id, and ignores an unknown ref', () => {
    expect(findDealByRef(LIVE, 'BRXM-F057400')?.id).toBe('4')
    expect(findDealByRef(LIVE, '4')?.id).toBe('4')
    expect(findDealByRef(LIVE, 'nope')).toBeNull()
    expect(findDealByRef(LIVE, null)).toBeNull()
  })

  it('shows only that file’s conditions, open ones first', () => {
    const rows = conditionsForDeal(deal({ id: '4' }), CONDS)
    expect(rows.map(c => c.cond_number)).toEqual(['c-1', 'c-2'])
    expect(rows.every(c => c.deal_id === '4')).toBe(true)
  })

  it('a file with no conditions has none rather than an invented zero row', () => {
    expect(conditionsForDeal(deal({ id: '7' }), CONDS)).toEqual([])
  })
})
