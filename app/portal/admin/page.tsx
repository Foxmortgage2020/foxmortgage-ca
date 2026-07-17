// Home: the daily command center. Exception-first: the top of the page is
// what needs Michael, not vanity metrics. Server component; every data pull
// degrades independently to an honest unavailable state.
//
// Replaced the previous KPI dashboard (client component fetching
// /api/admin/dashboard) in Session 1. What was dropped and why is recorded
// in docs/portal-audit-2026-07.md.

import Link from 'next/link'
import { can, requirePermission } from '@/lib/authz'
import {
  ANNUAL_FUNDED_TARGET,
  CLOSINGS_ATTENTION_DAYS,
  CLOSINGS_STRIP_DAYS,
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
import { appearsRenewedPending, bucketRenewals, renewalBook } from '@/lib/renewals'
import {
  getAgentIdByEmail,
  getConditionsDue,
  getDealsSummary,
  getIntakeFreshness,
  getOpenConditionCounts,
  getOpenFlags,
  getRateQuoteStats,
  getRateQuotesFull,
  type UwResult,
} from '@/lib/underwriting'
import { getApprovalsData } from '@/lib/approvals-data'
import { recentUploads, rawRowsForUpload, smmStoreConfigured } from '@/lib/smm-store'
import { recentRenewalEvents } from '@/lib/renewals-store'
import { collapseCoBorrowers, parseSmmRow, type SmmMortgage } from '@/lib/smm'
import { analyzeMortgage, bookQuoteFromRow } from '@/lib/smm-analysis'
import { indexMortgagesByName, type BookQuote } from '@/lib/smm-match'
import { deskFragments, nextStepForStage, type DeskCounts } from '@/lib/desk'
import { groupByPhase } from '@/config/lifecycle'
import DeskStrip from '@/components/admin/DeskStrip'
import { isDemoMode } from '@/lib/demo'
import { listCredentials } from '@/lib/compliance'
import { credentialTone } from '@/lib/compliance-logic'
import {
  fmtMoney,
  fmtMoneyCompact,
  fmtShortDate,
  hoursSince,
  torontoAsOfDate,
  torontoTodayYMD,
} from '@/lib/dates'

export const dynamic = 'force-dynamic'

const zohoTaskUrl = (id: string) => `https://crm.zoho.com/crm/org906105026/tab/Tasks/${id}`

function val<T>(r: UwResult<T> | null): T | null {
  return r && r.configured && r.ok ? r.data : null
}

// ─── Small presentational pieces (server-rendered) ──────────────────────────

type Tone = 'red' | 'amber' | 'gray'

const TONE_STYLES: Record<Tone, string> = {
  red: 'bg-red-50 border-red-200',
  amber: 'bg-amber-50 border-amber-200',
  gray: 'bg-white border-gray-200',
}

function AttentionCard({
  tone,
  title,
  count,
  href,
  children,
}: {
  tone: Tone
  title: string
  count?: number
  href: string
  children?: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={`block border rounded-xl px-4 py-3 transition-colors hover:border-navy/40 ${TONE_STYLES[tone]}`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${
            tone === 'red' ? 'bg-red-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-gray-300'
          }`}
        />
        <span className="font-heading font-bold text-navy text-sm">{title}</span>
        {typeof count === 'number' && (
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              tone === 'red'
                ? 'bg-red-100 text-red-700'
                : tone === 'amber'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-gray-100 text-gray-600'
            }`}
          >
            {count}
          </span>
        )}
      </div>
      {children ? <div className="mt-2 space-y-1">{children}</div> : null}
    </Link>
  )
}

function AttentionRow({ left, right }: { left: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs font-body text-gray-700">
      <span className="truncate">{left}</span>
      {right ? <span className="shrink-0 text-gray-500">{right}</span> : null}
    </div>
  )
}

