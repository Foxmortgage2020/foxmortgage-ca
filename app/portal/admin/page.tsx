// Today — the morning operating page (Today v1). It answers three questions in
// order: what needs me (the Waiting-on-you region), what is moving (the
// lifecycle table), what is at risk (the exceptions block + closings + the
// leak). Every story is told once. Server component; every data pull degrades
// independently to an honest unavailable state.
//
// Counts reconcile with their owning pages by construction (the Desk pattern):
// this page re-derives nothing a loader already computes, it only reshapes.
// The band model lives in lib/today.ts (pure, tested); the bands render in
// components/admin/today/*. The three decision cards stay inline here because
// the decision (lime) token is enumerated to this file for that role only.

import Link from 'next/link'
import { can, requirePermission } from '@/lib/authz'
import {
  ANNUAL_FUNDED_TARGET,
  CLOSINGS_BLOCK_DAYS,
  CONDITIONS_DUE_SOON_DAYS,
  INTAKE_STALE_HOURS,
  WORKBENCH_AGENT_EMAIL,
} from '@/config/targets'
import { STAGE_WEIGHTS } from '@/config/pipeline'
import { computePacing, weightedPipelineVolume, unmappedPipelineStages } from '@/lib/pacing'
import {
  computeClosings,
  computeFundedYTD,
  computePipeline,
  getAllDealsSlim,
  getRenewalDeals,
  getTasksDue,
  pipelineStageVolumes,
  type OpenTask,
  type SlimDeal,
} from '@/lib/zoho-admin'
import { appearsRenewedPending, bucketRenewals } from '@/lib/renewals'
import {
  getAgentIdByEmail,
  getConditionsDue,
  getDealsSummary,
  getIntakeFreshness,
  getOpenConditionCounts,
  getOpenFlags,
  getRateQuotesFull,
  getRenewalSequenceStates,
  type UwResult,
} from '@/lib/underwriting'
import { getApprovalsData } from '@/lib/approvals-data'
import { recentUploads, rawRowsForUpload, smmStoreConfigured } from '@/lib/smm-store'
import { recentRenewalEvents } from '@/lib/renewals-store'
import { collapseCoBorrowers, parseSmmRow, type SmmMortgage } from '@/lib/smm'
import { analyzeMortgage, bookQuoteFromRow } from '@/lib/smm-analysis'
import { indexMortgagesByName, type BookQuote } from '@/lib/smm-match'
import { deskFragments, type DeskCounts } from '@/lib/desk'
import { groupByPhase } from '@/config/lifecycle'
import {
  buildClosingRows,
  buildExceptions,
  prioritizeTasks,
  renewalNurtureBuckets,
} from '@/lib/today'
import DeskStrip from '@/components/admin/DeskStrip'
import YourDay from '@/components/admin/today/YourDay'
import { getTodayCalendar } from '@/lib/ms-calendar'
import Exceptions from '@/components/admin/today/Exceptions'
import RenewalNurture from '@/components/admin/today/RenewalNurture'
import WhatsMoving from '@/components/admin/today/WhatsMoving'
import Closings from '@/components/admin/today/Closings'
import TheYear from '@/components/admin/today/TheYear'
import { isDemoMode } from '@/lib/demo'
import { listCredentials } from '@/lib/compliance'
import { credentialTone } from '@/lib/compliance-logic'
import { fmtMoneyCompact, hoursSince, torontoAsOfDate, torontoTodayYMD } from '@/lib/dates'

export const dynamic = 'force-dynamic'

