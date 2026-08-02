// The phase model and its colour system (Deals Beta, five-phase, 2026-08-02).
//
// Replaces tests/four-phase.test.ts. Fixtures below are the LIVE shape read
// from rec on 2026-08-02: five phases, 24 phased stages (intake 7, advise 6,
// fund 6, monitor 5), three terminals belonging to no phase, four gates, two
// return paths, five attract sources, seven deals.

import { describe, expect, it } from 'vitest'
import {
  BLOCKED_BY_LABELS,
  DAYS_UNKNOWN_COPY,
  archiveRows,
  blockedByChip,
  borrowersFor,
  columnTotals,
  columnsForPhase,
  daysInStage,
  dealsInStage,
  defaultPhaseCode,
  findPhase,
  fmtAmount,
  fmtTotal,
  hasSteps,
  isActionableChip,
  isDealLevel,
  isGate,
  orderedPhases,
  orderedReturns,
  phaseTotals,
  purposeLabel,
  returnTarget,
  roleLabel,
  terminalStages,
  type DealLike,
  type PhaseLike,
  type PhaseReturnLike,
  type StageEventLike,
  type StageLike,
} from '../lib/phase-model'
import {
  PHASE_HUES,
  columnSkin,
  hueFor,
  phaseAccent,
  rampPosition,
  typeSkin,
} from '../lib/phase-palette'

const PHASES: PhaseLike[] = [
  { code: 'attract', label: 'Attract', description: 'x', sort_order: 10, unit: 'arrivals', counts_dollars: false, is_ordered: false, level: 'source' },
  { code: 'intake', label: 'Intake', description: 'x', sort_order: 20, unit: 'people', counts_dollars: false, is_ordered: true, level: 'contact' },
  { code: 'advise', label: 'Advise', description: 'x', sort_order: 30, unit: 'files', counts_dollars: true, is_ordered: true, level: 'deal' },
  { code: 'fund', label: 'Fund', description: 'x', sort_order: 40, unit: 'files', counts_dollars: true, is_ordered: true, level: 'deal' },
  { code: 'monitor', label: 'Monitor', description: 'x', sort_order: 50, unit: 'people', counts_dollars: false, is_ordered: true, level: 'contact' },
]

const st = (
  code: string,
  phase: string | null,
  sort_order: number,
  category = 'open',
  is_gate = false,
): StageLike => ({ code, label: code, description: `${code} desc`, sort_order, phase, category, is_gate })

const STAGES: StageLike[] = [
  st('new', 'intake', 100), st('contacted', 'intake', 110), st('engaged', 'intake', 120),
  st('discovery_booked', 'intake', 130), st('discovery_held', 'intake', 140),
  st('invited', 'intake', 150), st('routed', 'intake', 160, 'open', true),
  st('application', 'advise', 200), st('application_complete', 'advise', 210),
  st('documents', 'advise', 220), st('documents_complete', 'advise', 230),
  st('strategy_session', 'advise', 240), st('proceeding', 'advise', 250, 'open', true),
  st('submitted', 'fund', 300), st('lender_response', 'fund', 310), st('conditions', 'fund', 320),
  st('commitment', 'fund', 330), st('lawyer_closing', 'fund', 340),
  st('funded', 'fund', 350, 'terminal_won', true),
  st('enrolled', 'monitor', 400), st('opportunity_found', 'monitor', 410),
  st('renewal_window', 'monitor', 420), st('in_conversation', 'monitor', 430),
  st('decided', 'monitor', 440, 'open', true),
  st('lost_to_competition', null, 900, 'terminal_lost'),
  st('declined', null, 910, 'terminal_lost'),
  st('cancelled', null, 920, 'terminal_lost'),
]

const deal = (over: Partial<DealLike> & { id: string }): DealLike => ({
  file_ref: 'BRXM-F000000', deal_type: 'purchase', stage_code: 'application',
  mortgage_amount: 100000, blocked_by: null, ...over,
})

