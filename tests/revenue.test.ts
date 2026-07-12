// Revenue math tests (Session 7). What these prove: actuals take
// precedence over the model and the two bases never conflate (acceptance
// 2), changing a comp-model bps value changes the forecast (acceptance 4),
// closing-date hygiene buckets honestly (past-dated and undated deals
// never smear into future months), mix breakdowns render only at real
// coverage (acceptance 3), and the pacing gap math never divides by zero.

import { describe, expect, it } from 'vitest'
import { COMP_MODEL, COMP_MODEL_VERSION, type CompModel } from '@/config/comp'
import { isFundedStage, isSummaryStage, isTerminalStage, STAGE_WEIGHTS } from '@/config/pipeline'
import {
  commissionForecast,
  dealRevenue,
  filesToCloseGap,
  fundedByYear,
  fundedTrend,
  leadsBySource,
  MIN_MIX_COVERAGE,
  mixBreakdown,
  monthAdd,
  pacingByMonth,
  practiceHistoryYears,
  type RevenueDeal,
} from '@/lib/revenue'
import { isStaleOpenDeal } from '@/lib/pipeline-hygiene'

const TODAY = '2026-07-10'
const isOpen = (stage: string) => !isTerminalStage(stage) && !isSummaryStage(stage)

function deal(overrides: Partial<RevenueDeal>): RevenueDeal {
  return {
    id: 'x',
    dealName: 'TEST',
    stage: 'Underwriting In Progress',
    amount: 500_000,
    closingDate: null,
    createdTime: null,
    totalCommission: 0,
    bps: null,
    vbBps: null,
    splitToNetwork: null,
    lenderName: null,
    lenderClassification: null,
    referralPartnerId: null,
    referralPartnerName: null,
    rateType: null,
    termYears: null,
    mortgageType: null,
    transactionType: null,
    mortgageRate: null,
    ...overrides,
  }
}

// A model with confirmed values so tests are stable against seed edits.
const MODEL: CompModel = {
  version: COMP_MODEL_VERSION,
  rows: [
    { label: 'Monoline lenders', match: { classification: 'Monoline' }, bps: 100, confirmed: true },
    { label: 'Private lenders', match: { classification: 'private_lender' }, bps: 200, confirmed: true },
  ],
  defaultBps: { bps: 110, confirmed: false },
  networkSplit: { value: 0.15, confirmed: true },
  agentSplit: 1.0,
}

describe('month helpers', () => {
  it('adds months across year boundaries', () => {
    expect(monthAdd('2026-07', 6)).toBe('2027-01')
    expect(monthAdd('2026-01', -1)).toBe('2025-12')
    expect(monthAdd('2026-07', -11)).toBe('2025-08')
  })
})

describe('dealRevenue: actual first, model fills gaps', () => {
  it('a recorded Total_Commission is the actual and the model never touches it', () => {
    const rev = dealRevenue(deal({ totalCommission: 9505.13, amount: 745_500 }), MODEL)
    expect(rev).toEqual({ amount: 9505.13, basis: 'actual' })
  })

  it('a deal without a recorded commission prices through the model formula', () => {
    // 500,000 x 100/10,000 x (1 - 0.15) x 1.0 = 4,250
    const rev = dealRevenue(deal({ lenderClassification: 'Monoline' }), MODEL)
    expect(rev.basis).toBe('model')
    expect(rev.amount).toBeCloseTo(4_250, 2)
    expect(rev.modelLabel).toBe('Monoline lenders')
  })

  it('no matching row falls to the default bps and carries the unconfirmed state', () => {
    const rev = dealRevenue(deal({}), MODEL)
    expect(rev.modelLabel).toBe('default bps')
    expect(rev.amount).toBeCloseTo(500_000 * 0.011 * 0.85, 2)
    expect(rev.modelConfirmed).toBe(false)
  })

  it('lender-name substring match wins where present', () => {
    const named: CompModel = {
      ...MODEL,
      rows: [{ label: 'FN', match: { lenderName: 'first national' }, bps: 90, confirmed: true }],
    }
    const rev = dealRevenue(deal({ lenderName: 'First National - Prime' }), named)
    expect(rev.modelLabel).toBe('FN')
  })

  it('agent_split scales the model estimate (the future comp-engine hook)', () => {
    const half: CompModel = { ...MODEL, agentSplit: 0.5 }
    const full = dealRevenue(deal({}), MODEL).amount
    expect(dealRevenue(deal({}), half).amount).toBeCloseTo(full / 2, 6)
  })
})

