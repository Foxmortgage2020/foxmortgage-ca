// Pipeline staleness tests. The load-bearing proof (acceptance 3): the real
// open-deal set from live Zoho (2026-07-12) reconciles to exactly 8 active
// files worth $4,714,239.74 and 23 stale files once the rule runs. Plus the
// exact boundary behaviour of both arms and the computePipeline integration.

import { describe, expect, it } from 'vitest'
import { ymdAddDays } from '@/lib/dates'
import {
  classifyOpenDeals,
  isStaleOpenDeal,
  staleCutoffs,
  staleReason,
  type HygieneDeal,
} from '@/lib/pipeline-hygiene'
import { computePipeline, type SlimDeal } from '@/lib/zoho-admin'

const TODAY = '2026-07-12'

// The 31 open-stage deals as they stood live on 2026-07-12 (COQL read).
// name, stage, amount, closingDate, createdTime.
type Row = [string, string, number, string | null, string]
const OPEN: Row[] = [
  ['Tyler Thompson - Additional Property', 'Options', 208000, null, '2022-11-14'],
  ['John Sanvido - Additional Property', 'Options', 250000, null, '2022-11-14'],
  ['Michelle Ferguson - Additional Property', 'Options', 457357, null, '2022-11-14'],
  ['Joseph Jackett - Additional Property', 'Options', 575000, null, '2022-11-14'],
  ['Joseph Jackett - Additional Property', 'Options', 0, null, '2022-11-14'],
  ['Allen Hutten - Additional Property', 'Options', 321000, null, '2022-11-14'],
  ['Nicole Hutten - Additional Property', 'Options', 540848.66, null, '2022-11-14'],
  ['BRXM-F050350 — Salim Islam', 'Application Started', 450000, null, '2026-04-09'],
  ['BRXM-F054033 — Alexander Fensham', 'Conditionally Approved', 640000, null, '2026-05-11'],
  ['BRXM-F054420 — Ayana Stafford', 'Application Started', 365000, null, '2026-05-11'],
  ['BRXM-F053107 — David Mehmi', 'Underwriting In Progress', 650000, null, '2026-05-13'],
  ['BRXM-F057623 — Erick Spek', 'Application Started', 450000, null, '2026-06-08'],
  ['Justin Springer Mortgage', 'Pending', 0, '2021-03-22', '2022-11-14'],
  ['Daniel Cotroneo', 'Options', 0, '2021-07-01', '2022-11-14'],
  ['Christina Kingma Mortgage', 'Pending', 0, '2021-08-16', '2022-11-14'],
  ['Tony Ferkul Mortgage', 'Pending', 0, '2021-11-15', '2022-11-14'],
  ['Tyler Thompson', 'Options', 375000, '2022-01-19', '2022-11-14'],
  ['John Sanvido', 'Options', 1000000, '2022-02-11', '2022-11-14'],
  ['Sarah Duncan', 'Options', 275000, '2022-03-20', '2022-11-14'],
  ['Teresa Fox Mortgage', 'Pending', 0, '2022-04-04', '2022-11-14'],
  ['Allan Fox Mortgage', 'Pending', 0, '2022-05-03', '2022-11-14'],
  ['Allan Fox Mortgage', 'Pending', 0, '2022-05-03', '2022-11-14'],
  ['Michelle Ferguson', 'Options', 0, '2022-05-29', '2022-11-14'],
  ['Matt Newby', 'Options', 0, '2022-07-28', '2022-11-14'],
  ['Nicole Hutten', 'Options', 835000, '2022-09-14', '2022-11-14'],
  ['IFMS-F032817', 'Pending', 665000, '2024-05-20', '2024-09-10'],
  ['IFMS-F034491', 'Pending', 800000, '2024-06-23', '2024-09-10'],
  ['BRXM-F056361 — Steven Kerr', 'Collecting Documentation', 471466.74, '2026-07-24', '2026-05-20'],
  ['BRXM-F053725 — Tyler Bannerman', 'Conditionally Approved', 527773, '2026-07-28', '2026-04-09'],
  ['BRXM-F057400 - Caitlin Crnkovic', 'Approved', 1160000, '2026-07-30', '2026-06-09'],
  ['BRXM-F025547', 'Conditionally Approved', 560000, '2026-09-02', '2024-11-26'],
]

function slim(rows: Row[]): SlimDeal[] {
  return rows.map(([dealName, stage, amount, closingDate, createdTime], i) => ({
    id: `z-${i}`,
    dealName,
    stage,
    amount,
    closingDate,
    createdTime,
  }))
}

