// Revenue (Session 7): the money layer. Everything on this page computes
// from what the systems actually hold: funded actuals from Zoho, the
// commission actual (Total_Commission) where Michael recorded one, and
// the comp model (config/comp.ts) everywhere else, with every model
// figure visually labeled estimated. Conflating the two is a failed
// acceptance; the EstChip and its assumptions tooltip are that contract.

import Link from 'next/link'
import { requirePermission } from '@/lib/authz'
import { ANNUAL_FUNDED_TARGET } from '@/config/targets'
import { COMP_MODEL } from '@/config/comp'
import {
  isFundedStage,
  isSummaryStage,
  isTerminalStage,
  PIPELINE_STAGE_ORDER,
  STAGE_WEIGHTS,
} from '@/config/pipeline'
import { computePacing, weightedPipelineVolume, unmappedPipelineStages } from '@/lib/pacing'
import { isStaleOpenDeal } from '@/lib/pipeline-hygiene'
import { isDemoMode } from '@/lib/demo'
import {
  computePipeline,
  getAllDealsRevenue,
  getLeadsSlim,
  getRenewalDeals,
  pipelineStageVolumes,
  type SlimLead,
} from '@/lib/zoho-admin'
import { getAdminDashboardPayload, listAllPartners, classifyPartnerType } from '@/lib/zoho'
import { renewalBook } from '@/lib/renewals'
import {
  attributedFundedByType,
  commissionForecast,
  filesToCloseGap,
  fundedInWindow,
  fundedTrend,
  leadsBySource,
  mixBreakdown,
  monthLabel,
  practiceHistoryYears,
  practiceKpis,
  type RevenueDeal,
} from '@/lib/revenue'
import { getBusinessLinePnl } from '@/lib/pnl'
import { fmtMoney, fmtMoneyCompact, fmtShortDate, torontoAsOfDate, torontoTodayYMD } from '@/lib/dates'
import PracticeHistoryChart from '@/components/admin/PracticeHistoryChart'

export const dynamic = 'force-dynamic'

const isOpenStage = (stage: string) => !isTerminalStage(stage) && !isSummaryStage(stage)
const zohoDealUrl = (id: string) => `https://crm.zoho.com/crm/org906105026/tab/Potentials/${id}`
const STALE_REASON_LABEL: Record<'lapsed' | 'dormant', string> = {
  lapsed: 'close date lapsed 90+ days',
  dormant: 'open 180+ days, no movement',
}

// The single assumptions line every estimated figure points at.
function modelAssumptions(): string {
  const rows = COMP_MODEL.rows
    .map(r => `${r.label} ${r.bps} bps${r.confirmed ? '' : ' (confirm)'}`)
    .join(', ')
  return (
    `Estimated through comp model v${COMP_MODEL.version}: ${rows}, ` +
    `default ${COMP_MODEL.defaultBps.bps} bps${COMP_MODEL.defaultBps.confirmed ? '' : ' (confirm)'}, ` +
    `network split ${Math.round(COMP_MODEL.networkSplit.value * 100)}%${COMP_MODEL.networkSplit.confirmed ? '' : ' (confirm)'}. ` +
    'Recorded Total_Commission is used as the actual wherever it exists. ' +
    'Forecast months also weight by stage (config/pipeline.ts).'
  )
}

function EstChip({ text = 'estimated' }: { text?: string }) {
  return (
    <span
      data-estimate
      title={modelAssumptions()}
      className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 cursor-help align-middle"
    >
      {text}
    </span>
  )
}

function ActualChip() {
  return (
    <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-lime/20 text-navy border border-lime/50 align-middle">
      actual
    </span>
  )
}

function SectionCard({
  title,
  chip,
  children,
}: {
  title: string
  chip?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <h2 className="font-heading font-bold text-navy text-base">{title}</h2>
        {chip}
      </div>
      {children}
    </div>
  )
}

