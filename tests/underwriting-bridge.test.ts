// Phase B1: the auto-provision bridge plan and the structural test-room
// exclusion. The mutation half lives in fox-underwriting; everything the
// portal decides is pure and asserted here.

import { describe, expect, it } from 'vitest'
import {
  BELOW_SUBMITTED,
  BOARD_COLUMNS,
  CLOSED_ZOHO_STAGES,
  SUBMITTED_AND_BEYOND,
  boardColumnFor,
  computeBridgePlan,
  daysIdle,
  fileRefFromDealName,
  nextStepForRoom,
} from '../lib/underwriting-bridge'
import { isTestRoom } from '../lib/test-rooms'
import type { SlimDeal } from '../lib/zoho-admin'
import type { WorkbenchDeal } from '../lib/underwriting'

const zoho = (over: Partial<SlimDeal> & { id: string; dealName: string; stage: string }): SlimDeal => ({
  amount: 500_000,
  closingDate: '2026-09-01',
  createdTime: '2026-07-01',
  transactionType: 'Renewal',
  finmoUuid: 'aaaa-bbbb',
  ...over,
})

const room = (over: Partial<WorkbenchDeal> & { id: string; fileRef: string }): WorkbenchDeal => ({
  stage: 'intake',
  closingDate: null,
  zohoPotentialId: null,
  status: 'active',
  updatedAt: '2026-07-10T00:00:00Z',
  ...over,
})

describe('the stage boundary (display space)', () => {
  it('Submitted and beyond underwrites; below does not', () => {
    expect(SUBMITTED_AND_BEYOND[0]).toBe('Submitted')
    expect(SUBMITTED_AND_BEYOND).toContain('Underwriting In Progress')
    expect(SUBMITTED_AND_BEYOND).toContain('Conditionally Approved')
    expect(BELOW_SUBMITTED).toEqual(['Lead', 'Pending', 'Application Started'])
  })
})

describe('fileRefFromDealName', () => {
  it('handles the em dash convention, the hyphen stray, and bare refs', () => {
    expect(fileRefFromDealName('BRXM-F059751 — Nicholas Aitken')).toBe('BRXM-F059751')
    expect(fileRefFromDealName('BRXM-F057400 - Caitlin Crnkovic')).toBe('BRXM-F057400')
    expect(fileRefFromDealName('IFMS-F011671')).toBe('IFMS-F011671')
    // A property row prefixed by an address is NOT a file ref.
    expect(fileRefFromDealName('22 Birch Ave - BRXM-F020729')).toBeNull()
  })
})

describe('computeBridgePlan', () => {
  const aitken = zoho({ id: 'z1', dealName: 'BRXM-F059751 — Nicholas Aitken', stage: 'Submitted' })
  const kerr = zoho({ id: 'z2', dealName: 'BRXM-F056361 — Steven Kerr', stage: 'Conditionally Approved' })
  const mehmi = zoho({ id: 'z3', dealName: 'BRXM-F053107 — David Mehmi', stage: 'Underwriting In Progress' })
  const spek = zoho({ id: 'z4', dealName: 'BRXM-F057623 — Erick Spek', stage: 'Application Started' })
  const mehmiRoom = room({ id: 'r1', fileRef: 'BRXM-F053107', zohoPotentialId: 'z3', stage: 'in_progress' })

  it('provisions Submitted-or-beyond actives with no room; leaves roomed and below-Submitted files', () => {
    const plan = computeBridgePlan({
      activeDeals: [aitken, kerr, mehmi, spek],
      allDeals: [aitken, kerr, mehmi, spek],
      rooms: [mehmiRoom],
    })
    expect(plan.provision.map(p => p.fileRef).sort()).toEqual(['BRXM-F056361', 'BRXM-F059751'])
    expect(plan.provision.every(p => p.disposition === 'open')).toBe(true)
    expect(plan.notYetBridged.map(d => d.id)).toEqual(['z4'])
    // The payload carries the linkage the room is born with.
    const a = plan.provision.find(p => p.fileRef === 'BRXM-F059751')!
    expect(a.zohoPotentialId).toBe('z1')
    expect(a.finmoApplicationUuid).toBe('aaaa-bbbb')
    expect(a.zohoStage).toBe('Submitted')
  })

  it('is idempotent: once every file has a room, the plan is empty', () => {
    const rooms = [
      mehmiRoom,
      room({ id: 'r2', fileRef: 'BRXM-F059751', zohoPotentialId: 'z1' }),
      room({ id: 'r3', fileRef: 'BRXM-F056361', zohoPotentialId: 'z2' }),
    ]
    const plan = computeBridgePlan({
      activeDeals: [aitken, kerr, mehmi],
      allDeals: [aitken, kerr, mehmi],
      rooms,
    })
    expect(plan.provision).toEqual([])
    expect(plan.transitions).toEqual([])
  })

  it('matches by file_ref when the room predates its Zoho linkage', () => {
    const unlinked = room({ id: 'r9', fileRef: 'BRXM-F059751', zohoPotentialId: null })
    const plan = computeBridgePlan({ activeDeals: [aitken], allDeals: [aitken], rooms: [unlinked] })
    expect(plan.provision).toEqual([])
  })

  it('a Zoho regression to Cancelled marks the room for dormant; funded moves to funded; nothing deletes', () => {
    const cancelled = zoho({ id: 'z3', dealName: 'BRXM-F053107 — David Mehmi', stage: 'Cancelled' })
    const plan = computeBridgePlan({ activeDeals: [], allDeals: [cancelled], rooms: [mehmiRoom] })
    expect(plan.transitions.length).toBe(1)
    expect(plan.transitions[0].disposition).toBe('closed')

    const funded = zoho({ id: 'z3', dealName: 'BRXM-F053107 — David Mehmi', stage: 'Mortgage Funded' })
    const plan2 = computeBridgePlan({ activeDeals: [], allDeals: [funded], rooms: [mehmiRoom] })
    expect(plan2.transitions.length).toBe(1)
    expect(plan2.transitions[0].disposition).toBe('funded')

    // Already moved: no-op.
    const fundedRoom = { ...mehmiRoom, stage: 'funded' }
    const plan3 = computeBridgePlan({ activeDeals: [], allDeals: [funded], rooms: [fundedRoom] })
    expect(plan3.transitions).toEqual([])
  })

  it('never plans anything for a TEST-marked room or ref', () => {
    const testDeal = zoho({ id: 'z9', dealName: 'TEST-BRIDGE-1', stage: 'Submitted' })
    const testRoom = room({ id: 'rt', fileRef: 'TEST-GATES-COND-1', zohoPotentialId: 'z8' })
    const plan = computeBridgePlan({ activeDeals: [testDeal], allDeals: [testDeal], rooms: [testRoom] })
    expect(plan.provision).toEqual([])
    expect(plan.transitions).toEqual([])
  })

  it('closed-stage vocabulary covers the display space', () => {
    for (const s of ['Cancelled', 'Mortgage Lost', 'Archive']) {
      expect(CLOSED_ZOHO_STAGES).toContain(s)
    }
  })
})