function SectionCard({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading text-navy font-bold text-base">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  )
}

function QuietNote({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-400 font-body py-2">{children}</p>
}

function KpiCell({
  label,
  value,
  sub,
  href,
  tone,
}: {
  label: string
  value: string
  sub?: string
  href: string
  tone?: 'good' | 'bad'
}) {
  return (
    <Link
      href={href}
      className="block border border-gray-200 rounded-lg px-3 py-2 bg-white hover:border-navy/40 transition-colors"
    >
      <p className="text-[10px] font-body text-gray-400 uppercase tracking-wide truncate">{label}</p>
      <p
        className={`font-heading font-bold text-base ${
          tone === 'good' ? 'text-green-600' : tone === 'bad' ? 'text-red-600' : 'text-navy'
        }`}
      >
        {value}
      </p>
      {sub && <p className="text-[10px] font-body text-gray-500 truncate">{sub}</p>}
    </Link>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default async function AdminHome() {
  // Session 8: Home is permission-composed. Every section gates on the
  // same key as its destination page, so an ops or agent home shows
  // exactly what their nav can reach — nothing more.
  const user = await requirePermission('deals.view')

  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  const agentId = agentRes.configured && agentRes.ok ? agentRes.data : null
  const workbenchOff = !agentRes.configured
  const workbenchErr = agentRes.configured && !agentRes.ok ? agentRes.error : null

  // The approvals queues arrive through the SAME shared loader the desk page
  // and the Desk count layer use (getApprovalsData), so the Waiting-on-you
  // strip, the rail, and the Approvals page reconcile by construction.
  const [dealsRes, tasksRes, flagsR, condsR, condCountsR, approvalsData, wbDealsR, ratesR, freshR, credsR, renewalsRes] =
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
      agentId ? getRateQuoteStats(agentId) : null,
      agentId ? getIntakeFreshness(agentId) : null,
      listCredentials(),
      getRenewalDeals()
        .then(r => ({ ok: true as const, data: r }))
        .catch(() => ({ ok: false as const, data: null })),
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
  // Loud, never silent: active stages the weight map does not know.
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

  const closingsAttention = deals ? computeClosings(deals, CLOSINGS_ATTENTION_DAYS) : []
  const closingsStrip = deals ? computeClosings(deals, CLOSINGS_STRIP_DAYS) : []

  // Renewals: the rail alarm and the KPI-strip numbers (renewals.view only).
  const renewals = renewalsRes.ok ? renewalsRes.data : null
  const renewalBuckets = renewals ? bucketRenewals(renewals.withMaturity, todayYMD) : null
  const renewalBookData = renewals ? renewalBook(renewals.withMaturity, todayYMD) : null
  const missingMaturityCount = renewals ? renewals.missingMaturity.length : 0
  const missingMaturityVol = renewals
    ? renewals.missingMaturity.reduce((s, d) => s + d.amount, 0)
    : 0
  const canRenewals = can(user, 'renewals.view')

  // The latest monitoring export, loaded once: it powers the act-now rail
  // line, the Desk's files-in-review count (opportunities.view), and the
  // renewals-to-confirm count (renewals.view). Read-only; degrades silently.
  const canOpps = can(user, 'opportunities.view')
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
      const quotesR = agentId ? await getRateQuotesFull(agentId) : null
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
  // Actionable queues from the shared approvals loader: sheets exclude the
  // parked province-excluded shelf, exactly as the Approvals page counts.
  const stmts = approvalsData?.statements ?? []
  const sheets = approvalsData?.sheets ?? []
  const offers = approvalsData?.offers ?? []
  const pendingOffers = offers.length
  const shadow = approvalsData?.shadow ?? null
  const wbDeals = val(wbDealsR) ?? []
  const rates = val(ratesR)
  const fresh = val(freshR)

  // ── The Desk: everything waiting on a human, one sentence ────────────────
  const canApprovals = can(user, 'approvals.view')
  const deskCounts: DeskCounts = {
    sheets: canApprovals && approvalsData ? approvalsData.sheets.length : null,
    statements: canApprovals && approvalsData ? approvalsData.statements.length : null,
    offers: canApprovals && approvalsData ? approvalsData.offers.length : null,
    flags: canApprovals && approvalsData ? approvalsData.flags.length : null,
    shadow: canApprovals && approvalsData ? approvalsData.shadow.length : null,
    renewalsToConfirm,
    reviewFiles,
    // No passive source exists for manual matches in Phase A: the backfill
    // scan is on-demand and priced in Zoho searches (recorded deviation).
    manualMatches: null,
  }
  const desk = deskFragments(deskCounts)

  // Zoho deal id → workbench deal (for the closings join).
  const wbByZohoId = new Map<string, (typeof wbDeals)[number]>()
  for (const d of wbDeals) if (d.zohoPotentialId) wbByZohoId.set(d.zohoPotentialId, d)

  const closingRows = closingsAttention.map(c => {
    const wb = wbByZohoId.get(c.id)
    return {
      ...c,
      wbMatch: Boolean(wb),
      openConds: wb ? (condCounts[wb.id] ?? 0) : null,
    }
  })
  const closingsNeedingAttention = closingRows.filter(
    r => !r.wbMatch || (r.openConds ?? 0) > 0,
  )

  const highFlags = flags.filter(f => f.severity === 'high')
  const warnFlags = flags.filter(f => f.severity === 'warning')
  const infoFlags = flags.filter(f => f.severity === 'info')

  // Same definition as the Approvals shadow tab: active deals with at
  // least one of the four dimensions not yet scored.
  const shadowDue = shadow ? shadow.length : 0
  const pendingApprovals = stmts.length + sheets.length + shadowDue

  const staleHours = fresh?.lastActivity ? hoursSince(fresh.lastActivity) : null
  const intakeStale =
    Boolean(agentId && fresh) && (staleHours === null || staleHours > INTAKE_STALE_HOURS)
  const zohoDown = deals === null

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

  // Up to three decision cards under the strip: decisions carry the lime
  // top border, review carries amber. No filler; fewer queues, fewer cards.
  const approvalsTotal =
    (deskCounts.sheets ?? 0) +
    (deskCounts.statements ?? 0) +
    (deskCounts.offers ?? 0) +
    (deskCounts.flags ?? 0) +
    (deskCounts.shadow ?? 0)
  const decisionCards: {
    key: string
    kind: 'decide' | 'review'
    count: number
    title: string
    body: string
    cta: string
    href: string
  }[] = []
  if (approvalsTotal > 0) {
    decisionCards.push({
      key: 'approvals',
      kind: 'decide',
      count: approvalsTotal,
      title: 'Approvals waiting',
      body: `${deskCounts.sheets ?? 0} sheets, ${deskCounts.statements ?? 0} statements, ${deskCounts.offers ?? 0} offers, ${deskCounts.flags ?? 0} flags, ${deskCounts.shadow ?? 0} to score.`,
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
      href: '/portal/admin/renewals',
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
      href: '/portal/admin/opportunities',
    })
  }
  const topDecisionCards = decisionCards.slice(0, 3)

  // Compact pipeline: the active files with a plain-words next step, grouped
  // by lifecycle phase (B1). Group rows beat a per-row chip at these counts:
  // a chip would put a second pill on every row and repeat the same phase
  // word eight times; four quiet group rows say it once each, in the same
  // words as the board. Closing-date order holds within each group. A stage
  // with no phase lands in the loud trailing group, never forced in.
  const compactPipeline = pipeline
    ? [...pipeline.activeDeals].sort((a, b) =>
        (a.closingDate ?? '9999').localeCompare(b.closingDate ?? '9999'),
      )
    : []
  const compactPipelineGroups = groupByPhase(compactPipeline, d => d.stage)

  const attentionCards: React.ReactNode[] = []

  // Renewals rank near the top: they cost money when missed.
  if (canRenewals && renewalBuckets && renewalBuckets.lapsed.count > 0) {
    attentionCards.push(
      <AttentionCard
        key="renewals-lapsed"
        tone="red"
        title="Lapsed renewals"
        count={renewalBuckets.lapsed.count}
        href="/portal/admin/renewals"
      >
        <AttentionRow
          left={`${fmtMoney(renewalBuckets.lapsed.volume)} matured with no recorded outcome`}
          right="the leak"
        />
      </AttentionCard>,
    )
  }
  if (canRenewals && renewalBuckets && renewalBuckets.action.count > 0) {
    attentionCards.push(
      <AttentionCard
        key="renewals-action"
        tone="amber"
        title="Renewals in the action window"
        count={renewalBuckets.action.count}
        href="/portal/admin/renewals"
      >
        <AttentionRow
          left={`${fmtMoney(renewalBuckets.action.volume)} maturing within 130 days`}
          right="engage now"
        />
      </AttentionCard>,
    )
  }
  if (canRenewals && missingMaturityCount > 0) {
    attentionCards.push(
      <AttentionCard
        key="renewals-missing"
        tone="amber"
        title="Funded deals with no maturity date"
        count={missingMaturityCount}
        href="/portal/admin/renewals"
      >
        <AttentionRow
          left={`${fmtMoney(missingMaturityVol)} invisible to the renewal system until backfilled`}
          right="untracked"
        />
      </AttentionCard>,
    )
  }

  // Monitoring opportunities worth a call: positive Fox net benefit after the
  // early-break penalty, from the latest export.
  if (oppActNow) {
    attentionCards.push(
      <AttentionCard
        key="opps-act-now"
        tone="amber"
        title="Monitoring opportunities to call"
        count={oppActNow.count}
        href="/portal/admin/opportunities"
      >
        <AttentionRow
          left={`${fmtMoney(oppActNow.netBenefit)} estimated net benefit across act-now files`}
          right="call them"
        />
      </AttentionCard>,
    )
  }

  if (conds && conds.overdue.length > 0) {
    attentionCards.push(
      <AttentionCard
        key="overdue"
        tone="red"
        title="Overdue conditions"
        count={conds.overdue.length}
        href="/portal/admin/underwriting"
      >
        {conds.overdue.slice(0, 5).map(c => (
          <AttentionRow
            key={c.id}
            left={`${c.dealRef ?? 'file'}: ${c.text}`}
            right={`due ${fmtShortDate(c.dueDate)} (${c.owner})`}
          />
        ))}
        {conds.overdue.length > 5 && (
          <p className="text-xs text-gray-500">and {conds.overdue.length - 5} more</p>
        )}
      </AttentionCard>,
    )
  }

  if (conds && conds.dueSoon.length > 0) {
    attentionCards.push(
      <AttentionCard
        key="duesoon"
        tone="amber"
        title={`Conditions due within ${CONDITIONS_DUE_SOON_DAYS} days`}
        count={conds.dueSoon.length}
        href="/portal/admin/underwriting"
      >
        {conds.dueSoon.slice(0, 5).map(c => (
          <AttentionRow
            key={c.id}
            left={`${c.dealRef ?? 'file'}: ${c.text}`}
            right={`due ${fmtShortDate(c.dueDate)} (${c.owner})`}
          />
        ))}
      </AttentionCard>,
    )
  }

  if (closingsNeedingAttention.length > 0) {
    attentionCards.push(
      <AttentionCard
        key="closings"
        tone="amber"
        title={`Closings within ${CLOSINGS_ATTENTION_DAYS} days needing eyes`}
        count={closingsNeedingAttention.length}
        href="/portal/admin/underwriting"
      >
        {closingsNeedingAttention.slice(0, 5).map(r => (
          <AttentionRow
            key={r.id}
            left={r.dealName}
            right={
              r.wbMatch
                ? `${fmtShortDate(r.closingDate)}, ${r.openConds} open condition${r.openConds === 1 ? '' : 's'}`
                : `${fmtShortDate(r.closingDate)}, no workbench file`
            }
          />
        ))}
      </AttentionCard>,
    )
  }

  if (flags.length > 0) {
    attentionCards.push(
      <AttentionCard
        key="flags"
        tone={highFlags.length > 0 ? 'red' : 'amber'}
        title="Open workbench flags"
        count={flags.length}
        href="/portal/admin/underwriting"
      >
        <AttentionRow
          left={`${highFlags.length} high, ${warnFlags.length} warning, ${infoFlags.length} info`}
        />
        {[...highFlags, ...warnFlags].slice(0, 4).map(f => (
          <AttentionRow
            key={f.id}
            left={`${f.severity}: ${f.kind.replace(/_/g, ' ')}`}
            right={f.dealRef ?? undefined}
          />
        ))}
      </AttentionCard>,
    )
  }

  if (can(user, 'approvals.view') && pendingApprovals > 0) {
    attentionCards.push(
      <AttentionCard
        key="approvals"
        tone="amber"
        title="Pending approvals"
        count={pendingApprovals}
        href="/portal/admin/approvals"
      >
        <AttentionRow
          left={`${stmts.length} statement review${stmts.length === 1 ? '' : 's'}, ${sheets.length} rate sheet review${sheets.length === 1 ? '' : 's'}, ${shadowDue} shadow score${shadowDue === 1 ? '' : 's'} due`}
        />
      </AttentionCard>,
    )
  }

  if (can(user, 'approvals.view') && pendingOffers > 0) {
    const noExpiry = offers.filter(o => !o.expiry).length
    attentionCards.push(
      <AttentionCard
        key="offers"
        tone="amber"
        title="Offers to review"
        count={pendingOffers}
        href="/portal/admin/approvals?tab=offers"
      >
        <AttentionRow
          left={`${pendingOffers} promotional offer${pendingOffers === 1 ? '' : 's'} extracted${
            noExpiry > 0 ? `, ${noExpiry} with no stated end date` : ''
          }. Approve or reject on the desk.`}
        />
      </AttentionCard>,
    )
  }

  // Credential renewals (Session 6): within 60 days amber, within 14 days
  // red, from the FOXCA compliance register. Unconfirmed placeholder
  // dates say so. No date recorded means no alarm.
  const credentials = credsR.configured && credsR.ok ? credsR.data.filter(c => c.status === 'active') : []
  const credRows = credentials
    .map(c => ({ c, tone: credentialTone(c.expires_on, todayYMD) }))
    .filter(x => x.tone === 'red' || x.tone === 'amber')
  if (can(user, 'compliance.view') && credRows.length > 0) {
    attentionCards.push(
      <AttentionCard
        key="credentials"
        tone={credRows.some(x => x.tone === 'red') ? 'red' : 'amber'}
        title="Credential renewals"
        count={credRows.length}
        href="/portal/admin/compliance"
      >
        {credRows.slice(0, 4).map(({ c }) => (
          <AttentionRow
            key={c.id}
            left={c.name}
            right={`${fmtShortDate(c.expires_on!)}${c.date_confirmed ? '' : ' (confirm date)'}`}
          />
        ))}
      </AttentionCard>,
    )
  }

  if (zohoDown || intakeStale) {
    attentionCards.push(
      <AttentionCard
        key="sync"
        tone="red"
        title="Sync freshness"
        href="/portal/admin/status"
      >
        {zohoDown && <AttentionRow left="Zoho CRM is unreachable right now." />}
        {intakeStale && (
          <AttentionRow
            left={
              staleHours === null
                ? 'Workbench has no recorded intake activity yet.'
                : `Workbench intake has been quiet for ${Math.round(staleHours)}h (threshold ${INTAKE_STALE_HOURS}h).`
            }
          />
        )}
      </AttentionCard>,
    )
  }

  return (
    <div className="max-w-6xl">
      {/* Greeting — the one serif moment (Fraunces), the same face clients
          see on Fox Mortgage documents. The sub-line carries funded YTD. */}
      <div className="mb-5">
        <h1 className="font-greeting text-ink-navy text-[26px] sm:text-[30px] font-semibold leading-tight">
          {greeting}, {firstName}.
        </h1>
        <p className="text-muted font-ui text-sm mt-1">
          {headerDate}
          {can(user, 'revenue.view') && funded
            ? ` · ${fmtMoneyCompact(funded.volume)} funded this year across ${funded.count} ${funded.count === 1 ? 'file' : 'files'}`
            : ''}
        </p>
      </div>

      {/* The Desk: everything waiting on a human, one plain sentence. */}
      <div className="mb-5">
        <DeskStrip fragments={desk} />
      </div>

      {/* Decision cards: lime top border = decide, amber = review. */}
      {topDecisionCards.length > 0 && (
        <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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

      {/* Compact pipeline: every active file, its stage, and the next step
          in plain words. Stage names render display values (the display/
          actual indirection is documented in config/pipeline.ts). */}
      {compactPipeline.length > 0 && (
        <div className="mb-8 rounded-[10px] bg-white border border-hairline shadow-card overflow-x-auto">
          <table className="w-full text-sm font-ui">
            <thead>
              <tr className="bg-[#FAFBFC] text-left text-[11px] text-muted uppercase tracking-wide">
                <th className="py-2.5 px-4 font-semibold">Client</th>
                <th className="py-2.5 px-3 font-semibold">Stage</th>
                <th className="py-2.5 px-3 font-semibold text-right">Amount</th>
                <th className="py-2.5 px-3 font-semibold">Closes</th>
                <th className="py-2.5 px-3 font-semibold">Next step</th>
                <th className="py-2.5 px-4 font-semibold text-right"></th>
              </tr>
            </thead>
            {compactPipelineGroups.map(group => (
              <tbody key={group.key}>
                <tr className="border-t border-hairline">
                  <td colSpan={6} className="pt-2.5 pb-1 px-4">
                    <span
                      className={`font-ui text-[10px] font-bold uppercase tracking-[1.6px] ${
                        group.key === 'unmapped' ? 'text-caution' : 'text-ink-navy'
                      }`}
                    >
                      {group.label}
                    </span>
                  </td>
                </tr>
                {group.items.map(d => {
                  const wb = wbByZohoId.get(d.id)
                  return (
                    <tr key={d.id} className="border-t border-hairline hover:bg-[#FAFCF5]">
                      <td className="py-2.5 px-4 text-ink font-medium truncate max-w-[240px]">
                        {d.dealName}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="inline-block rounded-full bg-fog px-2 py-0.5 text-[11px] font-semibold text-muted">
                          {d.stage}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-ink tabular-nums">
                        {fmtMoneyCompact(d.amount)}
                      </td>
                      <td className="py-2.5 px-3 text-muted tabular-nums">
                        {d.closingDate ? fmtShortDate(d.closingDate) : 'not set'}
                      </td>
                      <td className="py-2.5 px-3 text-muted">{nextStepForStage(d.stage)}</td>
                      <td className="py-2.5 px-4 text-right">
                        <Link
                          href={wb ? `/portal/admin/deals/${wb.id}` : '/portal/admin/underwriting#not-yet-bridged'}
                          className="font-semibold text-ink text-[13px] underline decoration-hairline underline-offset-4 hover:decoration-ink-navy"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}

      {/* Needs Attention rail */}
      <div className="mb-8">
        {workbenchOff && (
          <div className="border border-gray-200 bg-white rounded-xl px-4 py-3 mb-3">
            <p className="text-sm text-gray-500 font-body">
              Workbench not connected. Conditions, flags, and approvals appear here once
              UW_SUPABASE_URL, UW_SUPABASE_READONLY_KEY, and UW_SUPABASE_PUBLISHABLE_KEY are set.
            </p>
          </div>
        )}
        {workbenchErr && (
          <div className="border border-amber-200 bg-amber-50 rounded-xl px-4 py-3 mb-3">
            <p className="text-sm text-amber-800 font-body">Workbench: {workbenchErr}</p>
          </div>
        )}
        {attentionCards.length > 0 ? (
          <div className="space-y-3">{attentionCards}</div>
        ) : (
          !workbenchOff &&
          !workbenchErr && (
            <div className="border border-gray-200 bg-white rounded-xl px-4 py-3">
              <p className="text-sm text-gray-500 font-body">
                Nothing needs attention right now. Conditions, flags, approvals, and sync
                are all clear.
              </p>
            </div>
          )
        )}
      </div>

      {/* Compact KPI strip: a glance, not a dashboard. Each number links out. */}
      {(can(user, 'revenue.view') || canRenewals) && (
        <div className="mb-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {can(user, 'revenue.view') && funded && (
            <KpiCell label="Funded YTD" value={fmtMoneyCompact(funded.volume)} sub={`${funded.count} files`} href="/portal/admin/revenue" />
          )}
          {can(user, 'revenue.view') && pacing && (
            <KpiCell
              label={`Pace vs ${fmtMoneyCompact(pacing.annualTarget)}`}
              value={`${pacing.onPace ? '+' : '-'}${fmtMoneyCompact(Math.abs(pacing.delta))}`}
              sub={pacing.onPace ? 'ahead' : 'behind'}
              tone={pacing.onPace ? 'good' : 'bad'}
              href="/portal/admin/revenue"
            />
          )}
          {pipeline && (
            <KpiCell label="Active pipeline" value={`${pipeline.openCount} files`} sub={fmtMoneyCompact(pipeline.openVolume)} href="/portal/admin/underwriting" />
          )}
          {canRenewals && renewalBuckets && (
            <KpiCell
              label="Renewals to action"
              value={`${renewalBuckets.action.count} files`}
              sub={fmtMoneyCompact(renewalBuckets.action.volume)}
              href="/portal/admin/renewals"
            />
          )}
          {canRenewals && renewalBuckets && (
            <KpiCell
              label="Lapsed renewals"
              value={`${renewalBuckets.lapsed.count} files`}
              sub={fmtMoneyCompact(renewalBuckets.lapsed.volume)}
              tone={renewalBuckets.lapsed.count > 0 ? 'bad' : undefined}
              href="/portal/admin/renewals"
            />
          )}
        </div>
      )}

      {/* Pipeline + Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2">
          <SectionCard
            title="Pipeline by stage"
            action={
              <Link href="/portal/admin/underwriting" className="text-xs font-semibold text-navy hover:text-lime">
                Deals &rarr;
              </Link>
            }
          >
            {pipeline ? (
              <div>
                <table className="w-full text-sm font-body">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 uppercase tracking-wide">
                      <th className="py-1.5 font-medium">Stage</th>
                      <th className="py-1.5 font-medium text-right">Files</th>
                      <th className="py-1.5 font-medium text-right">Volume</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...pipeline.ordered, ...pipeline.other].map(row => (
                      <tr key={row.stage} className="border-t border-gray-100">
                        <td className="py-2">
                          <Link href="/portal/admin/underwriting" className="text-navy hover:text-lime">
                            {row.stage}
                          </Link>
                        </td>
                        <td className="py-2 text-right text-navy font-semibold">{row.count}</td>
                        <td className="py-2 text-right text-gray-600">{fmtMoneyCompact(row.volume)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-gray-200">
                      <td className="py-2 font-semibold text-navy">Open total</td>
                      <td className="py-2 text-right font-semibold text-navy">{pipeline.openCount}</td>
                      <td className="py-2 text-right font-semibold text-navy">
                        {fmtMoneyCompact(pipeline.openVolume)}
                      </td>
                    </tr>
                  </tbody>
                </table>
                {pipeline.summary.map(s => (
                  <p key={s.stage} className="text-xs text-gray-400 font-body mt-2">
                    {s.stage}: {s.count} tracked records (not counted as pipeline)
                  </p>
                ))}
                {pipeline.staleCount > 0 && (
                  <p className="text-xs text-amber-700 font-body mt-2">
                    {pipeline.staleCount} stale file{pipeline.staleCount === 1 ? '' : 's'} (
                    {fmtMoneyCompact(pipeline.staleVolume)}) held out of pipeline.{' '}
                    <Link href="/portal/admin/revenue" className="underline hover:text-navy">
                      Groom on Revenue
                    </Link>
                  </p>
                )}
              </div>
            ) : (
              <QuietNote>Zoho pipeline data is unavailable right now. Check Status.</QuietNote>
            )}
          </SectionCard>
        </div>

        <SectionCard title="Tasks due today">
          {tasks === null ? (
            <QuietNote>Zoho tasks are unavailable right now.</QuietNote>
          ) : tasks.length === 0 ? (
            <QuietNote>No tasks due today.</QuietNote>
          ) : (
            <div className="space-y-2">
              {tasks.slice(0, 8).map(t => (
                <a
                  key={t.id}
                  href={zohoTaskUrl(t.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="block group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-body text-navy group-hover:text-lime leading-snug">
                      {t.subject}
                    </span>
                    <span
                      className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        t.overdue ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {t.overdue ? `overdue ${fmtShortDate(t.dueDate)}` : 'today'}
                    </span>
                  </div>
                  {t.priority && (
                    <p className="text-[11px] text-gray-400 mt-0.5">{t.priority} priority</p>
                  )}
                </a>
              ))}
              {tasks.length > 8 && (
                <p className="text-xs text-gray-400">and {tasks.length - 8} more in Zoho</p>
              )}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Goal pacing + Rates — each behind its destination page's key */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {can(user, 'revenue.view') && (
        <div className="lg:col-span-2">
          <SectionCard
            title={`Goal pacing ${year}`}
            action={
              <Link href="/portal/admin/revenue" className="text-xs font-semibold text-navy hover:text-lime">
                Revenue &rarr;
              </Link>
            }
          >
            {pacing ? (
              <div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="font-heading text-xl text-navy font-bold">
                      {fmtMoneyCompact(pacing.fundedYTD)}
                    </p>
                    <p className="text-xs text-gray-500 font-body mt-0.5">
                      Funded YTD ({funded?.count ?? 0} deals)
                    </p>
                  </div>
                  <div>
                    <p className="font-heading text-xl text-navy font-bold">
                      {fmtMoneyCompact(pacing.weightedPipeline)}
                    </p>
                    <p className="text-xs text-gray-500 font-body mt-0.5">Weighted pipeline</p>
                  </div>
                  <div>
                    <p className="font-heading text-xl text-navy font-bold">
                      {fmtMoneyCompact(pacing.combined)}
                    </p>
                    <p className="text-xs text-gray-500 font-body mt-0.5">Combined</p>
                  </div>
                  <div>
                    <p
                      className={`font-heading text-xl font-bold ${pacing.onPace ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {(pacing.onPace ? '+' : '-') + fmtMoneyCompact(Math.abs(pacing.delta))}
                    </p>
                    <p className="text-xs text-gray-500 font-body mt-0.5">
                      {pacing.onPace ? 'Ahead of' : 'Behind'} straight-line
                    </p>
                  </div>
                </div>

                {unmappedStages.length > 0 && (
                  <p className="mt-3 rounded bg-amber-50 border border-amber-300 px-2.5 py-1.5 text-[11px] font-body text-amber-900">
                    <span className="font-semibold">Unmapped stage{unmappedStages.length > 1 ? 's' : ''}:</span>{' '}
                    {unmappedStages.map(s => `${s.stage} (${fmtMoneyCompact(s.volume)})`).join(', ')} counted at
                    zero weight until mapped in config/pipeline.ts.
                  </p>
                )}

                {/* Progress vs the straight-line marker */}
                <div className="mt-5">
                  <div className="relative h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="absolute left-0 top-0 bottom-0 bg-lime"
                      style={{
                        width: `${Math.min(100, (pacing.combined / pacing.annualTarget) * 100)}%`,
                      }}
                    />
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-navy"
                      style={{ left: `${Math.min(100, pacing.pctYearElapsed * 100)}%` }}
                      title="Straight-line position for today"
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-gray-400 font-body mt-1.5">
                    <span>
                      Target {fmtMoneyCompact(pacing.annualTarget)} &middot; day {pacing.dayOfYear} of{' '}
                      {pacing.daysInYear}
                    </span>
                    <span>
                      Straight-line today: {fmtMoney(pacing.straightLineTarget)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <QuietNote>Pacing needs the Zoho deal pull, which is unavailable right now.</QuietNote>
            )}
          </SectionCard>
        </div>
        )}

        {can(user, 'rates.view') && (
        <SectionCard
          title="Rates"
          action={
            <Link href="/portal/admin/rates" className="text-xs font-semibold text-navy hover:text-lime">
              Rates &rarr;
            </Link>
          }
        >
          {workbenchOff ? (
            <QuietNote>Workbench not connected.</QuietNote>
          ) : rates ? (
            <div className="space-y-2.5 font-body text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Approved current quotes</span>
                <span className="text-navy font-semibold">{rates.approvedCurrent}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Superseded</span>
                <span className="text-navy font-semibold">{rates.superseded}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Newest approved sheet</span>
                <span className="text-navy font-semibold">
                  {rates.newestApprovedAsOf ? fmtShortDate(rates.newestApprovedAsOf) : 'none'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Pending sheet reviews</span>
                <Link href="/portal/admin/approvals" className="text-navy font-semibold hover:text-lime">
                  {sheets.length}
                </Link>
              </div>
              <p className="text-[11px] text-gray-400 pt-1">
                Promo countdowns and the full browser live on the Rates page.
              </p>
            </div>
          ) : (
            <QuietNote>Workbench rates data is unavailable right now.</QuietNote>
          )}
        </SectionCard>
        )}
      </div>

      {/* Closings this week */}
      <SectionCard
        title={`Closings in the next ${CLOSINGS_STRIP_DAYS} days`}
        action={
          <Link href="/portal/admin/underwriting" className="text-xs font-semibold text-navy hover:text-lime">
            Deals &rarr;
          </Link>
        }
      >
        {deals === null ? (
          <QuietNote>Zoho closings are unavailable right now.</QuietNote>
        ) : closingsStrip.length === 0 ? (
          <QuietNote>No closings scheduled in the next {CLOSINGS_STRIP_DAYS} days.</QuietNote>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {closingsStrip.map(c => {
              const wb = wbByZohoId.get(c.id)
              const openConds = wb ? (condCounts[wb.id] ?? 0) : null
              return (
                <Link
                  key={c.id}
                  href="/portal/admin/underwriting"
                  className="border border-gray-200 rounded-lg px-3 py-2.5 hover:border-lime transition-colors"
                >
                  <p className="text-sm font-body font-semibold text-navy truncate">{c.dealName}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {fmtShortDate(c.closingDate)} &middot; {c.stage}
                  </p>
                  <p className="text-[11px] mt-1">
                    {wb ? (
                      <span className={openConds ? 'text-amber-700' : 'text-green-700'}>
                        {openConds} open condition{openConds === 1 ? '' : 's'}
                      </span>
                    ) : (
                      <span className="text-gray-400">no workbench file</span>
                    )}
                  </p>
                </Link>
              )
            })}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
