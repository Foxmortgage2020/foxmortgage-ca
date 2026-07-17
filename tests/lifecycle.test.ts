// The lifecycle spine (Brief B1) — the contracts:
//   1. Every funnel stage maps to exactly one phase; unknown stages return
//      null so callers render them loudly (never a silent bucket).
//   2. The board's seven columns map totally, and phase order never
//      interleaves along the board order.
//   3. Steps: every step labelled, every non-live step carries its note
//      (the dashboard doubles as the SOP), planned steps are never current.
//   4. The journey is shape-aware (purchase carries the deck's pre-approval
//      steps, refinance does not) and funded files sit Beyond funding.

import { describe, expect, it } from 'vitest'
import {
  LIFECYCLE_PHASES,
  PHASE_STEPS,
  boardPhaseGroups,
  groupByPhase,
  journeyForStage,
  phaseForBoardColumn,
  phaseForDisplayStage,
  stepShapeFor,
  type PhaseKey,
  type StepShape,
} from '../config/lifecycle'
import { FUNDED_STAGES, PIPELINE_STAGE_ORDER, STAGE_WEIGHTS } from '../config/pipeline'
import { BOARD_COLUMNS } from '../lib/underwriting-bridge'

const PHASE_KEYS = LIFECYCLE_PHASES.map(p => p.key)
const phaseIdx = (k: PhaseKey) => PHASE_KEYS.indexOf(k)

describe('phaseForDisplayStage', () => {
  it('maps every funnel stage to exactly one phase', () => {
    for (const stage of PIPELINE_STAGE_ORDER) {
      const phase = phaseForDisplayStage(stage)
      expect(phase, `stage ${stage} maps to no phase`).not.toBeNull()
      expect(PHASE_KEYS).toContain(phase)
    }
  })

  it('assigns the decided boundaries', () => {
    expect(phaseForDisplayStage('Submitted')).toBe('intake')
    expect(phaseForDisplayStage('Collecting Documentation')).toBe('underwriting')
    expect(phaseForDisplayStage('Submitted to Lender')).toBe('underwriting')
    expect(phaseForDisplayStage('Conditionally Approved')).toBe('fulfilment')
    expect(phaseForDisplayStage('Approved')).toBe('fulfilment')
    expect(phaseForDisplayStage('Broker Complete')).toBe('complete_paid')
  })

  it('funded terminals sit Beyond funding on per-file surfaces', () => {
    for (const stage of FUNDED_STAGES) {
      expect(phaseForDisplayStage(stage)).toBe('beyond_funding')
    }
  })

  it('covers the live findings: Ready To Close and the legacy Qualification', () => {
    // Reads return 'Ready To Close' verbatim on a live file (2026-07-16
    // census) — funnel position after Approved, before funding.
    expect(phaseForDisplayStage('Ready To Close')).toBe('complete_paid')
    // Legacy stage still weighted in STAGE_WEIGHTS but absent from the
    // funnel order — the brief's table missed it.
    expect('Qualification' in STAGE_WEIGHTS).toBe(true)
    expect(phaseForDisplayStage('Qualification')).toBe('intake')
  })

  it('unknown and dead-end stages return null (the loud contract)', () => {
    expect(phaseForDisplayStage('Some Future Stage')).toBeNull()
    // Non-funded terminals are off the spine.
    expect(phaseForDisplayStage('Archive')).toBeNull()
    expect(phaseForDisplayStage('Mortgage Lost')).toBeNull()
    expect(phaseForDisplayStage('Cancelled')).toBeNull()
  })
})

