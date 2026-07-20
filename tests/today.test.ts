import { describe, it, expect } from 'vitest'
import {
  parseDealRef,
  relativeChipTone,
  prioritizeTasks,
  closingReadiness,
  buildClosingRows,
  renewalNurtureBuckets,
  buildExceptions,
  type ClosingRow,
} from '@/lib/today'
import type { OpenTask, ClosingDeal } from '@/lib/zoho-admin'
import type { WorkbenchDeal, ConditionRow, RenewalSequenceState } from '@/lib/underwriting'

const TODAY = '2026-07-20'

function wb(partial: Partial<WorkbenchDeal> & { id: string; fileRef: string }): WorkbenchDeal {
  return {
    stage: 'underwriting',
    closingDate: null,
    zohoPotentialId: null,
    status: 'active',
    updatedAt: '2026-07-19T00:00:00Z',
    ...partial,
  }
}
function task(partial: Partial<OpenTask> & { id: string; subject: string }): OpenTask {
  return { dueDate: null, priority: null, status: null, overdue: false, ...partial }
}
function seq(partial: Partial<RenewalSequenceState>): RenewalSequenceState {
  return {
    sequenceId: 's',
    zohoDealId: 'z',
    status: 'active',
    exitReason: null,
    maturityDate: '2026-12-01',
    clientName: 'X',
    nextTouch: null,
    sentCount: 0,
    ...partial,
  }
}

describe('parseDealRef', () => {
  it('extracts the live and demo file-ref conventions', () => {
    expect(parseDealRef('Chase BRXM-F053107 docs')).toBe('BRXM-F053107')
    expect(parseDealRef('IFMS-F001515 renewal')).toBe('IFMS-F001515')
    expect(parseDealRef('re: FOX-1004')).toBe('FOX-1004')
    expect(parseDealRef('Collect T4 (DEMO-F0001)')).toBe('DEMO-F0001')
  })
  it('returns null when there is no ref', () => {
    expect(parseDealRef('Follow up on the appraisal')).toBeNull()
    expect(parseDealRef(null)).toBeNull()
    expect(parseDealRef('')).toBeNull()
  })
})

describe('relativeChipTone', () => {
  it('maps urgency tones to StatusChip tones, never lime', () => {
    expect(relativeChipTone('danger')).toBe('red')
    expect(relativeChipTone('caution')).toBe('amber')
    expect(relativeChipTone('success')).toBe('green')
    expect(relativeChipTone('neutral')).toBe('gray')
  })
})

describe('prioritizeTasks', () => {
  const dealByRef = new Map<string, WorkbenchDeal>([
    ['BRXM-F001', wb({ id: 'd1', fileRef: 'BRXM-F001', closingDate: '2026-07-25' })], // 5 days → soon
    ['BRXM-F002', wb({ id: 'd2', fileRef: 'BRXM-F002', closingDate: '2027-01-01' })], // far
  ])
  const tasks: OpenTask[] = [
    task({ id: 'a', subject: 'Do thing (BRXM-F001)', dueDate: '2026-07-18' }), // overdue, closing soon
    task({ id: 'b', subject: 'Chase docs BRXM-F002', dueDate: '2026-07-20' }), // due today, closing far
    task({ id: 'c', subject: 'No ref task', dueDate: '2026-07-19' }), // overdue, no ref
  ]

  it('puts closing-within-30 tasks first, then earliest due', () => {
    const p = prioritizeTasks(tasks, dealByRef, TODAY, 5)
    expect(p.top.map(t => t.id)).toEqual(['a', 'c', 'b'])
  })
  it('resolves the deal room link and closing-soon flag only when a ref matches', () => {
    const p = prioritizeTasks(tasks, dealByRef, TODAY, 5)
    const a = p.top.find(t => t.id === 'a')!
    const b = p.top.find(t => t.id === 'b')!
    const c = p.top.find(t => t.id === 'c')!
    expect(a.roomHref).toBe('/portal/admin/deals/d1')
    expect(a.dealRef).toBe('BRXM-F001')
    expect(a.closingSoon).toBe(true)
    expect(b.roomHref).toBe('/portal/admin/deals/d2') // matched, but far close
    expect(b.closingSoon).toBe(false)
    expect(c.roomHref).toBeNull() // no ref → no link
    expect(c.dealRef).toBeNull()
  })
  it('counts overdue and overflow for the footer links', () => {
    const p = prioritizeTasks(tasks, dealByRef, TODAY, 2)
    expect(p.total).toBe(3)
    expect(p.overflow).toBe(1)
    expect(p.overdueCount).toBe(2) // a (07-18) and c (07-19); b is due today
    expect(p.top.length).toBe(2)
  })
})

