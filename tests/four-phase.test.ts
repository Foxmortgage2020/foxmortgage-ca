// The four-phase model (Deals Beta, 2026-08-01).
//
// The tests that matter most pin the never-invent-a-number rule, using the
// exact shapes the live rec schema returned on 2026-08-01: seven deals, two
// with no stage history at all, and two more whose only event records entry
// into `submitted` while the deal now sits in `lender_response`.

import { describe, expect, it } from 'vitest'
import {
  BLOCKED_BY_LABELS,
  DAYS_UNKNOWN_COPY,
  PHASES,
  PHASE_ORDER,
  PHASE_PLACEHOLDER,
  blockedByChip,
  borrowersFor,
  columnTotals,
  columnsForPhase,
  daysInStage,
  dealsInStage,
  fmtAmount,
  fmtTotal,
  isActionableChip,
  isPhaseKey,
  phaseTotals,
  purposeLabel,
  roleLabel,
  type DealLike,
  type StageEventLike,
  type StageLike,
} from '../lib/four-phase'

// The live stage configuration, trimmed to the columns that carry a phase.
const STAGES: StageLike[] = [
  { code: 'inquiry', label: 'Inquiry and lead', description: 'x', sort_order: 10, phase: null },
  { code: 'application', label: 'Application', description: 'The client is filling in their application.', sort_order: 20, phase: 'advise' },
  { code: 'documents', label: 'Documents', description: 'We are collecting the paperwork.', sort_order: 30, phase: 'advise' },
  { code: 'submitted', label: 'Submitted to lender', description: 'The file has gone to a lender.', sort_order: 40, phase: 'fund' },
  { code: 'lender_response', label: 'Lender response', description: 'The lender has come back.', sort_order: 50, phase: 'fund' },
  { code: 'conditions', label: 'Conditions', description: 'Working the list down to zero.', sort_order: 60, phase: 'fund' },
  { code: 'commitment', label: 'Commitment', description: 'The commitment letter is signed.', sort_order: 70, phase: 'fund' },
  { code: 'lawyer_closing', label: 'Lawyer and closing', description: 'The file is with the lawyer.', sort_order: 80, phase: 'fund' },
  { code: 'funded', label: 'Funded', description: 'The money has advanced.', sort_order: 90, phase: 'fund' },
  { code: 'renewal', label: 'Renewal', description: 'The term is ending.', sort_order: 120, phase: null },
]

const deal = (over: Partial<DealLike> & { id: string }): DealLike => ({
  file_ref: 'BRXM-F000000',
  deal_type: 'purchase',
  stage_code: 'application',
  mortgage_amount: 100000,
  blocked_by: null,
  ...over,
})

// ─── Columns come from configuration, never from code ───────────────────────

describe('columns are configuration', () => {
  it('advise has two columns and fund has six, in sort_order', () => {
    expect(columnsForPhase(STAGES, 'advise').map(s => s.code)).toEqual(['application', 'documents'])
    expect(columnsForPhase(STAGES, 'fund').map(s => s.code)).toEqual([
      'submitted',
      'lender_response',
      'conditions',
      'commitment',
      'lawyer_closing',
      'funded',
    ])
  })

  it('a stage with a null phase belongs to no board', () => {
    const all = PHASE_ORDER.flatMap(p => columnsForPhase(STAGES, p).map(s => s.code))
    expect(all).not.toContain('inquiry')
    expect(all).not.toContain('renewal')
  })

  it('adding a stage row adds a column with no code change', () => {
    const withNew: StageLike[] = [
      ...STAGES,
      { code: 'strategy_session', label: 'Strategy session', description: 'The conversation.', sort_order: 35, phase: 'advise' },
    ]
    expect(columnsForPhase(withNew, 'advise').map(s => s.code)).toEqual([
      'application',
      'documents',
      'strategy_session',
    ])
  })

  it('an inactive stage does not render', () => {
    const withOff: StageLike[] = [
      ...STAGES,
      { code: 'retired', label: 'Retired', description: null, sort_order: 45, phase: 'fund', is_active: false },
    ]
    expect(columnsForPhase(withOff, 'fund').map(s => s.code)).not.toContain('retired')
  })
})

// ─── Counts and totals, and the two units never meeting ─────────────────────