export default async function RevenuePage() {
  await requirePermission('revenue.view')

  const todayYMD = torontoTodayYMD()
  const year = Number(todayYMD.slice(0, 4))

  let deals: RevenueDeal[] | null = null
  let leads: SlimLead[] | null = null
  try {
    deals = await getAllDealsRevenue()
  } catch {
    deals = null
  }
  try {
    leads = await getLeadsSlim()
  } catch {
    leads = null
  }
  const pnl = await getBusinessLinePnl()

  // Practice KPIs, partner tiles, recent referrals, and the renewal book.
  // getAdminDashboardPayload is reused for partner counts + recent referrals
  // (no staleness concern); the funded KPIs are computed from the corrected
  // year series, not its deal metrics; the renewal book is fresh from Zoho.
  // getAdminDashboardPayload / listAllPartners are NOT demo-guarded, so they
  // are skipped in demo mode; getRenewalDeals returns fictional fixtures.
  const demo = isDemoMode()
  const [dashboard, partners, renewals] = await Promise.all([
    demo ? Promise.resolve(null) : getAdminDashboardPayload().catch(() => null),
    demo ? Promise.resolve(null) : listAllPartners().catch(() => null),
    getRenewalDeals().catch(() => null),
  ])

  if (!deals) {
    return (
      <div>
        <Header />
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500 font-body">
            The Zoho read failed, so nothing on this page can compute right now. Reload in a
            moment; nothing here caches a stale number.
          </p>
        </div>
      </div>
    )
  }

  // ── Shared computations ────────────────────────────────────────────────────
  const fundedT12 = fundedInWindow(deals, todayYMD, isFundedStage)
  const trend = fundedTrend(deals, todayYMD, COMP_MODEL, isFundedStage)
  const forecast = commissionForecast(
    deals,
    STAGE_WEIGHTS,
    COMP_MODEL,
    todayYMD,
    isOpenStage,
    d => isStaleOpenDeal(d, todayYMD),
  )
  const pipeline = computePipeline(deals, todayYMD)
  const fundedYTD = deals.reduce(
    (acc, d) => {
      if (!isFundedStage(d.stage) || !d.closingDate?.startsWith(`${year}-`)) return acc
      return { volume: acc.volume + d.amount, count: acc.count + 1 }
    },
    { volume: 0, count: 0 },
  )
  const weighted = weightedPipelineVolume(pipelineStageVolumes(pipeline), STAGE_WEIGHTS)
  // Active open stages the weight map does not know. These count at zero in
  // the weighted pipeline and the forecast, so they render as a loud flag
  // beside both figures, never a silent bucket.
  const unmappedStages = unmappedPipelineStages(pipelineStageVolumes(pipeline), STAGE_WEIGHTS)
  const pacing = computePacing({
    fundedYTD: fundedYTD.volume,
    weightedPipeline: weighted,
    annualTarget: ANNUAL_FUNDED_TARGET,
    asOf: torontoAsOfDate(),
  })
  const gapFiles = filesToCloseGap(-pacing.delta, fundedT12)

  // Practice history: funded volume by year, 2021 to present.
  const years = practiceHistoryYears(deals, isFundedStage, year)
  const kpis = practiceKpis(years)
  const partnerTypeById = new Map((partners ?? []).map(p => [p.id, classifyPartnerType(p.partnerType)]))
  const attributed = attributedFundedByType(deals, partnerTypeById, isFundedStage)
  const attributedByKey = new Map(attributed.rows.map(r => [r.type, r]))
  const book = renewals ? renewalBook(renewals.withMaturity, todayYMD) : null
  const byType = dashboard?.partners.byType ?? null
  const recentReferrals = dashboard?.deals?.recentReferrals ?? []

  const mixes = [
    mixBreakdown(fundedT12, 'Purpose', d => d.transactionType),
    mixBreakdown(fundedT12, 'Rate type', d => d.rateType),
    // Term_Years holds mixed units live (some files store months in it),
    // so the value renders exactly as stored with no unit suffix.
    mixBreakdown(fundedT12, 'Term (Term_Years as stored)', d =>
      d.termYears != null ? String(d.termYears) : null,
    ),
    mixBreakdown(fundedT12, 'Mortgage type', d => d.mortgageType),
  ]
  const lenderMix = mixBreakdown(fundedT12, 'Lender', d => d.lenderName)

  const leadStats = leads ? leadsBySource(leads, todayYMD) : null

  return (
    <div className="space-y-5">
      <Header />

      {/* ── Practice history ── */}
      <SectionCard
        title="Practice history"
        chip={
          <Link
            href="/portal/admin/revenue/export"
            className="text-xs font-semibold text-navy hover:text-lime border border-navy/20 rounded-lg px-2.5 py-1"
          >
            Download slide &rarr;
          </Link>
        }
      >
        <p className="text-xs text-gray-500 font-body mb-3">
          Funded volume by year, both funded stage names, with deal counts. The current year is
          split: funded to date solid, the weighted pipeline stacked above it as a hatched
          projection so a forecast is never read as an actual. The three 2026 milestones sit at the
          right edge; the funded bars cannot have responded to them yet, and the chart does not
          pretend otherwise.
        </p>
        {years.length > 0 ? (
          <PracticeHistoryChart
            years={years}
            weightedPipeline={weighted}
            activeFiles={pipeline.openCount}
            asOfLabel={`as of ${fmtShortDate(todayYMD)}, ${year}`}
          />
        ) : (
          <p className="text-sm text-gray-400 font-body">No funded history to chart.</p>
        )}
      </SectionCard>

      {/* ── Practice at a glance (all-time, corrected) ── */}
      <SectionCard title="Practice at a glance">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Stat label="Funded, all time" value={fmtMoney(kpis.totalVolume)} sub={`${kpis.totalCount} deals`} />
          <Stat label="Average deal" value={fmtMoney(kpis.avgDealSize)} />
          <Stat
            label="Best year"
            value={kpis.bestYear ? fmtMoneyCompact(kpis.bestYear.volume) : 'n/a'}
            sub={kpis.bestYear ? String(kpis.bestYear.year) : ''}
          />
          <Stat
            label="Years active"
            value={String(kpis.yearsActive)}
            sub={kpis.firstYear ? `since ${kpis.firstYear}` : ''}
          />
          <Stat
            label="Renewal book"
            value={book ? fmtMoneyCompact(book.underManagement.volume) : 'n/a'}
            sub={book ? `${book.underManagement.count} under management` : 'unavailable'}
          />
        </div>
        <p className="text-[11px] text-gray-400 font-body mt-2">
          Funded totals cover both funded stage names, corrected for property records and ghost
          deals. 2021 may be partial: the earliest funded record is April 2021.
        </p>
      </SectionCard>

      {/* ── Renewal book (the number the practice has never seen) ── */}
      <SectionCard
        title="Renewal book"
        chip={
          <Link href="/portal/admin/renewals" className="text-xs font-semibold text-navy hover:text-lime border border-navy/20 rounded-lg px-2.5 py-1">
            Renewals &rarr;
          </Link>
        }
      >
        {book ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Stat label="Under management" value={fmtMoney(book.underManagement.volume)} sub={`${book.underManagement.count} funded files not yet matured`} />
            <Stat label="Maturing next 12 months" value={fmtMoney(book.maturingNext12.volume)} sub={`${book.maturingNext12.count} files`} />
            <Stat label="Lapsed" value={fmtMoney(book.lapsed.volume)} sub={`${book.lapsed.count} files, no recorded outcome`} tone={book.lapsed.count > 0 ? 'bad' : undefined} />
          </div>
        ) : (
          <p className="text-sm text-gray-400 font-body">The renewal read is unavailable right now.</p>
        )}
      </SectionCard>

      {/* ── Referral partners ── */}
      <SectionCard title="Referral partners">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {([
            ['realtor', 'Realtors'],
            ['financialPlanner', 'Financial planners'],
            ['lawyer', 'Lawyers'],
            ['mortgageAgent', 'Mortgage agents'],
            ['investor', 'Investors'],
          ] as const).map(([key, label]) => {
            const count = byType ? byType[key] : null
            const vol = attributedByKey.get(key)?.volume ?? 0
            return (
              <Stat
                key={key}
                label={label}
                value={count != null ? String(count) : 'n/a'}
                sub={vol > 0 ? `${fmtMoneyCompact(vol)} funded` : 'no funded attributed'}
              />
            )
          })}
        </div>
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 font-body mt-3">
          Attribution rides the Referral_Partner field on the deal, recorded on{' '}
          {attributed.totalCount} of {kpis.totalCount} funded files ({kpis.totalCount > 0 ? Math.round((attributed.totalCount / kpis.totalCount) * 100) : 0}%),
          so attributed volume is a floor, not the whole picture. Counts are partner records by type.
        </p>

        <div className="mt-4">
          <p className="text-xs font-semibold text-navy mb-1.5">Recent referrals</p>
          {recentReferrals.length === 0 ? (
            <p className="text-xs text-gray-400 font-body">No attributed referrals to show.</p>
          ) : (
            <div className="space-y-1">
              {recentReferrals.slice(0, 6).map(r => (
                <div key={r.dealId} className="flex items-center justify-between gap-3 text-xs font-body border-t border-gray-100 py-1">
                  <span className="text-navy truncate">{r.borrower}</span>
                  <span className="flex items-center gap-2 shrink-0 text-gray-500">
                    <span>{r.partner ?? 'unattributed'}</span>
                    <span className="text-gray-400">{r.stage}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── Goal pacing, deep view ── */}
      <SectionCard title={`Goal pacing ${year}`}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Stat label="Funded YTD" value={fmtMoneyCompact(fundedYTD.volume)} sub={`${fundedYTD.count} files`} />
          <Stat
            label="Weighted pipeline"
            value={fmtMoneyCompact(pacing.weightedPipeline)}
            sub={<EstChip text="estimated volume" />}
          />
          <Stat
            label="Pace vs target"
            value={`${pacing.delta >= 0 ? '+' : ''}${fmtMoneyCompact(pacing.delta)}`}
            sub={`target to date ${fmtMoneyCompact(pacing.straightLineTarget)}`}
            tone={pacing.onPace ? 'good' : 'bad'}
          />
          <Stat
            label="Gap in files"
            value={gapFiles === null ? (pacing.delta >= 0 ? 'on pace' : 'n/a') : `~${gapFiles}`}
            sub={
              gapFiles === null && pacing.delta < 0 ? (
                'no trailing fundings to size a file'
              ) : gapFiles !== null ? (
                <span>
                  at the trailing average file <EstChip />
                </span>
              ) : (
                `${Math.round(pacing.pctYearElapsed * 100)}% of the year elapsed`
              )
            }
          />
        </div>

        {unmappedStages.length > 0 && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
            <p className="text-xs font-semibold text-amber-900">
              Unmapped stage{unmappedStages.length > 1 ? 's' : ''} in the active pipeline
            </p>
            <p className="text-xs text-amber-800 font-body mt-0.5">
              {unmappedStages
                .map(s => `${s.stage} (${s.count} file${s.count === 1 ? '' : 's'}, ${fmtMoneyCompact(s.volume)})`)
                .join(', ')}{' '}
              carry no stage weight, so they count at zero in the weighted pipeline and the
              forecast until the stage is mapped in config/pipeline.ts.
            </p>
          </div>
        )}

        <MonthBars
          rows={trend.map(m => ({
            month: m.month,
            value: m.volume,
            sub: m.count > 0 ? `${m.count}` : '',
          }))}
          valueLabel="Funded volume by month, trailing 12"
          format={fmtMoneyCompact}
        />
        <p className="text-[11px] text-gray-400 font-body mt-2">
          Target {fmtMoney(ANNUAL_FUNDED_TARGET)} for the year, {fmtMoneyCompact(ANNUAL_FUNDED_TARGET / 12)} a
          month straight-line. Funded volume is the recorded deal amount on funded stages; the
          weighted pipeline multiplies open-stage volume by the stage weights in
          config/pipeline.ts, over the active pipeline only. Stale files are held out (below), so
          the pace reflects real live deals rather than un-groomed debt.
        </p>
      </SectionCard>

      {/* ── Active pipeline and the stale bucket ── */}
      <SectionCard title="Active pipeline and the stale bucket">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
          <Stat
            label="Active pipeline"
            value={fmtMoney(pipeline.openVolume)}
            sub={`${pipeline.openCount} live file${pipeline.openCount === 1 ? '' : 's'}`}
          />
          <Stat
            label="Held out as stale"
            value={fmtMoney(pipeline.staleVolume)}
            sub={`${pipeline.staleCount} file${pipeline.staleCount === 1 ? '' : 's'}`}
            tone={pipeline.staleCount > 0 ? 'warn' : undefined}
          />
          <Stat
            label="Additional Properties"
            value={String(pipeline.summary.reduce((s, x) => s + x.count, 0))}
            sub="tracked records, never pipeline"
          />
        </div>
        <p className="text-xs text-gray-500 font-body mb-3">
          A deal is held out of active pipeline when its close date is more than 90 days past, or it
          was created more than 180 days ago and has not moved. Activity timestamps here are
          Finmo-synced to one shared value, so deal age stands in for a real last-activity signal.
          Nothing is deleted; groom these in Zoho and they leave the bucket on the next read.
        </p>
        {pipeline.stale.length > 0 ? (
          <div className="overflow-x-auto">
            <div className="min-w-[520px] space-y-1">
              {pipeline.stale.map(d => (
                <div
                  key={d.id}
                  className="flex items-center gap-2 text-xs font-body border-t border-gray-100 py-1.5"
                >
                  <a
                    href={zohoDealUrl(d.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 truncate text-navy hover:text-lime"
                  >
                    {d.dealName}
                  </a>
                  <span className="w-40 text-gray-400 truncate hidden sm:block">{d.stage}</span>
                  <span className="w-24 text-right text-gray-500">
                    {d.closingDate ? fmtShortDate(d.closingDate) : 'no close date'}
                  </span>
                  <span className="w-44 text-right text-amber-700">
                    {STALE_REASON_LABEL[d.staleReason]}
                  </span>
                  <span className="w-14 text-right text-gray-500">{fmtMoneyCompact(d.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400 font-body">
            No stale files. Every open deal is real active pipeline.
          </p>
        )}
      </SectionCard>

      {/* ── Commission pipeline forecast ── */}
      <SectionCard title="Commission forecast" chip={<EstChip />}>
        <p className="text-xs text-gray-500 font-body mb-3">
          Expected commission by close month: open deals at their Closing_Date, stage-weighted,
          priced from the recorded commission where one exists ({forecast.months.reduce((s, m) => s + m.actualBasisCount, 0)} of{' '}
          {forecast.months.reduce((s, m) => s + m.dealCount, 0)} dated open files carry one) and the comp
          model everywhere else. The navy bars are the last three months of funded commission for
          scale; the amber bars are the forecast. Hover any estimated chip for the assumptions.
        </p>
        <MonthBars
          rows={[
            ...trend.slice(-3).map(m => ({
              month: m.month,
              value: m.revenueActual + m.revenueModeled,
              sub: 'funded',
              cls: 'bg-navy/70',
            })),
            ...forecast.months.map(m => ({
              month: m.month,
              value: m.expectedRevenue,
              sub: m.dealCount > 0 ? `${m.dealCount}` : '',
              cls: 'bg-amber-300',
            })),
          ]}
          valueLabel="Funded commission (navy), then expected commission by close month (amber, estimated)"
          format={fmtMoneyCompact}
        />
        <div className="mt-3 grid sm:grid-cols-3 gap-3">
          <Stat
            label="Total expected"
            value={fmtMoneyCompact(forecast.totalExpected)}
            sub={<span>{forecast.openDealCount} open files, all buckets <EstChip /></span>}
          />
          <Stat
            label="Past-dated files"
            value={String(forecast.pastDated.count)}
            sub={`${fmtMoneyCompact(forecast.pastDated.expectedRevenue)} expected sits on stale close dates`}
            tone={forecast.pastDated.count > 0 ? 'warn' : undefined}
          />
          <Stat
            label="Undated files"
            value={String(forecast.undated.count)}
            sub={`${fmtMoneyCompact(forecast.undated.expectedRevenue)} expected has no close date`}
            tone={forecast.undated.count > 0 ? 'warn' : undefined}
          />
        </div>
        {(forecast.pastDated.count > 0 || forecast.undated.count > 0) && (
          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 font-body mt-3">
            Data hygiene finds {forecast.pastDated.count + forecast.undated.count} open files whose
            close dates are stale or missing; their expected commission stays out of the monthly
            bars rather than smearing into a month it does not belong to. Fixing the dates in Zoho
            moves them into the strip.
          </p>
        )}
      </SectionCard>

      {/* ── Funded revenue trend and mix ── */}
      <SectionCard title="Funded revenue, trailing 12">
        <MonthBars
          rows={trend.map(m => ({
            month: m.month,
            value: m.revenueActual + m.revenueModeled,
            sub: m.actualCount > 0 ? 'A' : '',
          }))}
          valueLabel="Commission by funded month"
          format={fmtMoneyCompact}
          barClass="bg-navy/70"
        />
        <p className="text-[11px] text-gray-400 font-body mt-2">
          <ActualChip /> where the file carries a recorded Total_Commission (
          {trend.reduce((s, m) => s + m.actualCount, 0)} of {fundedT12.length} funded files this
          window), <EstChip /> for the rest. A month mixing both shows the sum; the A marks months
          holding at least one actual.
        </p>

        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          {mixes.map(mix =>
            mix.renders ? (
              <div key={mix.label}>
                <p className="text-xs font-semibold text-navy mb-1.5">
                  {mix.label}
                  <span className="text-gray-400 font-normal">
                    {' '}
                    · {mix.coveredCount} of {mix.totalCount} funded files carry it
                  </span>
                </p>
                <div className="space-y-1">
                  {mix.rows.map(r => (
                    <div key={r.key} className="flex items-center gap-2">
                      <div className="w-28 text-xs font-body text-gray-600 truncate">{r.key}</div>
                      <div className="flex-1 bg-gray-100 rounded h-3">
                        <div
                          className="bg-lime h-3 rounded"
                          style={{ width: `${(r.count / Math.max(1, mix.coveredCount)) * 100}%` }}
                        />
                      </div>
                      <div className="text-xs font-body text-gray-500 w-8 text-right">{r.count}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div key={mix.label}>
                <p className="text-xs font-semibold text-navy mb-1.5">{mix.label}</p>
                <p className="text-xs text-gray-400 font-body">
                  Recorded on only {mix.coveredCount} of {mix.totalCount} funded files, under the
                  70% bar for an honest split. It renders once coverage improves in Zoho.
                </p>
              </div>
            ),
          )}
        </div>
        <p className="text-[11px] text-gray-400 font-body mt-3">
          Lender mix stays off for the same reason: Lender_Name is recorded on{' '}
          {lenderMix.coveredCount} of {lenderMix.totalCount} funded files this window. No
          insured-class field exists on the Zoho deal, so an insured split cannot render at all.
        </p>
      </SectionCard>

      {/* ── Conversion funnel ── */}
      <SectionCard title="Conversion funnel">
        <div className="space-y-1.5 mb-3">
          {[...pipeline.ordered, ...pipeline.other].map(row => {
            const weight = STAGE_WEIGHTS[row.stage]
            const maxVol = Math.max(1, ...[...pipeline.ordered, ...pipeline.other].map(r => r.volume))
            return (
              <div key={row.stage} className="flex items-center gap-2">
                <div className="w-44 text-xs font-body text-gray-700 truncate">{row.stage}</div>
                <div className="flex-1 bg-gray-100 rounded h-4">
                  <div className="bg-navy/70 h-4 rounded" style={{ width: `${(row.volume / maxVol) * 100}%` }} />
                </div>
                <div className="text-xs font-body text-gray-600 w-24 text-right">
                  {row.count} · {fmtMoneyCompact(row.volume)}
                </div>
                <div className="text-[11px] font-body w-16 text-right">
                  {weight != null ? (
                    <span className="text-gray-400">{`w ${weight}`}</span>
                  ) : (
                    <span
                      className="inline-block rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900"
                      title="This stage has no weight in config/pipeline.ts, so it counts at zero in the weighted pipeline and the forecast."
                    >
                      unmapped
                    </span>
                  )}
                </div>
              </div>
            )
          })}
          <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
            <div className="w-44 text-xs font-body font-semibold text-navy">Funded, trailing 12</div>
            <div className="flex-1" />
            <div className="text-xs font-body font-semibold text-navy w-40 text-right">
              {fundedT12.length} files · {fmtMoneyCompact(fundedT12.reduce((s, d) => s + d.amount, 0))}
            </div>
          </div>
        </div>
        <p className="text-[11px] text-gray-400 font-body">
          Method, honestly: this is a current-state stage census plus trailing funded counts, not
          a cohort analysis. Zoho stage history is not bulk-queryable through the records API this
          portal uses, so entered-stage-X-in-month-Y cannot compute today.
        </p>

        <div className="mt-4">
          <p className="text-xs font-semibold text-navy mb-1.5">Leads by source, trailing 12</p>
          {leadStats ? (
            <div className="space-y-1">
              {leadStats.rows.map(r => (
                <div key={r.source} className="flex items-center gap-2">
                  <div className="w-44 text-xs font-body text-gray-600 truncate">{r.source}</div>
                  <div className="flex-1 bg-gray-100 rounded h-3">
                    <div
                      className="bg-lime h-3 rounded"
                      style={{ width: `${(r.count / Math.max(1, leadStats.rows[0]?.count ?? 1)) * 100}%` }}
                    />
                  </div>
                  <div className="text-xs font-body text-gray-500 w-8 text-right">{r.count}</div>
                </div>
              ))}
              <p className="text-[11px] text-gray-400 font-body pt-1">
                {leadStats.total} leads in the window
                {leadStats.unsourced > 0 ? `, ${leadStats.unsourced} without a source` : ''}. Source
                lives on the Leads module only; the deal record carries no Lead_Source field, so
                source never follows a file into the funnel above.
              </p>
            </div>
          ) : (
            <p className="text-xs text-gray-400 font-body">The Zoho leads read failed; reload for the source split.</p>
          )}
        </div>
      </SectionCard>

      {/* ── Business-line P&L tile ── */}
      <SectionCard title="Business-line P&L, trailing 3 months">
        {pnl.state === 'ok' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-body">
              <thead>
                <tr className="text-left text-gray-400">
                  <th className="py-1 pr-3 font-semibold">Class</th>
                  {pnl.months.map(m => (
                    <th key={m.month} className="py-1 pr-3 font-semibold text-right" colSpan={3}>
                      {monthLabel(m.month)}
                    </th>
                  ))}
                </tr>
                <tr className="text-left text-gray-400">
                  <th className="py-1 pr-3" />
                  {pnl.months.map(m => (
                    <FragmentHeads key={m.month} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from(new Set(pnl.months.flatMap(m => m.classes.map(c => c.name)))).map(name => (
                  <tr key={name} className="border-t border-gray-100">
                    <td className="py-1 pr-3 text-gray-700">{name}</td>
                    {pnl.months.map(m => {
                      const c = m.classes.find(x => x.name === name)
                      return (
                        <FragmentCells key={m.month} revenue={c?.revenue ?? 0} expenses={c?.expenses ?? 0} net={c?.net ?? 0} />
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-gray-400 font-body mt-2">
              Read-only from QBO classes through the n8n webhook
              {pnl.generatedAt ? `, generated ${pnl.generatedAt.slice(0, 10)}` : ''}. The portal
              never writes to the books.
            </p>
          </div>
        ) : pnl.state === 'error' ? (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 font-body">
            {pnl.message} The tile renders nothing rather than a stale or partial P&L.
          </p>
        ) : (
          <div>
            <p className="text-sm text-gray-600 font-body mb-2">
              The books live in QuickBooks Online under the class structure the bookkeeping
              pipeline maintains (Fox Mortgage, Printhub, Fox Social, Left Bench, Overhead), but no
              server-side QBO read path exists for this portal yet. To light this tile:
            </p>
            <ul className="text-xs text-gray-500 font-body list-disc pl-5 space-y-1">
              {pnl.requirements.map(r => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}
      </SectionCard>

      {/* ── The comp model, for Michael to confirm ── */}
      <SectionCard title={`Comp model v${COMP_MODEL.version}`}>
        <p className="text-xs text-gray-500 font-body mb-3">
          The only estimate source on this page. Edit config/comp.ts to tune it; every unconfirmed
          value carries a confirm chip, the compliance-dates pattern.
        </p>
        <div className="space-y-1.5">
          {COMP_MODEL.rows.map(row => (
            <CompRowLine
              key={row.label}
              label={row.label}
              value={`${row.bps} bps`}
              confirmed={row.confirmed}
              note={row.note}
            />
          ))}
          <CompRowLine
            label="Default (no lender match)"
            value={`${COMP_MODEL.defaultBps.bps} bps`}
            confirmed={COMP_MODEL.defaultBps.confirmed}
            note="Applies to most files: lender is recorded on a minority of funded deals today."
          />
          <CompRowLine
            label="Network split"
            value={`${Math.round(COMP_MODEL.networkSplit.value * 100)}%`}
            confirmed={COMP_MODEL.networkSplit.confirmed}
            note="Share of gross commission to the brokerage network. Observed 15% on 2026 files, 25% on some 2025."
          />
          <CompRowLine
            label="Agent split"
            value={`${Math.round(COMP_MODEL.agentSplit * 100)}%`}
            confirmed
            note="The future comp-engine hook: per-agent shares become config rows when the practice grows."
          />
        </div>
      </SectionCard>
    </div>
  )
}

function Header() {
  return (
    <div>
      <h1 className="font-heading text-navy text-2xl font-bold">Revenue</h1>
      <p className="text-gray-500 font-body text-sm mt-1">
        The money layer: forecast, funded trends, funnel, and the business-line P&L. Actuals are
        actuals; everything modeled says so.
      </p>
    </div>
  )
}

function FragmentHeads() {
  return (
    <>
      <th className="py-1 pr-2 text-right font-normal">rev</th>
      <th className="py-1 pr-2 text-right font-normal">exp</th>
      <th className="py-1 pr-3 text-right font-normal">net</th>
    </>
  )
}

function FragmentCells({ revenue, expenses, net }: { revenue: number; expenses: number; net: number }) {
  return (
    <>
      <td className="py-1 pr-2 text-right text-gray-600">{fmtMoneyCompact(revenue)}</td>
      <td className="py-1 pr-2 text-right text-gray-600">{fmtMoneyCompact(expenses)}</td>
      <td className={`py-1 pr-3 text-right font-semibold ${net < 0 ? 'text-red-600' : 'text-navy'}`}>
        {fmtMoneyCompact(net)}
      </td>
    </>
  )
}

function CompRowLine({
  label,
  value,
  confirmed,
  note,
}: {
  label: string
  value: string
  confirmed: boolean
  note?: string
}) {
  return (
    <div className="flex items-baseline gap-2 flex-wrap">
      <span className="text-xs font-body text-gray-700 w-56">{label}</span>
      <span className="text-xs font-body font-semibold text-navy">{value}</span>
      {!confirmed && (
        <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
          confirm bps
        </span>
      )}
      {note && <span className="text-[11px] font-body text-gray-400">{note}</span>}
    </div>
  )
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: React.ReactNode
  tone?: 'good' | 'bad' | 'warn'
}) {
  return (
    <div className="border border-gray-100 rounded-lg px-3 py-2 bg-gray-50/50">
      <p className="text-[11px] font-body text-gray-400 uppercase tracking-wide">{label}</p>
      <p
        className={`font-heading font-bold text-lg ${
          tone === 'good' ? 'text-green-700' : tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-700' : 'text-navy'
        }`}
      >
        {value}
      </p>
      {sub != null && <p className="text-[11px] font-body text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

// Server-rendered monthly bar strip. Heights are proportional to the max
// value in the strip; zero months render a hairline so the axis stays
// legible on mobile.
function MonthBars({
  rows,
  valueLabel,
  format,
  barClass = 'bg-lime',
}: {
  rows: { month: string; value: number; sub?: string; cls?: string }[]
  valueLabel: string
  format: (n: number) => string
  barClass?: string
}) {
  const max = Math.max(1, ...rows.map(r => r.value))
  return (
    <div>
      <p className="text-[11px] font-body text-gray-400 mb-1">{valueLabel}</p>
      <div className="flex items-end gap-1 h-28 overflow-x-auto" data-testid="month-bars">
        {rows.map((r, i) => (
          <div
            key={`${r.month}-${i}`}
            className="flex-1 min-w-[34px] flex flex-col items-center justify-end h-full"
            title={`${monthLabel(r.month)}: ${format(r.value)}${r.sub ? ` (${r.sub})` : ''}`}
          >
            <span className="text-[10px] font-body text-gray-500 leading-none mb-0.5">
              {r.value > 0 ? format(r.value) : ''}
            </span>
            <div
              className={`w-full rounded-t ${r.value > 0 ? (r.cls ?? barClass) : 'bg-gray-200'}`}
              style={{ height: `${Math.max(2, (r.value / max) * 80)}%` }}
            />
            <span className="text-[10px] font-body text-gray-400 mt-1 leading-none">
              {monthLabel(r.month).replace(/ \d{4}$/, '')}
              {r.sub ? ` · ${r.sub}` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