describe('commission forecast', () => {
  const deals = [
    deal({ id: 'a', stage: 'Underwriting In Progress', closingDate: '2026-07-25', amount: 400_000 }),
    deal({ id: 'b', stage: 'Conditionally Approved', closingDate: '2026-09-15', amount: 600_000 }),
    deal({ id: 'c', stage: 'Pending', closingDate: '2022-05-01', amount: 300_000 }), // stale date
    deal({ id: 'd', stage: 'Options', closingDate: null, amount: 200_000 }), // undated
    deal({ id: 'e', stage: 'Funded', closingDate: '2026-07-02', amount: 900_000 }), // terminal, excluded
    deal({ id: 'f', stage: 'Additional Properties', closingDate: '2026-08-01', amount: 100_000 }), // summary, excluded
  ]

  it('groups by close month, stage-weights, and buckets past-dated and undated honestly', () => {
    const f = commissionForecast(deals, STAGE_WEIGHTS, MODEL, TODAY, isOpen)
    expect(f.openDealCount).toBe(4)
    const jul = f.months.find(m => m.month === '2026-07')!
    const sep = f.months.find(m => m.month === '2026-09')!
    // a: 400k default 110bps net 0.85 = 3,740 expected rev x 0.35 weight
    expect(jul.expectedRevenue).toBeCloseTo(400_000 * 0.011 * 0.85 * 0.35, 2)
    expect(sep.expectedRevenue).toBeCloseTo(600_000 * 0.011 * 0.85 * 0.75, 2)
    expect(f.pastDated.count).toBe(1)
    expect(f.undated.count).toBe(1)
    // Nothing from the stale-dated deal leaked into a rendered month.
    expect(f.months.every(m => m.month >= '2026-07')).toBe(true)
    const monthsTotal = f.months.reduce((s, m) => s + m.expectedRevenue, 0)
    expect(f.totalExpected).toBeCloseTo(
      monthsTotal + f.pastDated.expectedRevenue + f.undated.expectedRevenue,
      6,
    )
  })

  it('changing a bps value changes the forecast (acceptance 4)', () => {
    const before = commissionForecast(deals, STAGE_WEIGHTS, MODEL, TODAY, isOpen)
    const bumped: CompModel = { ...MODEL, defaultBps: { bps: 220, confirmed: true } }
    const after = commissionForecast(deals, STAGE_WEIGHTS, bumped, TODAY, isOpen)
    const julBefore = before.months.find(m => m.month === '2026-07')!.expectedRevenue
    const julAfter = after.months.find(m => m.month === '2026-07')!.expectedRevenue
    expect(julAfter).toBeCloseTo(julBefore * 2, 2)
  })

  it('a deal with a recorded commission forecasts from the actual, counted as actual-basis', () => {
    const withActual = [
      deal({ id: 'g', stage: 'Conditionally Approved', closingDate: '2026-08-10', totalCommission: 8_000 }),
    ]
    const f = commissionForecast(withActual, STAGE_WEIGHTS, MODEL, TODAY, isOpen)
    const aug = f.months.find(m => m.month === '2026-08')!
    expect(aug.expectedRevenue).toBeCloseTo(8_000 * 0.75, 2)
    expect(aug.actualBasisCount).toBe(1)
  })

  it('excludes stale deals entirely when an isStale predicate is supplied', () => {
    const withStale = [
      deal({ id: 'a', stage: 'Underwriting In Progress', closingDate: '2026-07-25', createdTime: '2026-05-01', amount: 400_000 }),
      deal({ id: 'c', stage: 'Pending', closingDate: '2022-05-01', createdTime: '2022-01-01', amount: 300_000 }), // lapsed
      deal({ id: 'z', stage: 'Options', closingDate: null, createdTime: '2022-01-01', amount: 200_000 }), // dormant
    ]
    const f = commissionForecast(
      withStale,
      STAGE_WEIGHTS,
      MODEL,
      TODAY,
      isOpen,
      d => isStaleOpenDeal(d, TODAY),
    )
    // Only the fresh, future-dated deal survives; the stale ones are not
    // counted in openDealCount nor bucketed as pastDated/undated.
    expect(f.openDealCount).toBe(1)
    expect(f.pastDated.count).toBe(0)
    expect(f.undated.count).toBe(0)
  })
})