describe('counts and totals', () => {
  it('an empty column is zero and zero, not a missing value', () => {
    expect(columnTotals([])).toEqual({ count: 0, amount: 0, partial: false })
  })

  it('a deal with no amount contributes nothing and flags the total partial', () => {
    const t = columnTotals([deal({ id: 'a', mortgage_amount: 500000 }), deal({ id: 'b', mortgage_amount: null })])
    expect(t.count).toBe(2)
    expect(t.amount).toBe(500000)
    expect(t.partial).toBe(true)
  })

  it('phase totals cover only that phase’s stages', () => {
    const deals = [
      deal({ id: '1', stage_code: 'application', mortgage_amount: 494000 }),
      deal({ id: '2', stage_code: 'documents', mortgage_amount: 359000 }),
      deal({ id: '3', stage_code: 'funded', mortgage_amount: 635000 }),
      deal({ id: '4', stage_code: 'renewal', mortgage_amount: 999999 }),
    ]
    expect(phaseTotals(STAGES, deals, 'advise')).toMatchObject({ count: 2, amount: 853000 })
    expect(phaseTotals(STAGES, deals, 'fund')).toMatchObject({ count: 1, amount: 635000 })
  })

  it('the model exposes no way to add a contact count to a deal count', () => {
    // Contact-level phases carry no money function at all: phaseTotals is the
    // only total, and Intake/Monitor have no stages carrying their phase.
    expect(phaseTotals(STAGES, [], 'intake')).toEqual({ count: 0, amount: 0, partial: false })
    expect(PHASES.intake.unit).toBe('contact')
    expect(PHASES.advise.unit).toBe('deal')
    expect(PHASES.fund.unit).toBe('deal')
    expect(PHASES.monitor.unit).toBe('contact')
  })

  it('the live occupancy reproduces: 5 of 8 columns occupied, 3 empty', () => {
    const live = [
      deal({ id: '1', stage_code: 'application' }),
      deal({ id: '2', stage_code: 'documents' }),
      deal({ id: '3', stage_code: 'submitted' }),
      deal({ id: '4', stage_code: 'lender_response' }),
      deal({ id: '5', stage_code: 'lender_response' }),
      deal({ id: '6', stage_code: 'funded' }),
      deal({ id: '7', stage_code: 'funded' }),
    ]
    const cols = [...columnsForPhase(STAGES, 'advise'), ...columnsForPhase(STAGES, 'fund')]
    expect(cols).toHaveLength(8)
    const occupancy = cols.map(c => dealsInStage(live, c.code).length)
    expect(occupancy).toEqual([1, 1, 1, 2, 0, 0, 0, 2])
    expect(occupancy.filter(n => n > 0)).toHaveLength(5)
    expect(occupancy.filter(n => n === 0)).toHaveLength(3)
  })
})

// ─── THE rule: days in stage is never invented ──────────────────────────────

describe('days in stage never invents a figure', () => {
  const NOW = '2026-08-01T18:00:00.000Z'

  it('measures from the event that entered the CURRENT stage', () => {
    const d = deal({ id: 'x', stage_code: 'funded' })
    const ev: StageEventLike[] = [
      { deal_id: 'x', to_stage: 'submitted', changed_at: '2026-04-20T21:13:05.886Z' },
      { deal_id: 'x', to_stage: 'commitment', changed_at: '2026-06-15T14:21:32.775Z' },
      { deal_id: 'x', to_stage: 'funded', changed_at: '2026-06-24T15:16:46.391Z' },
    ]
    const r = daysInStage(d, ev, NOW)
    expect(r).toMatchObject({ known: true, days: 38, since: '2026-06-24' })
  })

  it('a deal with NO history at all shows no figure and says so', () => {
    const r = daysInStage(deal({ id: 'y', stage_code: 'application' }), [], NOW)
    expect(r).toEqual({ known: false, reason: 'no_history' })
    expect(DAYS_UNKNOWN_COPY.no_history).toBe('no stage history')
  })

  // The case the brief did not anticipate and the live data contains twice.
  it('history that stops short of the current stage shows no figure', () => {
    const d = deal({ id: 'z', stage_code: 'lender_response' })
    const ev: StageEventLike[] = [
      { deal_id: 'z', to_stage: 'submitted', changed_at: '2026-05-21T16:24:18.645Z' },
    ]
    const r = daysInStage(d, ev, NOW)
    expect(r).toEqual({ known: false, reason: 'entry_not_recorded' })
  })

  it('NEVER falls back to the latest event of any kind', () => {
    // Using the submitted event would print 72 days under a lender_response
    // heading. The only correct answer is no answer.
    const d = deal({ id: 'z', stage_code: 'lender_response' })
    const ev: StageEventLike[] = [
      { deal_id: 'z', to_stage: 'submitted', changed_at: '2026-05-21T16:24:18.645Z' },
    ]
    const r = daysInStage(d, ev, NOW)
    expect(r.known).toBe(false)
    expect(JSON.stringify(r)).not.toContain('72')
  })

  it('a deal stalled since March never renders as 0 days', () => {
    const d = deal({ id: 'm', stage_code: 'documents' })
    const ev: StageEventLike[] = [
      { deal_id: 'm', to_stage: 'documents', changed_at: '2026-03-02T09:00:00.000Z' },
    ]
    const r = daysInStage(d, ev, NOW)
    expect(r).toMatchObject({ known: true })
    if (r.known) expect(r.days).toBeGreaterThan(140)
  })

  it('another deal’s events never leak into this one', () => {
    const d = deal({ id: 'a', stage_code: 'funded' })
    const ev: StageEventLike[] = [{ deal_id: 'b', to_stage: 'funded', changed_at: '2026-07-01T00:00:00.000Z' }]
    expect(daysInStage(d, ev, NOW)).toEqual({ known: false, reason: 'no_history' })
  })

  it('re-entering a stage measures from the LATEST entry', () => {
    const d = deal({ id: 'r', stage_code: 'conditions' })
    const ev: StageEventLike[] = [
      { deal_id: 'r', to_stage: 'conditions', changed_at: '2026-05-01T00:00:00.000Z' },
      { deal_id: 'r', to_stage: 'commitment', changed_at: '2026-06-01T00:00:00.000Z' },
      { deal_id: 'r', to_stage: 'conditions', changed_at: '2026-07-25T00:00:00.000Z' },
    ]
    const r = daysInStage(d, ev, NOW)
    expect(r).toMatchObject({ known: true, since: '2026-07-25' })
  })

  it('a malformed timestamp yields no figure rather than NaN', () => {
    const d = deal({ id: 'n', stage_code: 'funded' })
    const ev: StageEventLike[] = [{ deal_id: 'n', to_stage: 'funded', changed_at: 'not-a-date' }]
    expect(daysInStage(d, ev, NOW).known).toBe(false)
  })
})

