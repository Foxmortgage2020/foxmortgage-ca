import { describe, expect, it } from 'vitest'
import { computePacing, weightedPipelineVolume, unmappedPipelineStages } from '../lib/pacing'
import { PIPELINE_STAGE_ORDER, STAGE_WEIGHTS } from '../config/pipeline'

describe('weightedPipelineVolume', () => {
  const weights = { 'Collecting Documentation': 0.2, 'Conditionally Approved': 0.75 }

  it('sums stage volume times weight', () => {
    const stages = [
      { stage: 'Collecting Documentation', volume: 1_000_000, count: 2 },
      { stage: 'Conditionally Approved', volume: 400_000, count: 1 },
    ]
    expect(weightedPipelineVolume(stages, weights)).toBeCloseTo(200_000 + 300_000, 6)
  })

  it('treats stages without a configured weight as zero', () => {
    const stages = [
      { stage: 'Some Future Stage', volume: 9_999_999, count: 3 },
      { stage: 'Conditionally Approved', volume: 100_000, count: 1 },
    ]
    expect(weightedPipelineVolume(stages, weights)).toBeCloseTo(75_000, 6)
  })

  it('returns zero for an empty pipeline', () => {
    expect(weightedPipelineVolume([], weights)).toBe(0)
  })
})

describe('unmappedPipelineStages (the loud flag for zero-weight buckets)', () => {
  const weights = { 'Collecting Documentation': 0.2 }

  it('finds exactly the stages the weight map does not know, with their volume', () => {
    const stages = [
      { stage: 'Collecting Documentation', volume: 1_000_000, count: 2 },
      { stage: 'Some Future Stage', volume: 359_000, count: 1 },
    ]
    expect(unmappedPipelineStages(stages, weights)).toEqual([
      { stage: 'Some Future Stage', volume: 359_000, count: 1 },
    ])
  })

  it('is empty when every stage is mapped', () => {
    expect(
      unmappedPipelineStages([{ stage: 'Collecting Documentation', volume: 1, count: 1 }], weights),
    ).toEqual([])
  })

  it('a configured zero weight is MAPPED (deliberate), not flagged', () => {
    expect(
      unmappedPipelineStages([{ stage: 'Parked', volume: 1, count: 1 }], { Parked: 0 }),
    ).toEqual([])
  })
})

describe('stage vocabulary contract (display space; live picklist 2026-07-14)', () => {
  it("every funnel-order stage carries a weight — 'Submitted' and 'Conditions Fulfilled' included", () => {
    for (const stage of PIPELINE_STAGE_ORDER) {
      expect(STAGE_WEIGHTS[stage], `missing weight for '${stage}'`).toBeTypeOf('number')
    }
    expect(STAGE_WEIGHTS['Submitted']).toBe(0.15)
    expect(STAGE_WEIGHTS['Conditions Fulfilled']).toBe(0.75)
  })

  it('weights are non-decreasing along the funnel order', () => {
    const ws = PIPELINE_STAGE_ORDER.map(s => STAGE_WEIGHTS[s])
    for (let i = 1; i < ws.length; i++) {
      expect(
        ws[i],
        `${PIPELINE_STAGE_ORDER[i]} should not weigh less than ${PIPELINE_STAGE_ORDER[i - 1]}`,
      ).toBeGreaterThanOrEqual(ws[i - 1])
    }
  })

  it('every sync-written open stage resolves in the vocabulary (reads return DISPLAY values)', () => {
    // The Finmo sync writes ACTUAL picklist values; Zoho reads hand the
    // portal these DISPLAY values. Each must sit in the funnel order with a
    // weight, or Aitken-class deals fall into a zero-weight bucket.
    const syncVisibleOpen = [
      'Application Started', // actual: Application Pending
      'Submitted',
      'Submitted to Lender',
      'Conditionally Approved', // actual: Application Sent To Lender
      'Approved',
      'Broker Complete', // actual: Ready To Close
    ]
    for (const stage of syncVisibleOpen) {
      expect(
        (PIPELINE_STAGE_ORDER as readonly string[]).includes(stage),
        `'${stage}' missing from funnel order`,
      ).toBe(true)
      expect(STAGE_WEIGHTS[stage], `missing weight for '${stage}'`).toBeTypeOf('number')
    }
  })
})

describe('computePacing', () => {
  const target = 12_000_000

  it('funded-only: pipeline of zero, mid-year date', () => {
    // 2026-07-02 is day 183 of a 365-day year.
    const r = computePacing({
      fundedYTD: 6_000_000,
      weightedPipeline: 0,
      annualTarget: target,
      asOf: new Date(Date.UTC(2026, 6, 2)),
    })
    expect(r.dayOfYear).toBe(183)
    expect(r.daysInYear).toBe(365)
    expect(r.straightLineTarget).toBeCloseTo((12_000_000 * 183) / 365, 4)
    expect(r.combined).toBe(6_000_000)
    expect(r.delta).toBeCloseTo(6_000_000 - (12_000_000 * 183) / 365, 4)
    expect(r.onPace).toBe(false)
  })

  it('pipeline-only: no funded volume, start of year', () => {
    const r = computePacing({
      fundedYTD: 0,
      weightedPipeline: 3_000_000,
      annualTarget: target,
      asOf: new Date(Date.UTC(2026, 0, 1)),
    })
    expect(r.dayOfYear).toBe(1)
    expect(r.straightLineTarget).toBeCloseTo(12_000_000 / 365, 4)
    expect(r.combined).toBe(3_000_000)
    expect(r.onPace).toBe(true)
  })

  it('mixed: funded plus weighted pipeline against the July 9 line', () => {
    // 2026-07-09 is day 190 of 365.
    const r = computePacing({
      fundedYTD: 3_280_925.94,
      weightedPipeline: 1_000_000,
      annualTarget: target,
      asOf: new Date(Date.UTC(2026, 6, 9)),
    })
    expect(r.dayOfYear).toBe(190)
    const straight = (12_000_000 * 190) / 365
    expect(r.straightLineTarget).toBeCloseTo(straight, 4)
    expect(r.combined).toBeCloseTo(4_280_925.94, 4)
    expect(r.delta).toBeCloseTo(4_280_925.94 - straight, 4)
    expect(r.onPace).toBe(false)
  })

  it('leap year: December 31 straight-line equals the full target', () => {
    const r = computePacing({
      fundedYTD: 0,
      weightedPipeline: 0,
      annualTarget: target,
      asOf: new Date(Date.UTC(2028, 11, 31)),
    })
    expect(r.daysInYear).toBe(366)
    expect(r.dayOfYear).toBe(366)
    expect(r.straightLineTarget).toBeCloseTo(target, 6)
  })
})