const LIVE_DEALS: DealLike[] = [
  deal({ id: '1', file_ref: 'BRXM-F050350', stage_code: 'application', mortgage_amount: 494000, deal_type: 'purchase', blocked_by: 'client' }),
  deal({ id: '2', file_ref: 'BRXM-F059751', stage_code: 'documents', mortgage_amount: 359000, deal_type: 'renewal' }),
  deal({ id: '3', file_ref: 'BRXM-F060561', stage_code: 'submitted', mortgage_amount: 685400, deal_type: 'renewal', blocked_by: 'lender' }),
  deal({ id: '4', file_ref: 'BRXM-F057400', stage_code: 'lender_response', mortgage_amount: 1160000, deal_type: 'refinance', blocked_by: 'lender' }),
  deal({ id: '5', file_ref: 'BRXM-F025547', stage_code: 'lender_response', mortgage_amount: 580000, deal_type: 'refinance', blocked_by: 'lender' }),
  deal({ id: '6', file_ref: 'BRXM-F053724', stage_code: 'funded', mortgage_amount: 635000, deal_type: 'purchase' }),
  deal({ id: '7', file_ref: 'BRXM-F053725', stage_code: 'funded', mortgage_amount: 527773, deal_type: 'purchase' }),
]

const RETURNS: PhaseReturnLike[] = [
  { code: 'decided_to_strategy_session', label: 'Renewal returns to the strategy session', description: null, from_phase: 'monitor', from_stage_code: 'decided', to_phase: 'advise', to_stage_code: 'strategy_session', to_source_code: null, sort_order: 10 },
  { code: 'decided_to_book_source', label: 'The book is itself a source', description: null, from_phase: 'monitor', from_stage_code: 'decided', to_phase: 'attract', to_stage_code: null, to_source_code: 'book', sort_order: 20 },
]

const SOURCES = [
  { code: 'referral_partner', label: 'Referral partner', description: null, channel_group: 'referral', sort_order: 10 },
  { code: 'book', label: 'The book', description: null, channel_group: 'referral', sort_order: 20 },
  { code: 'content', label: 'Content', description: null, channel_group: 'owned', sort_order: 30 },
  { code: 'direct', label: 'Direct', description: null, channel_group: 'direct', sort_order: 40 },
  { code: 'paid', label: 'Paid', description: null, channel_group: 'paid', sort_order: 50 },
]

// ─── Phases come from the table ─────────────────────────────────────────────

describe('phases are configuration', () => {
  it('renders five phases in configured order', () => {
    expect(orderedPhases(PHASES).map(p => p.code)).toEqual([
      'attract', 'intake', 'advise', 'fund', 'monitor',
    ])
  })

  it('adding a phase row adds a card, with no code change', () => {
    const extra: PhaseLike[] = [
      ...PHASES,
      { code: 'recover', label: 'Recover', description: null, sort_order: 60, unit: 'people', counts_dollars: false, is_ordered: true, level: 'contact' },
    ]
    expect(orderedPhases(extra).map(p => p.code)).toContain('recover')
    expect(orderedPhases(extra)).toHaveLength(6)
  })

  it('an inactive phase does not render', () => {
    const off: PhaseLike[] = [...PHASES, { code: 'dead', label: 'Dead', description: null, sort_order: 70, unit: 'people', counts_dollars: false, is_ordered: true, level: 'contact', is_active: false }]
    expect(orderedPhases(off).map(p => p.code)).not.toContain('dead')
  })

  it('level and is_ordered drive behaviour, not the phase name', () => {
    const attract = findPhase(PHASES, 'attract')!
    const advise = findPhase(PHASES, 'advise')!
    const monitor = findPhase(PHASES, 'monitor')!
    expect(hasSteps(attract)).toBe(false)
    expect(isDealLevel(attract)).toBe(false)
    expect(hasSteps(advise)).toBe(true)
    expect(isDealLevel(advise)).toBe(true)
    expect(hasSteps(monitor)).toBe(true)
    expect(isDealLevel(monitor)).toBe(false)
  })

  it('the default phase is the first that counts files', () => {
    expect(defaultPhaseCode(PHASES)).toBe('advise')
  })

  it('there are three units and nothing sums across them', () => {
    expect(new Set(PHASES.map(p => p.unit))).toEqual(new Set(['arrivals', 'people', 'files']))
    // phaseTotals is the ONLY totalling function and is scoped to one phase.
    // For anything not deal-level it returns null, never a zero that could be
    // added to something else.
    expect(phaseTotals(findPhase(PHASES, 'attract')!, STAGES, LIVE_DEALS)).toBeNull()
    expect(phaseTotals(findPhase(PHASES, 'intake')!, STAGES, LIVE_DEALS)).toBeNull()
    expect(phaseTotals(findPhase(PHASES, 'monitor')!, STAGES, LIVE_DEALS)).toBeNull()
  })
})