describe('funded by year and the practice history series', () => {
  it('buckets funded volume by close year, both stage spellings, ascending', () => {
    const deals = [
      deal({ stage: 'Mortgage Funded', closingDate: '2021-04-09', amount: 600_000 }),
      deal({ stage: 'Mortgage Funded', closingDate: '2021-12-15', amount: 400_000 }),
      deal({ stage: 'Funded', closingDate: '2026-01-19', amount: 745_500 }),
      deal({ stage: 'Conditionally Approved', closingDate: '2026-02-01', amount: 999 }), // not funded
      deal({ stage: 'Mortgage Funded', closingDate: null, amount: 1 }), // no close date, skipped
    ]
    expect(fundedByYear(deals, isFundedStage)).toEqual([
      { year: 2021, volume: 1_000_000, count: 2 },
      { year: 2026, volume: 745_500, count: 1 },
    ])
  })

  it('fills the contiguous year range and flags the current year and the partial 2021', () => {
    const deals = [
      deal({ stage: 'Mortgage Funded', closingDate: '2021-05-01', amount: 500_000 }),
      deal({ stage: 'Mortgage Funded', closingDate: '2023-05-01', amount: 300_000 }), // gap at 2022
      deal({ stage: 'Funded', closingDate: '2026-05-01', amount: 200_000 }),
    ]
    const rows = practiceHistoryYears(deals, isFundedStage, 2026)
    expect(rows.map(r => r.year)).toEqual([2021, 2022, 2023, 2024, 2025, 2026])
    expect(rows.find(r => r.year === 2022)).toMatchObject({ volume: 0, count: 0 })
    expect(rows.find(r => r.year === 2026)!.isCurrent).toBe(true)
    expect(rows.find(r => r.year === 2021)!.partial).toBe(true)
    expect(rows.find(r => r.year === 2023)!.partial).toBe(false)
  })
})

describe('funded trend and mix', () => {
  const funded = [
    deal({ id: '1', stage: 'Funded', closingDate: '2026-06-18', amount: 635_000, rateType: 'Fixed' }),
    deal({ id: '2', stage: 'Funded', closingDate: '2026-05-25', amount: 300_000, rateType: 'Fixed', totalCommission: 3_000 }),
    deal({ id: '3', stage: 'Mortgage Funded', closingDate: '2025-08-19', amount: 910_000, rateType: 'Variable' }),
    deal({ id: '4', stage: 'Collecting Documentation', closingDate: '2026-06-01', amount: 1 }), // not funded
  ]

  it('buckets funded volume by month with the actual/model revenue split visible', () => {
    const trend = fundedTrend(funded, TODAY, MODEL, isFundedStage)
    expect(trend).toHaveLength(12)
    const jun = trend.find(m => m.month === '2026-06')!
    expect(jun.volume).toBe(635_000)
    expect(jun.revenueActual).toBe(0)
    expect(jun.revenueModeled).toBeGreaterThan(0)
    const may = trend.find(m => m.month === '2026-05')!
    expect(may.revenueActual).toBe(3_000)
    expect(may.revenueModeled).toBe(0)
    expect(may.actualCount).toBe(1)
  })

  it('mix renders only at real coverage and never counts empties as a slice', () => {
    const mix = mixBreakdown(funded.slice(0, 3), 'Rate type', d => d.rateType)
    expect(mix.coverage).toBe(1)
    expect(mix.renders).toBe(true)
    expect(mix.rows.map(r => r.key)).toEqual(['Fixed', 'Variable'])

    const sparse = mixBreakdown(
      [funded[0], deal({ id: '5', stage: 'Funded', lenderName: null }), deal({ id: '6', stage: 'Funded' })],
      'Lender',
      d => d.lenderName,
    )
    expect(sparse.coverage).toBeLessThan(MIN_MIX_COVERAGE)
    expect(sparse.renders).toBe(false)
  })
})