// ─── The blocked-by chip ────────────────────────────────────────────────────

describe('blocked-by chip', () => {
  it('renders only the four known values', () => {
    expect(blockedByChip('you')).toBe('you')
    expect(blockedByChip('Client')).toBe('client')
    expect(blockedByChip('LENDER')).toBe('lender')
    expect(blockedByChip('lawyer')).toBe('lawyer')
  })

  it('renders nothing for null, empty, or anything unrecognised', () => {
    expect(blockedByChip(null)).toBeNull()
    expect(blockedByChip(undefined)).toBeNull()
    expect(blockedByChip('')).toBeNull()
    expect(blockedByChip('   ')).toBeNull()
    expect(blockedByChip('underwriter')).toBeNull()
    expect(blockedByChip('me')).toBeNull()
  })

  it('only You is actionable, which is what earns it the lime', () => {
    expect(isActionableChip('you')).toBe(true)
    expect(isActionableChip('client')).toBe(false)
    expect(isActionableChip('lender')).toBe(false)
    expect(isActionableChip('lawyer')).toBe(false)
    expect(isActionableChip(null)).toBe(false)
  })

  it('every chip has a label', () => {
    for (const k of ['you', 'client', 'lender', 'lawyer'] as const) {
      expect(BLOCKED_BY_LABELS[k].length).toBeGreaterThan(0)
    }
  })
})

// ─── Presentation helpers ───────────────────────────────────────────────────

describe('presentation', () => {
  it('the phase bar is four phases in a fixed order', () => {
    expect(PHASE_ORDER).toEqual(['intake', 'advise', 'fund', 'monitor'])
    for (const p of PHASE_ORDER) expect(PHASES[p].label.length).toBeGreaterThan(0)
  })

  it('exactly the two deal-level phases render as boards', () => {
    expect(PHASE_ORDER.filter(p => PHASES[p].rendersBoard)).toEqual(['advise', 'fund'])
  })

  it('the two placeholders say what they are waiting on', () => {
    expect(PHASE_PLACEHOLDER.intake).toMatch(/consent/i)
    expect(PHASE_PLACEHOLDER.monitor).toMatch(/Opportunities/)
    expect(PHASE_PLACEHOLDER.monitor).toMatch(/rather than rebuild/i)
  })

  it('isPhaseKey guards the URL parameter', () => {
    expect(isPhaseKey('advise')).toBe(true)
    expect(isPhaseKey('nope')).toBe(false)
    expect(isPhaseKey(null)).toBe(false)
  })

  it('purpose renders a word or nothing, never "unknown"', () => {
    expect(purposeLabel('purchase')).toBe('Purchase')
    expect(purposeLabel('renewal')).toBe('Renewal')
    expect(purposeLabel(null)).toBeNull()
    expect(purposeLabel('bridge')).toBe('bridge')
  })

  it('an amount renders or is null, never a zero standing in', () => {
    expect(fmtAmount(494000)).toBe('$494,000')
    expect(fmtAmount(null)).toBeNull()
    expect(fmtAmount(Number.NaN)).toBeNull()
    expect(fmtTotal(1740000)).toBe('$1,740,000')
    expect(fmtTotal(0)).toBe('$0')
  })

  it('borrowers sort primary first and drop nameless rows', () => {
    const d = deal({ id: 'd1' })
    const rows = [
      { deal_id: 'd1', role: 'co_applicant', full_name: 'Jordan Wells' },
      { deal_id: 'd1', role: 'primary_applicant', full_name: 'Sofia Ricci' },
      { deal_id: 'd1', role: 'co_applicant', full_name: null },
      { deal_id: 'other', role: 'primary_applicant', full_name: 'Marcus Tran' },
    ]
    expect(borrowersFor(d, rows)).toEqual([
      { name: 'Sofia Ricci', role: 'primary' },
      { name: 'Jordan Wells', role: 'co-applicant' },
    ])
  })

  it('an unknown role keeps its own value rather than being relabelled', () => {
    expect(roleLabel('primary_applicant')).toBe('primary')
    expect(roleLabel('co_applicant')).toBe('co-applicant')
    expect(roleLabel('trustee_of_estate')).toBe('trustee of estate')
    expect(roleLabel(null)).toBe('applicant')
  })
})