// ─── Every sub-stage renders ────────────────────────────────────────────────

describe('every sub-stage is visible, occupied or not', () => {
  it('the live column counts are 7 / 6 / 6 / 5', () => {
    expect(columnsForPhase(STAGES, 'intake')).toHaveLength(7)
    expect(columnsForPhase(STAGES, 'advise')).toHaveLength(6)
    expect(columnsForPhase(STAGES, 'fund')).toHaveLength(6)
    expect(columnsForPhase(STAGES, 'monitor')).toHaveLength(5)
  })

  it('columns are never filtered by occupancy', () => {
    // Advise holds two files across six stages; all six still render.
    const cols = columnsForPhase(STAGES, 'advise')
    const occupied = cols.filter(c => dealsInStage(LIVE_DEALS, c.code).length > 0)
    expect(cols).toHaveLength(6)
    expect(occupied).toHaveLength(2)
  })

  it('terminal stages belong to no phase and appear in no column', () => {
    const all = ['attract', 'intake', 'advise', 'fund', 'monitor'].flatMap(p =>
      columnsForPhase(STAGES, p).map(s => s.code),
    )
    expect(all).not.toContain('lost_to_competition')
    expect(all).not.toContain('declined')
    expect(all).not.toContain('cancelled')
  })

  it('Attract has no columns at all, structurally', () => {
    expect(columnsForPhase(STAGES, 'attract')).toHaveLength(0)
    expect(hasSteps(findPhase(PHASES, 'attract')!)).toBe(false)
  })

  it('adding a stage row adds a column', () => {
    const extra = [...STAGES, st('nurture', 'intake', 155)]
    expect(columnsForPhase(extra, 'intake').map(s => s.code)).toContain('nurture')
    expect(columnsForPhase(extra, 'intake')).toHaveLength(8)
  })

  it('the four gates are marked and ordinary stages are not', () => {
    const gates = STAGES.filter(isGate).map(s => s.code)
    expect(gates).toEqual(['routed', 'proceeding', 'funded', 'decided'])
    expect(isGate(STAGES.find(s => s.code === 'application')!)).toBe(false)
  })
})

// ─── Counts and totals ──────────────────────────────────────────────────────

describe('counts and totals', () => {
  it('the live phase totals are advise 2 / $853,000 and fund 5 / $3,588,173', () => {
    expect(phaseTotals(findPhase(PHASES, 'advise')!, STAGES, LIVE_DEALS)).toMatchObject({ count: 2, amount: 853000 })
    expect(phaseTotals(findPhase(PHASES, 'fund')!, STAGES, LIVE_DEALS)).toMatchObject({ count: 5, amount: 3588173 })
  })

  it('an empty column is zero and zero, not a missing value', () => {
    expect(columnTotals([])).toEqual({ count: 0, amount: 0, partial: false })
  })

  it('a deal with no amount contributes nothing and flags the total partial', () => {
    const t = columnTotals([deal({ id: 'a', mortgage_amount: 500000 }), deal({ id: 'b', mortgage_amount: null })])
    expect(t).toEqual({ count: 2, amount: 500000, partial: true })
  })

  it('funded is a Fund column even though its category is terminal_won', () => {
    expect(columnsForPhase(STAGES, 'fund').map(s => s.code)).toContain('funded')
    expect(dealsInStage(LIVE_DEALS, 'funded')).toHaveLength(2)
  })
})

// ─── The Archive ────────────────────────────────────────────────────────────