describe('pacing deep view', () => {
  it('walks months to the current one with cumulative funded vs straight-line target', () => {
    const deals = [
      deal({ id: '1', stage: 'Funded', closingDate: '2026-01-19', amount: 1_000_000 }),
      deal({ id: '2', stage: 'Funded', closingDate: '2026-03-06', amount: 700_000 }),
    ]
    const months = pacingByMonth(deals, 2026, 12_000_000, TODAY, isFundedStage)
    expect(months).toHaveLength(7) // Jan..Jul
    expect(months[0].funded).toBe(1_000_000)
    expect(months[2].cumulativeFunded).toBe(1_700_000)
    expect(months[2].cumulativeTarget).toBe(3_000_000)
    expect(months[6].cumulativeFunded).toBe(1_700_000)
  })

  it('files-to-close-gap estimates from the trailing average and never divides by zero', () => {
    const trailing = [
      deal({ id: '1', stage: 'Funded', amount: 400_000 }),
      deal({ id: '2', stage: 'Funded', amount: 600_000 }),
    ]
    expect(filesToCloseGap(2_000_000, trailing)).toBe(4)
    expect(filesToCloseGap(-5, trailing)).toBeNull()
    expect(filesToCloseGap(2_000_000, [])).toBeNull()
  })
})

describe('leads by source', () => {
  it('counts trailing-window leads by source with unsourced stated', () => {
    const { rows, total, unsourced } = leadsBySource(
      [
        { leadSource: 'Website - SMM Wizard', createdTime: '2026-06-01' },
        { leadSource: 'Website - SMM Wizard', createdTime: '2026-05-01' },
        { leadSource: 'Cold Call', createdTime: '2026-07-01' },
        { leadSource: null, createdTime: '2026-07-02' },
        { leadSource: 'Old', createdTime: '2024-01-01' }, // outside window
      ],
      TODAY,
    )
    expect(total).toBe(4)
    expect(unsourced).toBe(1)
    expect(rows[0]).toEqual({ source: 'Website - SMM Wizard', count: 2 })
  })
})

describe('P&L payload parsing', () => {
  it('parses the documented webhook contract', async () => {
    const { parsePnlPayload } = await import('@/lib/pnl')
    const months = parsePnlPayload({
      generated_at: '2026-07-10T12:00:00Z',
      months: [
        { month: '2026-06', classes: [{ name: 'Fox Mortgage', revenue: 12_000, expenses: 3_000, net: 9_000 }] },
      ],
    })
    expect(months).toHaveLength(1)
    expect(months![0].classes[0].net).toBe(9_000)
  })

  it('rejects malformed payloads whole rather than half-rendering', async () => {
    const { parsePnlPayload } = await import('@/lib/pnl')
    expect(parsePnlPayload(null)).toBeNull()
    expect(parsePnlPayload({ months: [] })).toBeNull()
    expect(parsePnlPayload({ months: [{ month: 'June', classes: [] }] })).toBeNull()
    expect(
      parsePnlPayload({ months: [{ month: '2026-06', classes: [{ name: 'X', revenue: 'lots' }] }] }),
    ).toBeNull()
  })
})

describe('the seeded comp model', () => {
  it('carries confirm-bps placeholders and the agent_split hook at 1.0', () => {
    expect(COMP_MODEL.version).toBe(COMP_MODEL_VERSION)
    expect(COMP_MODEL.agentSplit).toBe(1.0)
    expect(COMP_MODEL.defaultBps.confirmed).toBe(false)
    expect(COMP_MODEL.networkSplit.confirmed).toBe(false)
    expect(COMP_MODEL.rows.length).toBeGreaterThan(0)
    for (const row of COMP_MODEL.rows) {
      expect(row.bps).toBeGreaterThan(0)
      expect(typeof row.confirmed).toBe('boolean')
    }
  })
})