describe('board columns and phase order', () => {
  it('every board column maps to a phase', () => {
    for (const col of BOARD_COLUMNS) {
      expect(PHASE_KEYS).toContain(phaseForBoardColumn(col.key))
    }
  })

  it('phase order matches board column order (no interleaving)', () => {
    let last = -1
    for (const col of BOARD_COLUMNS) {
      const idx = phaseIdx(phaseForBoardColumn(col.key))
      expect(idx, `column ${col.key} interleaves phases`).toBeGreaterThanOrEqual(last)
      last = idx
    }
  })

  it('groups the board columns under four contiguous phase headers', () => {
    const groups = boardPhaseGroups(BOARD_COLUMNS)
    expect(groups.map(g => g.key)).toEqual(['intake', 'underwriting', 'fulfilment', 'complete_paid'])
    expect(groups.map(g => g.columns.map(c => c.key))).toEqual([
      ['intake'],
      ['evidence', 'packaging', 'with_lender'],
      ['conditions'],
      ['ready', 'funded'],
    ])
  })

  it('column keys are stable (labels changed, keys never)', () => {
    expect(BOARD_COLUMNS.map(c => c.key)).toEqual([
      'intake',
      'evidence',
      'packaging',
      'with_lender',
      'conditions',
      'ready',
      'funded',
    ])
  })
})

describe('the step sets', () => {
  const SHAPES: StepShape[] = ['purchase', 'refi', 'renewal', 'switch', 'unknown']

  it('every step has a label and every non-live step has a note', () => {
    for (const phase of PHASE_KEYS) {
      for (const shape of SHAPES) {
        for (const s of PHASE_STEPS[phase][shape]) {
          expect(s.label.trim().length, `${phase}/${shape}/${s.key} has no label`).toBeGreaterThan(0)
          if (s.status !== 'live') {
            expect(s.note?.trim().length, `${phase}/${shape}/${s.key} (${s.status}) has no note`).toBeGreaterThan(0)
          }
        }
      }
    }
  })

  it('planned steps carry no stage matchers (a missing capability is never where a file is)', () => {
    for (const phase of PHASE_KEYS) {
      for (const shape of SHAPES) {
        for (const s of PHASE_STEPS[phase][shape]) {
          if (s.status === 'planned') expect(s.stages ?? []).toEqual([])
        }
      }
    }
  })

  it('purchase carries the deck pre-approval steps; the compressed shapes do not', () => {
    const keysFor = (shape: StepShape) => PHASE_STEPS.underwriting[shape].map(s => s.key)
    expect(keysFor('purchase')).toContain('preapproval_letter')
    expect(keysFor('purchase')).toContain('shopping')
    for (const shape of ['refi', 'renewal', 'switch', 'unknown'] as StepShape[]) {
      expect(keysFor(shape)).not.toContain('preapproval_letter')
      expect(keysFor(shape)).not.toContain('shopping')
    }
  })

  it('the two mandated planned placeholders exist', () => {
    expect(
      PHASE_STEPS.intake.unknown.find(s => s.key === 'application_chase')?.status,
    ).toBe('planned')
    expect(PHASE_STEPS.underwriting.purchase.find(s => s.key === 'shopping')?.status).toBe('planned')
  })
})