describe('the archive', () => {
  it('lists the three terminal outcomes', () => {
    expect(terminalStages(STAGES).map(s => s.code)).toEqual([
      'lost_to_competition', 'declined', 'cancelled',
    ])
  })

  it('is empty today because no live deal sits in a terminal stage', () => {
    expect(archiveRows(STAGES, LIVE_DEALS)).toEqual([])
  })

  it('keeps the outcome attached to each row, grouped by outcome', () => {
    const ended: DealLike[] = [
      deal({ id: 'x', file_ref: 'B', stage_code: 'cancelled' }),
      deal({ id: 'y', file_ref: 'A', stage_code: 'lost_to_competition' }),
      deal({ id: 'z', file_ref: 'C', stage_code: 'lost_to_competition' }),
    ]
    const rows = archiveRows(STAGES, ended)
    expect(rows.map(r => r.stage.code)).toEqual([
      'lost_to_competition', 'lost_to_competition', 'cancelled',
    ])
    // Lost and cancelled never collapse into one bucket: the outcome travels.
    expect(rows.map(r => r.deal.file_ref)).toEqual(['A', 'C', 'B'])
  })

  it('a deal in an ordinary stage never reaches the archive', () => {
    expect(archiveRows(STAGES, [deal({ id: 'q', stage_code: 'documents' })])).toEqual([])
  })
})

// ─── The return rail ────────────────────────────────────────────────────────

describe('the return rail reads configuration', () => {
  it('draws BOTH returns, not just the renewal one', () => {
    const rows = orderedReturns(RETURNS)
    expect(rows).toHaveLength(2)
    expect(returnTarget(rows[0], PHASES, STAGES, SOURCES)).toBe('Advise · strategy_session')
    expect(returnTarget(rows[1], PHASES, STAGES, SOURCES)).toBe('Attract · The book')
  })

  it('a return pointing at something that no longer exists renders nothing', () => {
    const dangling: PhaseReturnLike = { ...RETURNS[0], to_stage_code: 'deleted_stage' }
    expect(returnTarget(dangling, PHASES, STAGES, SOURCES)).toBeNull()
    const badPhase: PhaseReturnLike = { ...RETURNS[0], to_phase: 'nope' }
    expect(returnTarget(badPhase, PHASES, STAGES, SOURCES)).toBeNull()
  })
})

// ─── THE rule: days in stage is never invented ──────────────────────────────

describe('days in stage never invents a figure', () => {
  const NOW = '2026-08-02T18:00:00.000Z'

  it('measures from the event that entered the CURRENT stage', () => {
    const d = deal({ id: 'x', stage_code: 'funded' })
    const ev: StageEventLike[] = [
      { deal_id: 'x', to_stage: 'submitted', changed_at: '2026-04-20T21:13:05.886Z' },
      { deal_id: 'x', to_stage: 'commitment', changed_at: '2026-06-15T14:21:32.775Z' },
      { deal_id: 'x', to_stage: 'funded', changed_at: '2026-06-24T15:16:46.391Z' },
    ]
    expect(daysInStage(d, ev, NOW)).toMatchObject({ known: true, days: 39, since: '2026-06-24' })
  })

  it('a deal with NO history shows no figure and says so', () => {
    expect(daysInStage(deal({ id: 'y' }), [], NOW)).toEqual({ known: false, reason: 'no_history' })
    expect(DAYS_UNKNOWN_COPY.no_history).toBe('no stage history')
  })

  it('history that stops short of the current stage shows no figure', () => {
    const d = deal({ id: 'z', stage_code: 'lender_response' })
    const ev: StageEventLike[] = [{ deal_id: 'z', to_stage: 'submitted', changed_at: '2026-05-21T16:24:18.645Z' }]
    expect(daysInStage(d, ev, NOW)).toEqual({ known: false, reason: 'entry_not_recorded' })
    expect(DAYS_UNKNOWN_COPY.entry_not_recorded).toBe('stage entry not recorded')
  })

  it('NEVER falls back to the latest event of any kind', () => {
    const d = deal({ id: 'z', stage_code: 'lender_response' })
    const ev: StageEventLike[] = [{ deal_id: 'z', to_stage: 'submitted', changed_at: '2026-05-21T16:24:18.645Z' }]
    const r = daysInStage(d, ev, NOW)
    expect(r.known).toBe(false)
    expect(JSON.stringify(r)).not.toMatch(/\d{2,}/)
  })

  it('a deal stalled since March never renders as 0 days', () => {
    const d = deal({ id: 'm', stage_code: 'documents' })
    const ev: StageEventLike[] = [{ deal_id: 'm', to_stage: 'documents', changed_at: '2026-03-02T09:00:00.000Z' }]
    const r = daysInStage(d, ev, NOW)
    expect(r.known).toBe(true)
    if (r.known) expect(r.days).toBeGreaterThan(140)
  })

  it('re-entering a stage measures from the LATEST entry', () => {
    const d = deal({ id: 'r', stage_code: 'conditions' })
    const ev: StageEventLike[] = [
      { deal_id: 'r', to_stage: 'conditions', changed_at: '2026-05-01T00:00:00.000Z' },
      { deal_id: 'r', to_stage: 'commitment', changed_at: '2026-06-01T00:00:00.000Z' },
      { deal_id: 'r', to_stage: 'conditions', changed_at: '2026-07-25T00:00:00.000Z' },
    ]
    expect(daysInStage(d, ev, NOW)).toMatchObject({ known: true, since: '2026-07-25' })
  })

  it('another deal’s events never leak in, and a malformed date yields no figure', () => {
    expect(daysInStage(deal({ id: 'a', stage_code: 'funded' }), [{ deal_id: 'b', to_stage: 'funded', changed_at: '2026-07-01T00:00:00.000Z' }], NOW))
      .toEqual({ known: false, reason: 'no_history' })
    expect(daysInStage(deal({ id: 'n', stage_code: 'funded' }), [{ deal_id: 'n', to_stage: 'funded', changed_at: 'not-a-date' }], NOW).known).toBe(false)
  })
})