function val<T>(r: UwResult<T> | null): T | null {
  return r && r.configured && r.ok ? r.data : null
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default async function AdminHome() {
  // Home is permission-composed: every band gates on the same key as its
  // destination page, so an ops or agent home shows exactly what their nav can
  // reach — nothing more.
  const user = await requirePermission('deals.view')
  const canApprovals = can(user, 'approvals.view')
  const canRenewals = can(user, 'renewals.view')
  const canOpps = can(user, 'opportunities.view')
  const canRevenue = can(user, 'revenue.view')
  const canCompliance = can(user, 'compliance.view')
  const canStatus = can(user, 'status.view')

  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  const agentId = agentRes.configured && agentRes.ok ? agentRes.data : null
  const workbenchOff = !agentRes.configured
  const workbenchErr = agentRes.configured && !agentRes.ok ? agentRes.error : null

  // The approvals queues arrive through the SAME shared loader the desk page
  // and the Desk count layer use (getApprovalsData), so the Waiting-on-you
  // strip, the decision cards, and the Approvals page reconcile by construction.
  const [dealsRes, tasksRes, flagsR, condsR, condCountsR, approvalsData, wbDealsR, freshR, credsR, renewalsRes, seqStatesR, calendarRes] =
    await Promise.all([
      getAllDealsSlim()
        .then(d => ({ ok: true as const, data: d }))
        .catch(() => ({ ok: false as const, data: null })),
      getTasksDue()
        .then(t => ({ ok: true as const, data: t }))
        .catch(() => ({ ok: false as const, data: null })),
      agentId ? getOpenFlags(agentId) : null,
      agentId ? getConditionsDue(agentId, CONDITIONS_DUE_SOON_DAYS) : null,
      agentId ? getOpenConditionCounts(agentId) : null,
      agentId ? getApprovalsData(agentId) : null,
      agentId ? getDealsSummary(agentId) : null,
      agentId ? getIntakeFreshness(agentId) : null,
      listCredentials(),
      getRenewalDeals()
        .then(r => ({ ok: true as const, data: r }))
        .catch(() => ({ ok: false as const, data: null })),
      canRenewals && agentId ? getRenewalSequenceStates(agentId) : null,
      // Today's Microsoft calendar. Fail-soft in the fetcher (never throws), so
      // it is Promise.all-safe and never breaks the page.
      getTodayCalendar(),
    ])

  const deals: SlimDeal[] | null = dealsRes.ok ? dealsRes.data : null
  const tasks: OpenTask[] | null = tasksRes.ok ? tasksRes.data : null

  const todayYMD = torontoTodayYMD()
  const year = Number(todayYMD.slice(0, 4))

  const pipeline = deals ? computePipeline(deals, todayYMD) : null
  const funded = deals ? computeFundedYTD(deals, year) : null
  const weighted = pipeline
    ? weightedPipelineVolume(pipelineStageVolumes(pipeline), STAGE_WEIGHTS)
    : null
  const unmappedStages = pipeline
    ? unmappedPipelineStages(pipelineStageVolumes(pipeline), STAGE_WEIGHTS)
    : []
  const pacing =
    funded && weighted !== null
      ? computePacing({
          fundedYTD: funded.volume,
          weightedPipeline: weighted,
          annualTarget: ANNUAL_FUNDED_TARGET,
          asOf: torontoAsOfDate(),
        })
      : null

  const closings30 = deals ? computeClosings(deals, CLOSINGS_BLOCK_DAYS) : []

  // Renewals: the leak-line figures and the nurture band.
  const renewals = renewalsRes.ok ? renewalsRes.data : null
  const renewalBuckets = renewals ? bucketRenewals(renewals.withMaturity, todayYMD) : null
  const seqStates = canRenewals ? val(seqStatesR) : null
  const nurtureBuckets = seqStates ? renewalNurtureBuckets(seqStates) : null

  // The latest monitoring export, loaded once: it powers the act-now leak
  // figure, the Desk's files-in-review count (opportunities.view), and the
  // renewals-to-confirm count (renewals.view). Read-only; degrades silently.
  let oppActNow: { count: number; netBenefit: number } | null = null
  let reviewFiles: number | null = null
  let exportMortgages: SmmMortgage[] | null = null
  if ((canOpps || canRenewals) && smmStoreConfigured()) {
    try {
      const uploadsR = await recentUploads(3)
      const uploads = uploadsR.configured && uploadsR.ok ? uploadsR.data : []
      const cur = uploads.find(u => !u.superseded) ?? uploads[0] ?? null
      if (cur) {
        const rowsR = await rawRowsForUpload(cur.id)
        if (rowsR.configured && rowsR.ok) {
          exportMortgages = collapseCoBorrowers(rowsR.data.map(parseSmmRow)).mortgages
        }
      }
    } catch {
      exportMortgages = null
    }
  }
  if (canOpps && exportMortgages) {
    try {
      const quotesR = agentId && !isDemoMode() ? await getRateQuotesFull(agentId) : null
      const book: BookQuote[] =
        quotesR && quotesR.configured && quotesR.ok ? quotesR.data.map(bookQuoteFromRow) : []
      let count = 0
      let net = 0
      let review = 0
      for (const m of exportMortgages) {
        const { analysis } = analyzeMortgage(m.primary, book, todayYMD)
        if (analysis.bucket === 'act_now') {
          count++
          net += analysis.netBenefit ?? 0
        }
        if (analysis.bucket === 'review') review++
      }
      if (count > 0) oppActNow = { count, netBenefit: net }
      reviewFiles = review
    } catch {
      oppActNow = null
      reviewFiles = null
    }
  }

  // Renewals to confirm: the SAME shared walk the Renewals page runs
  // (appearsRenewedPending), over the buckets and export loaded above.
  let renewalsToConfirm: number | null = null
  if (canRenewals && renewalBuckets && exportMortgages) {
    const declined = new Map<string, string>()
    if (!isDemoMode()) {
      try {
        const eventsR = await recentRenewalEvents(500)
        if (eventsR.configured && eventsR.ok) {
          for (const e of eventsR.data) {
            if (e.action === 'appears_renewed_declined' && !declined.has(e.dealId)) {
              declined.set(
                e.dealId,
                typeof e.fields?.evidenceKey === 'string' ? (e.fields.evidenceKey as string) : '',
              )
            }
          }
        }
      } catch {
        // Store outage: no declines load; files re-flag (conservative).
      }
    }
    renewalsToConfirm = appearsRenewedPending(
      renewalBuckets,
      indexMortgagesByName(exportMortgages),
      declined,
    ).length
  }

  const flags = val(flagsR) ?? []
  const conds = val(condsR)
  const condCounts = val(condCountsR) ?? {}
  // Whether the condition reads succeeded — a failed read must never paint a
  // bridged closing "0 open conditions" (a false green); it reads neutral.
  const condsReadOk = val(condCountsR) !== null && conds !== null
  const stmts = approvalsData?.statements ?? []
  const sheets = approvalsData?.sheets ?? []
  const offers = approvalsData?.offers ?? []
  const shadow = approvalsData?.shadow ?? null
  const wbDeals = val(wbDealsR) ?? []
  const fresh = val(freshR)

  // ── The Desk: everything waiting on a human, one plain sentence ───────────
  const deskCounts: DeskCounts = {
    sheets: canApprovals && approvalsData ? approvalsData.sheets.length : null,
    statements: canApprovals && approvalsData ? approvalsData.statements.length : null,
    offers: canApprovals && approvalsData ? approvalsData.offers.length : null,
    flags: canApprovals && approvalsData ? approvalsData.flags.length : null,
    shadow: canApprovals && approvalsData ? approvalsData.shadow.length : null,
    renewalsToConfirm,
    reviewFiles,
    // No passive source exists for manual matches in Phase A (recorded
    // deviation): the backfill scan is on-demand, priced in Zoho searches.
    manualMatches: null,
  }
  const desk = deskFragments(deskCounts)

  // Zoho deal id → workbench deal (closings join); file ref → workbench deal
  // (task links + overdue join).
  const wbByZohoId = new Map<string, (typeof wbDeals)[number]>()
  const wbByFileRef = new Map<string, (typeof wbDeals)[number]>()
  for (const d of wbDeals) {
    if (d.zohoPotentialId) wbByZohoId.set(d.zohoPotentialId, d)
    if (d.fileRef) wbByFileRef.set(d.fileRef, d)
  }
  const overdueByRef = new Map<string, number>()
  for (const c of conds?.overdue ?? []) {
    if (c.dealRef) overdueByRef.set(c.dealRef, (overdueByRef.get(c.dealRef) ?? 0) + 1)
  }

  const highFlags = flags.filter(f => f.severity === 'high')
  const warnFlags = flags.filter(f => f.severity === 'warning')
  const infoFlags = flags.filter(f => f.severity === 'info')

  const staleHours = fresh?.lastActivity ? hoursSince(fresh.lastActivity) : null
  const intakeStale =
    Boolean(agentId && fresh) && (staleHours === null || staleHours > INTAKE_STALE_HOURS)
  const zohoDown = deals === null

  // Credential renewals within 60 days amber / 14 red (compliance.view only).
  const credentials = credsR.configured && credsR.ok ? credsR.data.filter(c => c.status === 'active') : []
  const credRows = credentials
    .map(c => ({ c, tone: credentialTone(c.expires_on, todayYMD) }))
    .filter(x => x.tone === 'red' || x.tone === 'amber')

  const closingRows = buildClosingRows(
    closings30,
    todayYMD,
    wbByZohoId,
    condCounts,
    overdueByRef,
    condsReadOk,
  )

  const exceptions = buildExceptions({
    closings: closingRows,
    todayYMD,
    overdue: conds?.overdue ?? [],
    dueSoon: conds?.dueSoon.length ?? 0,
    flags: {
      total: flags.length,
      high: highFlags.length,
      warning: warnFlags.length,
      info: infoFlags.length,
    },
    // Funded deals with no maturity date (renewals.view): the old rail's amber
    // alarm, folded into the one at-risk block rather than dropped.
    missingMaturity:
      canRenewals && renewals
        ? {
            count: renewals.missingMaturity.length,
            volume: renewals.missingMaturity.reduce((s, d) => s + d.amount, 0),
          }
        : null,
    credentials: canCompliance
      ? { count: credRows.length, anyRed: credRows.some(x => x.tone === 'red') }
      : { count: 0, anyRed: false },
    // Sync links to Status, so only surface it to a role that can reach it —
    // never a dead link for an agent.
    sync: canStatus
      ? { zohoDown, intakeStale, staleHours }
      : { zohoDown: false, intakeStale: false, staleHours: null },
  })
  const syncHealthy =
    canStatus && agentId && fresh && !zohoDown && !intakeStale && staleHours !== null
      ? { hoursAgo: staleHours }
      : null

  const prioritizedTasks = tasks ? prioritizeTasks(tasks, wbByFileRef, todayYMD, 5) : null

  // ── Decision cards (inline: the decision token is enumerated to this file) ─
  const decisionCards: {
    key: string
    kind: 'decide' | 'review'
    count: number
    title: string
    body: string
    cta: string
    href: string
  }[] = []
  const approvalsTotal =
    (deskCounts.sheets ?? 0) +
    (deskCounts.statements ?? 0) +
    (deskCounts.offers ?? 0) +
    (deskCounts.flags ?? 0) +
    (deskCounts.shadow ?? 0)
  if (approvalsTotal > 0) {
    const plur = (n: number | null, one: string, many: string) =>
      `${n ?? 0} ${(n ?? 0) === 1 ? one : many}`
    decisionCards.push({
      key: 'approvals',
      kind: 'decide',
      count: approvalsTotal,
      title: 'Approvals waiting',
      body: `${plur(deskCounts.sheets, 'sheet', 'sheets')}, ${plur(deskCounts.statements, 'statement', 'statements')}, ${plur(deskCounts.offers, 'offer', 'offers')}, ${plur(deskCounts.flags, 'flag', 'flags')}, ${deskCounts.shadow ?? 0} to score.`,
      cta: 'Review the queue',
      href: '/portal/admin/approvals',
    })
  }
  if ((renewalsToConfirm ?? 0) > 0) {
    decisionCards.push({
      key: 'renewals-confirm',
      kind: 'decide',
      count: renewalsToConfirm as number,
      title: 'Renewals to confirm',
      body: 'The monitoring feed contradicts the recorded terms. Confirm renewed with us or clear with a reason.',
      cta: 'Confirm renewals',
      href: '/portal/admin/beyond?tab=renewals',
    })
  }
  if ((reviewFiles ?? 0) > 0) {
    decisionCards.push({
      key: 'review-files',
      kind: 'review',
      count: reviewFiles as number,
      title: 'Files in review',
      body: 'Balances that did not reconcile or data the analysis will not state a figure on.',
      cta: 'Review files',
      href: '/portal/admin/beyond?tab=opportunities',
    })
  }
  const topDecisionCards = decisionCards.slice(0, 3)

  // ── What's moving: active files by lifecycle phase, closing-date order ─────
  const compactPipeline = pipeline
    ? [...pipeline.activeDeals].sort((a, b) =>
        (a.closingDate ?? '9999').localeCompare(b.closingDate ?? '9999'),
      )
    : []
  const compactPipelineGroups = groupByPhase(compactPipeline, d => d.stage)

  const leak =
    canRenewals || canOpps
      ? {
          lapsedVolume: canRenewals && renewalBuckets ? renewalBuckets.lapsed.volume : null,
          windowVolume: canRenewals && renewalBuckets ? renewalBuckets.action.volume : null,
          actNowBenefit: canOpps && oppActNow ? oppActNow.netBenefit : null,
          actNowCount: canOpps && oppActNow ? oppActNow.count : null,
        }
      : null
  const groom = pipeline ? { count: pipeline.staleCount, volume: pipeline.staleVolume } : null

  // ── Greeting ──────────────────────────────────────────────────────────────
  const headerDate = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Toronto',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
  const torontoHour = Number(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Toronto',
      hour: 'numeric',
      hour12: false,
    }).format(new Date()),
  )
  const greeting =
    torontoHour < 12 ? 'Good morning' : torontoHour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = user.name.split(' ')[0] || 'there'

  return (
    <div className="max-w-5xl space-y-6">
      {/* a. Greeting + pulse — the one serif moment (Fraunces). */}
      <div>
        <h1 className="font-greeting text-ink-navy text-[26px] sm:text-[30px] font-semibold leading-tight">
          {greeting}, {firstName}.
        </h1>
        <p className="text-muted font-ui text-sm mt-1">
          {headerDate}
          {canRevenue && funded ? (
            <>
              {' · '}
              {fmtMoneyCompact(funded.volume)} funded this year across {funded.count}{' '}
              {funded.count === 1 ? 'file' : 'files'}
            </>
          ) : null}
          {canRevenue && pacing ? (
            <>
              {' · '}
              <span className={pacing.onPace ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                {(pacing.onPace ? '+' : '-') + fmtMoneyCompact(Math.abs(pacing.delta))}
              </span>{' '}
              {pacing.onPace ? 'ahead of pace' : 'behind pace'}
            </>
          ) : null}
          {pipeline ? (
            <>
              {' · '}
              {pipeline.openCount} open {pipeline.openCount === 1 ? 'file' : 'files'}
            </>
          ) : null}
        </p>
      </div>

      {/* b. Your day — today's Microsoft calendar + live Zoho tasks. */}
      <YourDay tasks={prioritizedTasks} calendar={calendarRes} todayYMD={todayYMD} />

      {/* c. Waiting on you — the navy strip, three decision cards, one
          exceptions block, and a quiet healthy-sync line at the bottom. */}
      <div className="space-y-4">
        <DeskStrip fragments={desk} />

        {topDecisionCards.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {topDecisionCards.map(c => (
              <Link
                key={c.key}
                href={c.href}
                className={`block rounded-[10px] bg-white border border-hairline border-t-4 shadow-card px-4 py-3.5 hover:border-ink-navy/30 motion-safe:transition-colors ${
                  c.kind === 'decide' ? 'border-t-decision' : 'border-t-caution'
                }`}
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-ui font-bold text-2xl text-ink tabular-nums">{c.count}</span>
                  <span className="font-ui font-semibold text-sm text-ink">{c.title}</span>
                </div>
                <p className="mt-1 font-ui text-xs text-muted leading-snug">{c.body}</p>
                <p
                  className={`mt-2 font-ui text-[13px] font-semibold text-ink underline decoration-2 underline-offset-4 ${
                    c.kind === 'decide' ? 'decoration-decision' : 'decoration-caution'
                  }`}
                >
                  {c.cta}
                </p>
              </Link>
            ))}
          </div>
        )}

        {workbenchOff ? (
          <div className="border border-hairline bg-white rounded-[10px] px-4 py-3">
            <p className="text-sm text-muted font-ui">
              Workbench not connected. Conditions, flags, and approvals appear here once
              UW_SUPABASE_URL, UW_SUPABASE_READONLY_KEY, and UW_SUPABASE_PUBLISHABLE_KEY are set.
            </p>
          </div>
        ) : null}
        {workbenchErr ? (
          <div className="border border-amber-200 bg-amber-50 rounded-[10px] px-4 py-3">
            <p className="text-sm text-amber-900 font-ui">Workbench read failed: {workbenchErr}</p>
          </div>
        ) : null}
        {/* The at-risk block draws on FOXCA credentials too, so it renders even
            when the workbench is unconfigured — an expiring licence still shows. */}
        <Exceptions exceptions={exceptions} syncHealthy={syncHealthy} />
      </div>

      {/* d. Renewal nurture — the 150-day drip (renewals.view). */}
      {canRenewals && nurtureBuckets ? <RenewalNurture buckets={nurtureBuckets} /> : null}

      {/* e. What's moving — the single lifecycle table. */}
      <WhatsMoving
        groups={compactPipelineGroups}
        wbByZohoId={wbByZohoId}
        todayYMD={todayYMD}
        activeCount={pipeline?.openCount ?? 0}
        activeVolume={pipeline?.openVolume ?? 0}
      />

      {/* f. Closings in the next 30 days. */}
      <Closings rows={closingRows} todayYMD={todayYMD} windowDays={CLOSINGS_BLOCK_DAYS} />

      {/* g. The year — pacing, the leak line, the groom line (revenue.view). */}
      {canRevenue && pacing ? (
        <TheYear
          pacing={pacing}
          fundedCount={funded?.count ?? 0}
          unmappedStages={unmappedStages}
          leak={leak}
          groom={groom}
        />
      ) : null}
    </div>
  )
}
