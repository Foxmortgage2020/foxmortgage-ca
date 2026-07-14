// Goal pacing math — pure functions, no I/O, no timezone reads. Callers
// pass an asOf Date built from the practice-timezone calendar date at UTC
// midnight (lib/dates.ts torontoAsOfDate does exactly that); all date
// arithmetic here uses UTC fields only. Unit tests: tests/pacing.test.ts.

export interface StageVolume {
  stage: string
  volume: number
  count: number
}

// Expected funded volume from the open pipeline: sum of stage volume times
// stage weight. Stages with no configured weight contribute zero — a new
// picklist value is visible in the pipeline table but never silently
// inflates pacing. Zero-weighting must never be SILENT either: callers
// surface unmappedPipelineStages() beside every figure this feeds.
export function weightedPipelineVolume(
  stages: StageVolume[],
  weights: Record<string, number>,
): number {
  return stages.reduce((sum, s) => sum + s.volume * (weights[s.stage] ?? 0), 0)
}

// Active open stages carrying volume that STAGE_WEIGHTS does not know.
// These contribute zero to the weighted pipeline and the forecast, so the
// pages render them as a visible "unmapped stage" flag — a new picklist
// value (Zoho reads return DISPLAY values; keys must match that space) is
// loud until someone maps it in config/pipeline.ts, never a quiet bucket.
export function unmappedPipelineStages(
  stages: StageVolume[],
  weights: Record<string, number>,
): StageVolume[] {
  return stages.filter(s => !(s.stage in weights))
}

export interface PacingInput {
  fundedYTD: number
  weightedPipeline: number
  annualTarget: number
  asOf: Date
}

export interface PacingResult {
  fundedYTD: number
  weightedPipeline: number
  combined: number
  annualTarget: number
  // Where the year says you should be today: target x (day of year / days in year).
  straightLineTarget: number
  // combined minus straightLineTarget. Positive = ahead, in dollars.
  delta: number
  onPace: boolean
  dayOfYear: number
  daysInYear: number
  pctYearElapsed: number
}

function isLeapYear(y: number): boolean {
  return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)
}

export function computePacing({
  fundedYTD,
  weightedPipeline,
  annualTarget,
  asOf,
}: PacingInput): PacingResult {
  const y = asOf.getUTCFullYear()
  const dayOfYear =
    Math.floor(
      (Date.UTC(y, asOf.getUTCMonth(), asOf.getUTCDate()) - Date.UTC(y, 0, 1)) / 86_400_000,
    ) + 1
  const daysInYear = isLeapYear(y) ? 366 : 365
  const pctYearElapsed = dayOfYear / daysInYear
  const straightLineTarget = annualTarget * pctYearElapsed
  const combined = fundedYTD + weightedPipeline
  const delta = combined - straightLineTarget
  return {
    fundedYTD,
    weightedPipeline,
    combined,
    annualTarget,
    straightLineTarget,
    delta,
    onPace: delta >= 0,
    dayOfYear,
    daysInYear,
    pctYearElapsed,
  }
}