// ─── The blocked-by chip ────────────────────────────────────────────────────

describe('blocked-by chip', () => {
  it('renders only the four known values, nothing otherwise', () => {
    expect(blockedByChip('you')).toBe('you')
    expect(blockedByChip('Client')).toBe('client')
    expect(blockedByChip('LENDER')).toBe('lender')
    for (const v of [null, undefined, '', '   ', 'underwriter', 'me']) {
      expect(blockedByChip(v)).toBeNull()
    }
  })

  it('only You is actionable, which is what earns it the lime', () => {
    expect(isActionableChip('you')).toBe(true)
    for (const c of ['client', 'lender', 'lawyer', null] as const) {
      expect(isActionableChip(c)).toBe(false)
    }
    for (const k of ['you', 'client', 'lender', 'lawyer'] as const) {
      expect(BLOCKED_BY_LABELS[k].length).toBeGreaterThan(0)
    }
  })
})

// ─── Presentation helpers ───────────────────────────────────────────────────

describe('presentation', () => {
  it('purpose renders a word or nothing, never "unknown"', () => {
    expect(purposeLabel('purchase')).toBe('Purchase')
    expect(purposeLabel(null)).toBeNull()
    expect(purposeLabel('bridge')).toBe('bridge')
  })

  it('amounts render or are null, never a zero standing in', () => {
    expect(fmtAmount(494000)).toBe('$494,000')
    expect(fmtAmount(null)).toBeNull()
    expect(fmtAmount(Number.NaN)).toBeNull()
    expect(fmtTotal(3588173)).toBe('$3,588,173')
  })

  it('borrowers sort primary first and drop nameless rows', () => {
    const rows = [
      { deal_id: 'd1', role: 'co_applicant', full_name: 'Jordan Wells' },
      { deal_id: 'd1', role: 'primary_applicant', full_name: 'Sofia Ricci' },
      { deal_id: 'd1', role: 'co_applicant', full_name: null },
    ]
    expect(borrowersFor(deal({ id: 'd1' }), rows)).toEqual([
      { name: 'Sofia Ricci', role: 'primary' },
      { name: 'Jordan Wells', role: 'co-applicant' },
    ])
    expect(roleLabel('trustee_of_estate')).toBe('trustee of estate')
  })
})

// ─── The colour system ──────────────────────────────────────────────────────