describe('isTestRoom (the ONE structural predicate)', () => {
  it('catches the TEST- prefix and status markers, case-insensitively', () => {
    expect(isTestRoom('TEST-GATES-COND-1', 'active')).toBe(true)
    expect(isTestRoom('TEST-ISO-DEAL-1', 'whatever')).toBe(true)
    expect(isTestRoom('test_portal_1')).toBe(true)
    expect(isTestRoom('BRXM-F059751', 'TEST-AGENT-ISO marked artifact')).toBe(true)
    expect(isTestRoom('BRXM-F059751', 'active')).toBe(false)
    expect(isTestRoom('IFMS-F002684', 'superseded')).toBe(false)
  })
})

describe('the board mapping (workbench vocabulary onto columns)', () => {
  it('carries the seven columns in ladder order', () => {
    expect(BOARD_COLUMNS.map(c => c.key)).toEqual([
      'intake',
      'evidence',
      'packaging',
      'with_lender',
      'conditions',
      'ready',
      'funded',
    ])
    // B1 relabel: labels speak the lifecycle vocabulary, keys never move.
    expect(BOARD_COLUMNS.find(c => c.key === 'conditions')!.label).toBe('Conditions')
    expect(BOARD_COLUMNS.find(c => c.key === 'evidence')!.label).toBe('Documents & review')
  })

  it('maps the live legacy values and flags unknowns instead of hiding them', () => {
    expect(boardColumnFor('intake')).toEqual({ column: 'intake', mapped: true })
    expect(boardColumnFor('in_progress')).toEqual({ column: 'evidence', mapped: true })
    expect(boardColumnFor('underwriting')).toEqual({ column: 'evidence', mapped: true })
    expect(boardColumnFor('packaging')).toEqual({ column: 'packaging', mapped: true })
    expect(boardColumnFor('submitted')).toEqual({ column: 'with_lender', mapped: true })
    // Phase B2: approved / conditionally approved come back to the conditions
    // column, and funded is its own column now (not filtered off the board).
    expect(boardColumnFor('approved')).toEqual({ column: 'conditions', mapped: true })
    expect(boardColumnFor('conditionally_approved')).toEqual({ column: 'conditions', mapped: true })
    expect(boardColumnFor('ready')).toEqual({ column: 'ready', mapped: true })
    expect(boardColumnFor('Mortgage Funded')).toEqual({ column: 'funded', mapped: true })
    expect(boardColumnFor('something_new')).toEqual({ column: 'evidence', mapped: false })
  })

  it('next steps read in plain words', () => {
    expect(nextStepForRoom('intake', null)).toBe('Collect the client documents')
    expect(nextStepForRoom('conditions', 2)).toBe('2 conditions open')
    expect(nextStepForRoom('packaging', null)).toBe('Packaging the file for a lender')
    expect(nextStepForRoom('ready', null)).toBe('Cleared to close')
    expect(nextStepForRoom('funded', null)).toBe('Funded')
  })

  it('daysIdle counts whole days since last movement', () => {
    expect(daysIdle('2026-07-01T09:00:00Z', '2026-07-14')).toBe(13)
    expect(daysIdle('2026-07-14T00:00:00Z', '2026-07-14')).toBe(0)
  })
})