describe('staleness reconciliation (the acceptance-3 anchor)', () => {
  it('splits the live open set into exactly 8 active files worth $4,714,239.74', () => {
    const { active, stale } = classifyOpenDeals(slim(OPEN), TODAY)
    expect(active).toHaveLength(8)
    expect(stale).toHaveLength(23)
    const activeVolume = active.reduce((s, d) => s + d.amount, 0)
    expect(activeVolume).toBeCloseTo(4_714_239.74, 2)
    // The eight are exactly the 2026-created live files.
    expect(active.map(d => d.dealName).sort()).toEqual(
      [
        'BRXM-F050350 — Salim Islam',
        'BRXM-F053107 — David Mehmi',
        'BRXM-F053725 — Tyler Bannerman',
        'BRXM-F054033 — Alexander Fensham',
        'BRXM-F054420 — Ayana Stafford',
        'BRXM-F056361 — Steven Kerr',
        'BRXM-F057400 - Caitlin Crnkovic',
        'BRXM-F057623 — Erick Spek',
      ].sort(),
    )
  })

  it('catches the mis-staged Additional Property records and the future-dated 2024 file', () => {
    const { stale } = classifyOpenDeals(slim(OPEN), TODAY)
    // The 7 "- Additional Property" records live in Options with no close
    // date; only the created-age arm can catch them.
    const props = stale.filter(d => d.dealName.includes('Additional Property'))
    expect(props).toHaveLength(7)
    expect(props.every(d => d.staleReason === 'dormant')).toBe(true)
    // BRXM-F025547 has a FUTURE close date but was created in 2024.
    const rolled = stale.find(d => d.dealName === 'BRXM-F025547')!
    expect(rolled.staleReason).toBe('dormant')
  })
})

describe('the two arms and their boundaries', () => {
  const cut = staleCutoffs(TODAY)

  it('lapsed arm: strictly more than 90 days past close, not exactly 90', () => {
    const atCutoff: HygieneDeal = { closingDate: cut.closingCutoff, createdTime: TODAY }
    const oneDayOlder: HygieneDeal = {
      closingDate: ymdAddDays(cut.closingCutoff, -1),
      createdTime: TODAY,
    }
    expect(staleReason(atCutoff, cut)).toBeNull()
    expect(staleReason(oneDayOlder, cut)).toBe('lapsed')
  })

  it('dormant arm: strictly more than 180 days since creation, not exactly 180', () => {
    const atCutoff: HygieneDeal = { closingDate: null, createdTime: cut.createdCutoff }
    const oneDayOlder: HygieneDeal = { closingDate: null, createdTime: ymdAddDays(cut.createdCutoff, -1) }
    expect(staleReason(atCutoff, cut)).toBeNull()
    expect(staleReason(oneDayOlder, cut)).toBe('dormant')
  })

  it('a future close on a freshly-created file is active', () => {
    expect(isStaleOpenDeal({ closingDate: '2026-09-30', createdTime: '2026-06-01' }, TODAY)).toBe(false)
  })

  it('a null close on a freshly-created file is active; on an old one it is dormant', () => {
    expect(isStaleOpenDeal({ closingDate: null, createdTime: '2026-06-01' }, TODAY)).toBe(false)
    expect(isStaleOpenDeal({ closingDate: null, createdTime: '2022-11-14' }, TODAY)).toBe(true)
  })

  it('lapsed wins over dormant when both are true', () => {
    expect(staleReason({ closingDate: '2021-03-22', createdTime: '2022-11-14' }, cut)).toBe('lapsed')
  })
})

describe('computePipeline integration', () => {
  it('reports the 8 active files, the 23-file stale bucket, and excludes terminal + summary', () => {
    const deals: SlimDeal[] = [
      ...slim(OPEN),
      { id: 't1', dealName: 'Old funded', stage: 'Mortgage Funded', amount: 500000, closingDate: '2025-01-10', createdTime: '2024-11-01' },
      { id: 't2', dealName: '2026 funded', stage: 'Funded', amount: 745500, closingDate: '2026-01-19', createdTime: '2025-11-01' },
      { id: 't3', dealName: 'Archived', stage: 'Archive', amount: 100000, closingDate: null, createdTime: '2022-01-01' },
      { id: 's1', dealName: 'Prop record', stage: 'Additional Properties', amount: 300000, closingDate: null, createdTime: '2022-01-01' },
    ]
    const view = computePipeline(deals, TODAY)
    expect(view.openCount).toBe(8)
    expect(view.openVolume).toBeCloseTo(4_714_239.74, 2)
    expect(view.staleCount).toBe(23)
    // Funded/terminal deals are not in the pipeline and not in the stale bucket.
    expect(view.stale.some(d => d.stage === 'Funded' || d.stage === 'Mortgage Funded')).toBe(false)
    // Additional Properties stage counts as summary, not stale, not pipeline.
    const summaryTotal = view.summary.reduce((s, x) => s + x.count, 0)
    expect(summaryTotal).toBe(1)
  })
})