describe('colour carries phase and progress, and nothing else', () => {
  it('every phase hue sits outside the green band, so nothing can read as lime', () => {
    // Lime is the attention signal and has exactly one meaning. A phase tint
    // drifting into 60–140° would start competing with it.
    const inGreenBand = (h: number) => h >= 60 && h <= 140
    for (const [code, hue] of Object.entries(PHASE_HUES)) {
      expect(inGreenBand(hue.h), `${code} (${hue.h}°, ${hue.name}) is in the green band`).toBe(false)
    }
  })

  it('an unmapped phase still gets a hue, also outside the green band', () => {
    for (const code of ['recover', 'zzz', 'a', 'brand_new_phase', 'monitor_v2', 'x']) {
      const h = hueFor(code).h
      expect(h).toBeGreaterThanOrEqual(185)
      expect(h).toBeLessThanOrEqual(335)
    }
  })

  it('the five phases are five distinct families', () => {
    const hues = ['attract', 'intake', 'advise', 'fund', 'monitor'].map(c => hueFor(c).h)
    expect(new Set(hues).size).toBe(5)
  })

  it('a phase keeps ONE hue across all its columns', () => {
    const cols = columnsForPhase(STAGES, 'fund')
    const hue = hueFor('fund').h
    for (let i = 0; i < cols.length; i++) {
      expect(columnSkin('fund', i, cols.length).accent).toContain(`hsl(${hue} `)
    }
  })

  it('depth increases along the phase — that is the "how far along" signal', () => {
    const total = 6
    const first = columnSkin('fund', 0, total)
    const last = columnSkin('fund', total - 1, total)
    const alpha = (s: string) => Number(s.match(/\/ ([\d.]+)\)/)![1])
    expect(alpha(first.accent)).toBeLessThan(alpha(last.accent))
    expect(alpha(first.accent)).toBeCloseTo(0.35, 2)
    expect(alpha(last.accent)).toBeCloseTo(1.0, 2)
  })

  it('the ramp adapts to the column count, so a new stage needs no code change', () => {
    expect(rampPosition(0, 6)).toBe(0)
    expect(rampPosition(5, 6)).toBe(1)
    expect(rampPosition(6, 7)).toBe(1)
    // A single-column phase sits at the start rather than dividing by zero.
    expect(rampPosition(0, 1)).toBe(0)
    expect(Number.isFinite(rampPosition(0, 0))).toBe(true)
  })

  it('phase colour is never assigned per stage', () => {
    // Two different stages in the same phase share a hue; the same index in a
    // different phase does not. That is the whole rule in two assertions.
    expect(columnSkin('advise', 0, 6).accent.startsWith(`hsl(${hueFor('advise').h} `)).toBe(true)
    expect(columnSkin('advise', 3, 6).accent.startsWith(`hsl(${hueFor('advise').h} `)).toBe(true)
    expect(columnSkin('fund', 0, 6).accent.startsWith(`hsl(${hueFor('fund').h} `)).toBe(true)
    expect(phaseAccent('advise')).not.toBe(phaseAccent('fund'))
  })

  it('deal types are a separate channel with their own colours', () => {
    const purchase = typeSkin('purchase')!
    const refinance = typeSkin('refinance')!
    const renewal = typeSkin('renewal')!
    expect(new Set([purchase.fg, refinance.fg, renewal.fg]).size).toBe(3)
    // Grey was throwing away a real distinction; nothing here is grey.
    expect(purchase.fg).not.toBe(typeSkin('something_unknown')!.fg)
  })

  it('deal-type hues also stay out of the green band', () => {
    // Same reason as the phases: green is the attention signal. Refinance sits
    // at 172° (a dark teal, rgb 33,140,126) which is outside it — checked here
    // rather than assumed, because 165° was close enough to fail on looking.
    const hueOfHsl = (s: string) => Number(s.match(/hsl\((\d+)/)![1])
    for (const t of ['purchase', 'refinance', 'renewal', 'switch', 'heloc']) {
      const h = hueOfHsl(typeSkin(t)!.fg)
      expect(h >= 60 && h <= 140, `${t} (${h}°) is in the green band`).toBe(false)
    }
  })

  it('an unknown deal type gets neutral slate rather than an invented hue', () => {
    const unknown = typeSkin('wraparound_mortgage')!
    expect(unknown.fg).toContain('hsl(210 12%')
    expect(typeSkin(null)).toBeNull()
  })
})