describe('journeyForStage', () => {
  it('resolves workbench room stages through the board vocabulary', () => {
    const j = journeyForStage({ stage: 'in_progress', shape: 'refi', space: 'room' })
    expect(j.mapped).toBe(true)
    expect(j.currentPhase).toBe('underwriting')
    expect(j.phases.find(p => p.key === 'intake')?.state).toBe('done')
    expect(j.phases.find(p => p.key === 'fulfilment')?.state).toBe('upcoming')
    expect(j.caption).toBe('Collect the documents')
  })

  it('the two stage spaces disagree on "submitted" and the caller declares which one it speaks', () => {
    // A workbench room at 'submitted' is with the lender; the Zoho display
    // stage 'Submitted' is a fresh application in intake.
    expect(journeyForStage({ stage: 'submitted', shape: 'refi', space: 'room' }).currentPhase).toBe(
      'underwriting',
    )
    const display = journeyForStage({ stage: 'Submitted', shape: 'refi', space: 'display' })
    expect(display.currentPhase).toBe('intake')
    expect(display.caption).toBe('Review the application')
  })

  it('purchase and refi shapes render different underwriting steps', () => {
    const purchase = journeyForStage({ stage: 'in_progress', shape: 'purchase', space: 'room' })
    const refi = journeyForStage({ stage: 'in_progress', shape: 'refi', space: 'room' })
    expect(purchase.steps.map(s => s.key)).toContain('shopping')
    expect(refi.steps.map(s => s.key)).not.toContain('shopping')
  })

  it('a funded file shows Beyond funding current, everything before it done', () => {
    for (const stage of ['funded', 'Mortgage Funded']) {
      const j = journeyForStage({ stage, shape: 'unknown', space: 'room' })
      expect(j.currentPhase).toBe('beyond_funding')
      expect(j.phases.filter(p => p.state === 'done').map(p => p.key)).toEqual([
        'intake',
        'underwriting',
        'fulfilment',
        'complete_paid',
      ])
      expect(j.caption).toBe('Renewal radar watching')
    }
  })

  it('planned steps render as placeholders with their note, never current or done', () => {
    const j = journeyForStage({ stage: 'submitted', shape: 'purchase', space: 'room' })
    // Workbench 'submitted' resolves through the board to with-lender.
    expect(j.currentPhase).toBe('underwriting')
    const shopping = j.steps.find(s => s.key === 'shopping')
    expect(shopping?.status).toBe('planned')
    expect(shopping?.state).toBe('upcoming')
    expect(shopping?.note).toBeTruthy()
    // Steps before the current one read done; the current one is claimed.
    expect(j.steps.find(s => s.key === 'with_lender')?.state).toBe('current')
    expect(j.steps.find(s => s.key === 'documents')?.state).toBe('done')
  })

  it('an unmapped stage renders the loud state, never a silent bucket', () => {
    const j = journeyForStage({ stage: 'Some Future Stage', shape: 'unknown', space: 'room' })
    expect(j.mapped).toBe(false)
    expect(j.currentPhase).toBeNull()
    expect(j.steps).toEqual([])
    const empty = journeyForStage({ stage: null, shape: 'unknown', space: 'room' })
    expect(empty.mapped).toBe(false)
  })
})

describe('stepShapeFor', () => {
  it('uses the record type, falls back to the Finmo goal, goal wins a conflict', () => {
    expect(stepShapeFor('purchase', null)).toBe('purchase')
    expect(stepShapeFor(null, 'refinance')).toBe('refi')
    // The header-honesty rule: the Finmo goal wins a known conflict.
    expect(stepShapeFor('purchase', 'refinance')).toBe('refi')
    expect(stepShapeFor(null, null)).toBe('unknown')
    expect(stepShapeFor('', '')).toBe('unknown')
    // The house mapper folds switch into renewal (recorded in lifecycle.ts).
    expect(stepShapeFor('switch', null)).toBe('renewal')
  })
})

describe('groupByPhase', () => {
  const row = (stage: string) => ({ stage })

  it('groups in lifecycle order, input order kept within groups', () => {
    const rows = [
      row('Approved'),
      row('Application Started'),
      row('Submitted to Lender'),
      row('Underwriting In Progress'),
      row('Submitted'),
    ]
    const groups = groupByPhase(rows, r => r.stage)
    expect(groups.map(g => g.key)).toEqual(['intake', 'underwriting', 'fulfilment'])
    expect(groups[0].items.map(i => i.stage)).toEqual(['Application Started', 'Submitted'])
    expect(groups[1].items.map(i => i.stage)).toEqual([
      'Submitted to Lender',
      'Underwriting In Progress',
    ])
  })

  it('unmapped stages land in the trailing loud group, never forced into a phase', () => {
    const groups = groupByPhase([row('Approved'), row('Some Future Stage')], r => r.stage)
    expect(groups.map(g => g.key)).toEqual(['fulfilment', 'unmapped'])
    expect(groups[1].label).toBe('Phase not mapped')
  })

  it('empty phases produce no group rows', () => {
    expect(groupByPhase([], r => String(r))).toEqual([])
  })
})