describe('closingReadiness', () => {
  it('is neutral when there is no workbench file (never a false green)', () => {
    expect(closingReadiness({ hasWorkbench: false, condsAvailable: true, openConds: 0, overdueConds: 0 })).toEqual({
      tone: 'neutral',
      label: 'not linked to the workbench yet',
    })
  })
  it('is neutral when the condition read failed, never a false green', () => {
    expect(closingReadiness({ hasWorkbench: true, condsAvailable: false, openConds: 0, overdueConds: 0 })).toEqual({
      tone: 'neutral',
      label: 'condition state unavailable',
    })
  })
  it('is danger on overdue, warning on open, success on clear', () => {
    const base = { hasWorkbench: true, condsAvailable: true }
    expect(closingReadiness({ ...base, openConds: 3, overdueConds: 2 }).tone).toBe('danger')
    expect(closingReadiness({ ...base, openConds: 3, overdueConds: 2 }).label).toBe('2 overdue conditions')
    expect(closingReadiness({ ...base, openConds: 3, overdueConds: 0 })).toEqual({
      tone: 'warning',
      label: '3 open conditions',
    })
    expect(closingReadiness({ ...base, openConds: 0, overdueConds: 0 })).toEqual({
      tone: 'success',
      label: '0 open conditions',
    })
  })
  it('pluralizes correctly', () => {
    const base = { hasWorkbench: true, condsAvailable: true }
    expect(closingReadiness({ ...base, openConds: 1, overdueConds: 0 }).label).toBe('1 open condition')
    expect(closingReadiness({ ...base, openConds: 1, overdueConds: 1 }).label).toBe('1 overdue condition')
  })
})

describe('buildClosingRows', () => {
  const closings: ClosingDeal[] = [
    { id: 'z1', dealName: 'A — Purchase', stage: 'Underwriting In Progress', closingDate: '2026-07-24', amount: 500000 },
    { id: 'z2', dealName: 'B — Refinance', stage: 'Options', closingDate: '2026-07-22', amount: 300000 },
  ]
  const wbByZohoId = new Map<string, WorkbenchDeal>([
    ['z1', wb({ id: 'd1', fileRef: 'BRXM-F100', zohoPotentialId: 'z1' })],
  ])
  const condCounts = { d1: 2 }
  const overdueByRef = new Map([['BRXM-F100', 1]])

  it('joins conditions, computes readiness, links the room, and sorts soonest first', () => {
    const rows = buildClosingRows(closings, TODAY, wbByZohoId, condCounts, overdueByRef, true)
    expect(rows.map(r => r.id)).toEqual(['z2', 'z1']) // z2 closes sooner (2 vs 4 days)
    const r1 = rows.find(r => r.id === 'z1')!
    expect(r1.hasWorkbench).toBe(true)
    expect(r1.openConds).toBe(2)
    expect(r1.overdueConds).toBe(1)
    expect(r1.readiness.tone).toBe('danger')
    expect(r1.roomHref).toBe('/portal/admin/deals/d1')
    expect(r1.dealRef).toBe('BRXM-F100')
    expect(r1.daysToClose).toBe(4)
    const r2 = rows.find(r => r.id === 'z2')!
    expect(r2.hasWorkbench).toBe(false)
    expect(r2.readiness.tone).toBe('neutral')
    expect(r2.roomHref).toBe('/portal/admin/underwriting#not-yet-bridged')
  })
  it('reads neutral (never a false green) when the condition read failed', () => {
    const rows = buildClosingRows(closings, TODAY, wbByZohoId, {}, new Map(), false)
    const bridged = rows.find(r => r.id === 'z1')! // has a workbench file
    expect(bridged.hasWorkbench).toBe(true)
    expect(bridged.readiness.tone).toBe('neutral')
    expect(bridged.readiness.label).toBe('condition state unavailable')
  })
})

describe('renewalNurtureBuckets', () => {
  it('buckets by progress and only lights sendsLive when a send exists', () => {
    const b = renewalNurtureBuckets([
      seq({ sentCount: 0, nextTouch: { skeletonId: 'touch-150', scheduledFor: null, status: 'scheduled' } }), // entered
      seq({ sentCount: 0, nextTouch: { skeletonId: 'touch-150', scheduledFor: null, status: 'pending_approval' } }), // draft
      seq({ sentCount: 2, nextTouch: { skeletonId: 'touch-60', scheduledFor: null, status: 'held' } }), // sent + draft
      seq({ sentCount: 0, nextTouch: null }), // entered
    ])
    expect(b).toEqual({ total: 4, entered: 2, draftsMinted: 2, sent: 1, sendsLive: true })
  })
  it('reads dark when nothing has sent', () => {
    const b = renewalNurtureBuckets([
      seq({ sentCount: 0, nextTouch: { skeletonId: 'touch-150', scheduledFor: null, status: 'scheduled' } }),
    ])
    expect(b.sendsLive).toBe(false)
    expect(b.sent).toBe(0)
  })
  it('is empty for no sequences', () => {
    expect(renewalNurtureBuckets([])).toEqual({ total: 0, entered: 0, draftsMinted: 0, sent: 0, sendsLive: false })
  })
})

