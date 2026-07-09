import { describe, expect, it } from 'vitest'
import { computePacing, weightedPipelineVolume } from '../lib/pacing'

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
