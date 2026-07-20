// The year — funded YTD, weighted pipeline, combined, and pace against the
// straight line, one pacing bar, the renewal/monitoring leak line, and the
// stale-files groom line. Absorbs the old goal-pacing block and the stat
// tiles. Behind revenue.view (the leak line adds its own gates in the page).

import { Band, BandLink } from '@/components/admin/today/ui'
import { fmtMoney, fmtMoneyCompact } from '@/lib/dates'
import type { PacingResult } from '@/lib/pacing'
import type { StageVolume } from '@/lib/pacing'

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone?: 'good' | 'bad'
}) {
  return (
    <div>
      <p className="font-heading text-[10px] font-semibold tracking-[0.05em] text-muted uppercase">
        {label}
      </p>
      <p
        className={`font-heading text-xl font-bold tabular-nums ${
          tone === 'good' ? 'text-green-600' : tone === 'bad' ? 'text-red-600' : 'text-ink'
        }`}
      >
        {value}
      </p>
      {sub ? <p className="font-ui text-[11px] text-muted mt-0.5">{sub}</p> : null}
    </div>
  )
}

export interface YearLeak {
  lapsedVolume: number | null
  windowVolume: number | null
  actNowBenefit: number | null
  actNowCount: number | null
}

export default function TheYear({
  pacing,
  fundedCount,
  unmappedStages,
  leak,
  groom,
}: {
  pacing: PacingResult
  fundedCount: number
  unmappedStages: StageVolume[]
  leak: YearLeak | null
  groom: { count: number; volume: number } | null
}) {
  const leakParts: string[] = []
  if (leak) {
    if (leak.lapsedVolume !== null && leak.lapsedVolume > 0)
      leakParts.push(`${fmtMoneyCompact(leak.lapsedVolume)} lapsed`)
    if (leak.windowVolume !== null && leak.windowVolume > 0)
      leakParts.push(`${fmtMoneyCompact(leak.windowVolume)} in the action window`)
    if (leak.actNowBenefit !== null && leak.actNowBenefit > 0)
      leakParts.push(
        leak.actNowCount && leak.actNowCount > 0
          ? `${fmtMoneyCompact(leak.actNowBenefit)} to call across ${leak.actNowCount} ${
              leak.actNowCount === 1 ? 'file' : 'files'
            }`
          : `${fmtMoneyCompact(leak.actNowBenefit)} act-now benefit`,
      )
  }

  return (
    <Band title="The year" action={<BandLink href="/portal/admin/revenue">Revenue</BandLink>}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Tile label="Funded YTD" value={fmtMoneyCompact(pacing.fundedYTD)} sub={`${fundedCount} deals`} />
        <Tile label="Weighted pipeline" value={fmtMoneyCompact(pacing.weightedPipeline)} />
        <Tile label="Combined" value={fmtMoneyCompact(pacing.combined)} />
        <Tile
          label="Pace vs straight-line"
          value={(pacing.onPace ? '+' : '-') + fmtMoneyCompact(Math.abs(pacing.delta))}
          sub={pacing.onPace ? 'ahead' : 'behind'}
          tone={pacing.onPace ? 'good' : 'bad'}
        />
      </div>

      {unmappedStages.length > 0 ? (
        <p className="mt-3 rounded bg-amber-50 border border-amber-300 px-2.5 py-1.5 text-[11px] font-ui text-amber-900">
          <span className="font-semibold">
            Unmapped stage{unmappedStages.length > 1 ? 's' : ''}:
          </span>{' '}
          {unmappedStages.map(s => `${s.stage} (${fmtMoneyCompact(s.volume)})`).join(', ')} counted at
          zero weight until mapped in config/pipeline.ts.
        </p>
      ) : null}

      {/* Progress vs the straight-line marker */}
      <div className="mt-5">
        <div className="relative h-2.5 bg-cool-100 rounded-full overflow-hidden">
          <div
            className="absolute left-0 top-0 bottom-0 bg-ink-navy"
            style={{ width: `${Math.min(100, (pacing.combined / pacing.annualTarget) * 100)}%` }}
          />
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-ink-navy"
            style={{ left: `${Math.min(100, pacing.pctYearElapsed * 100)}%` }}
            title="Straight-line position for today"
          />
        </div>
        <div className="flex justify-between text-[11px] text-muted font-ui mt-1.5 tabular-nums">
          <span>
            Target {fmtMoneyCompact(pacing.annualTarget)} &middot; day {pacing.dayOfYear} of{' '}
            {pacing.daysInYear}
          </span>
          <span>Straight-line today: {fmtMoney(pacing.straightLineTarget)}</span>
        </div>
      </div>

      {leakParts.length > 0 ? (
        <p className="mt-4 font-ui text-[12.5px] text-muted">
          <span className="font-semibold text-ink">The leak:</span> {leakParts.join(' · ')}.{' '}
          <BandLink href="/portal/admin/beyond?tab=renewals">Beyond funding</BandLink>
        </p>
      ) : null}

      {groom && groom.count > 0 ? (
        <p className="mt-2 font-ui text-[12px] text-amber-800">
          {groom.count} stale file{groom.count === 1 ? '' : 's'} ({fmtMoneyCompact(groom.volume)})
          held out of pipeline.{' '}
          <BandLink href="/portal/admin/revenue">Groom on Revenue</BandLink>
        </p>
      ) : null}
    </Band>
  )
}