describe('buildExceptions', () => {
  function closingRow(partial: Partial<ClosingRow> & { id: string }): ClosingRow {
    return {
      dealName: 'A',
      dealRef: 'BRXM-F1',
      closingDate: '2026-07-24',
      amount: 500000,
      stage: 'X',
      roomHref: '/portal/admin/deals/d1',
      daysToClose: 4,
      hasWorkbench: true,
      openConds: 2,
      overdueConds: 2,
      readiness: { tone: 'danger', label: '2 overdue conditions' },
      ...partial,
    }
  }
  const overdue: ConditionRow[] = [
    { id: 'c1', dealRef: 'BRXM-F1', text: 'x', owner: 'broker', status: 'open', dueDate: '2026-07-18', condNumber: '1' },
    { id: 'c2', dealRef: 'BRXM-F1', text: 'y', owner: 'broker', status: 'open', dueDate: '2026-07-17', condNumber: '2' },
    { id: 'c3', dealRef: 'BRXM-F2', text: 'z', owner: 'solicitor', status: 'open', dueDate: '2026-07-19', condNumber: '3' },
  ]

  it('leads with an imminent closing that has overdue conditions, then the summaries', () => {
    const ex = buildExceptions({
      closings: [closingRow({ id: 'z1', daysToClose: 4, overdueConds: 2, dealRef: 'BRXM-F1' })],
      todayYMD: TODAY,
      overdue,
      dueSoon: 4,
      flags: { total: 5, high: 1, warning: 2, info: 2 },
      missingMaturity: { count: 3, volume: 900000 },
      credentials: { count: 1, anyRed: false },
      sync: { zohoDown: false, intakeStale: true, staleHours: 30 },
    })!
    expect(ex.tone).toBe('danger')
    expect(ex.lines[0].key).toBe('imminent-z1')
    expect(ex.lines[0].text).toContain('closes in 4 days with 2 overdue conditions')
    expect(ex.lines.map(l => l.key)).toEqual([
      'imminent-z1',
      'overdue-conditions',
      'due-soon',
      'flags',
      'missing-maturity',
      'credentials',
      'sync',
    ])
    expect(ex.lines.find(l => l.key === 'overdue-conditions')!.text).toBe('3 overdue conditions across 2 files')
    expect(ex.lines.find(l => l.key === 'due-soon')!.text).toBe('4 conditions due within 7 days')
    expect(ex.lines.find(l => l.key === 'missing-maturity')!.text).toContain('3 funded deals with no maturity date')
  })
  it('does not flag a far or clean closing as imminent, and drops empty inputs', () => {
    const ex = buildExceptions({
      closings: [
        closingRow({ id: 'far', daysToClose: 20, overdueConds: 2 }), // too far
        closingRow({ id: 'clean', daysToClose: 3, overdueConds: 0 }), // no overdue
      ],
      todayYMD: TODAY,
      overdue: [],
      dueSoon: 0,
      flags: { total: 0, high: 0, warning: 0, info: 0 },
      missingMaturity: null,
      credentials: { count: 0, anyRed: false },
      sync: { zohoDown: false, intakeStale: false, staleHours: 2 },
    })
    expect(ex).toBeNull()
  })
  it('tints caution when nothing is red', () => {
    const ex = buildExceptions({
      closings: [],
      todayYMD: TODAY,
      overdue: [],
      dueSoon: 2,
      flags: { total: 3, high: 0, warning: 2, info: 1 },
      missingMaturity: { count: 1, volume: 400000 },
      credentials: { count: 2, anyRed: false },
      sync: { zohoDown: false, intakeStale: false, staleHours: 2 },
    })!
    expect(ex.tone).toBe('caution')
    expect(ex.lines.find(l => l.key === 'flags')!.tone).toBe('caution')
    expect(ex.lines.find(l => l.key === 'due-soon')!.tone).toBe('caution')
    expect(ex.lines.find(l => l.key === 'missing-maturity')!.tone).toBe('caution')
  })
})
