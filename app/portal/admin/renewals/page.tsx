// The Renewal Radar. Every funded deal with a maturity date, bucketed by
// window. Read-only from Zoho; status writes go through the confirmed-action
// route. The buckets are the product: Lapsed is an alarm, not a status.
//
// Reconciles live (2026-07-12): Lapsed 18 files, Action 8 / $4,368,600,
// Monitoring 0, Watching 22, Resolved 0; renewal book $17.95M under
// management; 6 funded deals have no maturity date.

import Link from 'next/link'
import { can, requirePermission } from '@/lib/authz'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { getRenewalDeals } from '@/lib/zoho-admin'
import { getAgentIdByEmail, getDealsSummary, getRateQuotesFull, getRenewalSequenceStates, type RenewalSequenceState } from '@/lib/underwriting'
import {
  RENEWAL_ACTIONS,
  appearsRenewedPending,
  bestApprovedFixed,
  bucketRenewals,
  daysToMaturity,
  hasNoOutcome,
  paymentShock,
  renewalBook,
  type ApprovedFixedQuote,
  type RenewalDeal,
} from '@/lib/renewals'
import { isDemoMode } from '@/lib/demo'
import { fmtMoney, fmtMoneyCompact, fmtShortDate, torontoTodayYMD } from '@/lib/dates'
import { recentUploads, rawRowsForUpload, smmStoreConfigured } from '@/lib/smm-store'
import { recentRenewalEvents } from '@/lib/renewals-store'
import { collapseCoBorrowers, parseSmmRow, type SmmMortgage } from '@/lib/smm'
import {
  appearsRenewedEvidenceKey,
  findExportByName,
  indexMortgagesByName,
  reconcileLapsed,
  retentionSummary,
  type Reconciliation,
} from '@/lib/smm-match'
import RenewalCard from '@/components/admin/RenewalCard'
import AppearsRenewedCard from '@/components/admin/AppearsRenewedCard'

export const dynamic = 'force-dynamic'

const zohoDealUrl = (id: string) => `https://crm.zoho.com/crm/org906105026/tab/Potentials/${id}`
const prepHrefFor = (d: RenewalDeal) =>
  `/portal/admin/agent?prep=${encodeURIComponent(d.contactName ?? d.dealName)}`
const ALL_ACTIONS = Object.values(RENEWAL_ACTIONS)

export default async function RenewalsPage() {
  const user = await requirePermission('renewals.view')
  const todayYMD = torontoTodayYMD()

  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  const agentId = agentRes.configured && agentRes.ok ? agentRes.data : null

  // Drip sequence state per Zoho deal (renewal-drip session, 2026-07-16):
  // a chip on each card + the queue link in the header.
  const dripRes = agentId ? await getRenewalSequenceStates(agentId) : isDemoMode() ? await getRenewalSequenceStates('demo') : null
  const dripStates: RenewalSequenceState[] = dripRes && dripRes.configured && dripRes.ok ? dripRes.data : []
  const dripByZoho = new Map(dripStates.map((s) => [s.zohoDealId, s]))
  const dripLabel = (zohoId: string): string | null => {
    const st = dripByZoho.get(zohoId)
    if (!st) return null
    if (st.status === 'active') {
      return st.nextTouch
        ? `drip active · next ${st.nextTouch.skeletonId.replace('touch-', '')}d (${st.nextTouch.status.replace(/_/g, ' ')})`
        : 'drip active'
    }
    return `drip ${st.status}${st.exitReason ? ` (${st.exitReason.replace(/_/g, ' ')})` : ''}`
  }
  const dripPending = dripStates.filter((s) => s.nextTouch?.status === 'pending_approval' || s.nextTouch?.status === 'held').length

  let renewals
  try {
    renewals = await getRenewalDeals()
  } catch {
    renewals = null
  }

  const [quotesR, wbDealsR] = await Promise.all([
    agentId ? getRateQuotesFull(agentId) : Promise.resolve(null),
    agentId ? getDealsSummary(agentId) : Promise.resolve(null),
  ])

  if (!renewals) {
    return (
      <div className="max-w-3xl">
        <Header dripPending={dripPending} />
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500 font-body">
            The Zoho read failed, so the radar cannot compute right now. Reload in a moment; nothing
            here caches a stale figure.
          </p>
        </div>
      </div>
    )
  }

  // Best approved fixed rate for the payment-shock benchmark (read-only role).
  const quotes: ApprovedFixedQuote[] =
    quotesR && quotesR.configured && quotesR.ok
      ? quotesR.data.map(q => ({
          rate: q.rate,
          rateType: q.rateType,
          termMonths: q.termMonths,
          asOfDate: q.asOfDate,
          status: q.status,
          lenderSlug: q.lenderSlug,
          borrowerRequirement: q.borrowerRequirement,
          clientCommitment: q.clientCommitment,
          channelRequirement: q.channelRequirement,
          transactionTypes: q.transactionTypes,
          eligibilityUnknown: q.eligibilityUnknown,
          eligibilitySource: q.eligibilitySource,
        }))
      : []
  const best = bestApprovedFixed(quotes)

  // Workbench deal room links, matched by Zoho id (same join Home uses).
  const wbByZohoId = new Map<string, string>()
  if (wbDealsR && wbDealsR.configured && wbDealsR.ok) {
    for (const d of wbDealsR.data) if (d.zohoPotentialId) wbByZohoId.set(d.zohoPotentialId, d.id)
  }

  const buckets = bucketRenewals(renewals.withMaturity, todayYMD)
  const book = renewalBook(renewals.withMaturity, todayYMD)
  const canDecide = can(user, 'renewals.decide') && !isDemoMode()

  // ── The latest monitoring export, loaded once: it powers both the
  // appears-renewed detection (action + lapsed pools) and the lapsed
  // reconciliation. Name-indexed in memory; no per-deal Zoho call. ──
  let exportIdx: Map<string, SmmMortgage | null> | null = null
  let hasExport = false
  if (smmStoreConfigured()) {
    try {
      const uploadsR = await recentUploads(3)
      const uploads = uploadsR.configured && uploadsR.ok ? uploadsR.data : []
      const currentUpload = uploads.find(u => !u.superseded) ?? uploads[0] ?? null
      if (currentUpload) {
        const rowsR = await rawRowsForUpload(currentUpload.id)
        if (rowsR.configured && rowsR.ok) {
          hasExport = true
          const { mortgages } = collapseCoBorrowers(rowsR.data.map(parseSmmRow))
          exportIdx = indexMortgagesByName(mortgages)
        }
      }
    } catch {
      exportIdx = null
    }
  }

  // ── Appears renewed: the feed contradicts the deal's recorded terms (a
  // start date materially past the closing date, a different lender, a
  // different rate). Those files are SUPPRESSED from the action pools and the
  // lapsed alarm pending Michael's confirm or decline — reclassified, never
  // deleted. Declines persist in the renewal events store. ──
  const declined = new Map<string, string>()
  try {
    const eventsR = await recentRenewalEvents(500)
    if (eventsR.configured && eventsR.ok) {
      for (const e of eventsR.data) {
        if (e.action === 'appears_renewed_declined' && !declined.has(e.dealId)) {
          declined.set(e.dealId, typeof e.fields?.evidenceKey === 'string' ? (e.fields.evidenceKey as string) : '')
        }
      }
    }
  } catch {
    // A store outage means no declines load; files re-flag, which is the
    // conservative direction.
  }
  // The pending list comes from the SAME shared walk the Desk count layer
  // uses (lib/renewals.ts appearsRenewedPending), so the Waiting-on-you
  // strip reconciles with this page by construction.
  const appearsRenewed = appearsRenewedPending(buckets, exportIdx, declined)
  const flaggedIds = new Set(appearsRenewed.map(x => x.deal.id))
  // Pre-suppression totals, so the delta (what was phantom) is visible.
  const beforeAction = { count: buckets.action.count, volume: buckets.action.volume }
  const beforeLapsed = { count: buckets.lapsed.count, volume: buckets.lapsed.volume }
  for (const k of ['action', 'lapsed'] as const) {
    buckets[k].deals = buckets[k].deals.filter(d => !flaggedIds.has(d.id))
    buckets[k].count = buckets[k].deals.length
    buckets[k].volume = buckets[k].deals.reduce((s, d) => s + d.amount, 0)
  }
  const suppressedVolume = appearsRenewed.reduce((s, x) => s + x.deal.amount, 0)

  const lapsedNoOutcome = buckets.lapsed.deals.filter(hasNoOutcome)
  const lapsedNoOutcomeVol = lapsedNoOutcome.reduce((s, d) => s + d.amount, 0)

  // ── Lapsed reconciliation against the latest monitoring export (post
  // suppression: an appears-renewed file is already explained). Classifies
  // each lapsed deal still-with-lender (recoverable auto-renewal),
  // lender-changed (moved; won or lost unknown), or unmonitored (not in the
  // export). Never computes from a stale figure — the recon only flags
  // conflicts; it does not overwrite. ──
  const recons: { deal: RenewalDeal; recon: Reconciliation }[] =
    exportIdx && buckets.lapsed.deals.length > 0
      ? buckets.lapsed.deals.map(d => ({
          deal: d,
          recon: reconcileLapsed(
            { lender: d.lenderName, rate: d.mortgageRate, maturity: d.maturityDate },
            findExportByName(d.contactName, exportIdx!),
          ),
        }))
      : []
  const retention = retentionSummary(recons.map(r => r.recon))

  const cardProps = (d: RenewalDeal, tone: 'red' | 'amber' | 'gray' | 'green') => ({
    deal: d,
    shock: paymentShock(d, best),
    daysRemaining: d.maturityDate ? daysToMaturity(d.maturityDate, todayYMD) : null,
    tone,
    prepHref: prepHrefFor(d),
    dealHref: wbByZohoId.has(d.id) ? `/portal/admin/deals/${wbByZohoId.get(d.id)}` : null,
    zohoHref: zohoDealUrl(d.id),
    canDecide,
    actions: ALL_ACTIONS,
    dripState: dripLabel(d.id),
  })

  return (
    <div className="max-w-4xl space-y-6">
      <Header dripPending={dripPending} />

      {/* ── Missing maturity: the block that must reach empty ── */}
      {renewals.missingMaturity.length > 0 ? (
        <div className="border-2 border-red-300 bg-red-50 rounded-xl p-5">
          <h2 className="font-heading font-bold text-red-800 text-base">
            {renewals.missingMaturity.length} funded deal
            {renewals.missingMaturity.length === 1 ? '' : 's'} have no maturity date and cannot be
            tracked for renewal
          </h2>
          <p className="text-xs font-body text-red-700 mt-1 mb-3">
            Invisible to every part of this system until a maturity date is backfilled from the
            commitment. This block persists until it is empty.
          </p>
          <div className="space-y-1">
            {renewals.missingMaturity.map(d => (
              <div key={d.id} className="flex items-center justify-between gap-3 text-xs font-body border-t border-red-200 py-1.5">
                <span className="text-navy truncate">{d.contactName ?? d.dealName}</span>
                <span className="flex items-center gap-3 shrink-0">
                  <span className="text-gray-600">{fmtMoney(d.amount)}</span>
                  <a href={zohoDealUrl(d.id)} target="_blank" rel="noreferrer" className="text-red-700 font-semibold underline">
                    backfill in Zoho
                  </a>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="border border-green-200 bg-green-50 rounded-xl px-4 py-3">
          <p className="text-sm text-green-800 font-body">
            Every funded deal has a maturity date. The renewal system can see them all.
          </p>
        </div>
      )}

      {/* ── Renewal book KPI ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-heading font-bold text-navy text-base mb-3">Renewal book</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <BookStat label="Book under management" value={fmtMoney(book.underManagement.volume)} sub={`${book.underManagement.count} funded files not yet matured`} />
          <BookStat label="Maturing next 12 months" value={fmtMoney(book.maturingNext12.volume)} sub={`${book.maturingNext12.count} files`} />
          <BookStat label="Lapsed" value={fmtMoney(book.lapsed.volume)} sub={`${book.lapsed.count} files`} tone={book.lapsed.count > 0 ? 'bad' : undefined} />
        </div>
      </div>

      {/* ── Lapsed: the alarm. Non-collapsible, sorted by amount. ── */}
      <section>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <h2 className="font-heading font-bold text-red-700 text-lg">Lapsed</h2>
          <span className="text-sm font-body text-red-700 font-semibold">
            {buckets.lapsed.count} files · {fmtMoney(buckets.lapsed.volume)}
          </span>
        </div>
        <p className="text-xs font-body text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
          Matured with no recorded outcome. This is a system failure, not a status.{' '}
          {lapsedNoOutcome.length > 0 && (
            <>
              {lapsedNoOutcome.length} of these ({fmtMoney(lapsedNoOutcomeVol)}) have no renewal
              outcome recorded at all.
            </>
          )}
        </p>
        {buckets.lapsed.count === 0 ? (
          <p className="text-sm text-gray-400 font-body">No lapsed renewals. Every matured file has an outcome.</p>
        ) : (
          <div className="space-y-2">
            {buckets.lapsed.deals.map(d => (
              <RenewalCard key={d.id} {...cardProps(d, 'red')} />
            ))}
          </div>
        )}
      </section>

      {/* ── Lapsed reconciliation against the monitoring export ── */}
      {buckets.lapsed.deals.length > 0 && (
        <LapsedReconciliation recons={recons} retention={retention} hasExport={hasExport} zohoDealUrl={zohoDealUrl} />
      )}

      {/* ── Appears renewed: the feed contradicts the CRM. Suppressed from the
          pools above and below pending Michael's confirm or decline. ── */}
      {appearsRenewed.length > 0 && (
        <section>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="w-2.5 h-2.5 rounded-full bg-violet-500" />
            <h2 className="font-heading font-bold text-navy text-lg">Appears renewed</h2>
            <span className="text-sm font-body text-gray-500">
              {appearsRenewed.length} files · {fmtMoney(suppressedVolume)}
            </span>
          </div>
          <p className="text-xs font-body text-violet-800 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2 mb-3">
            The monitoring export contradicts what Zoho recorded for these files (a newer start date, a
            different lender, or a different rate): the client looks renewed already. They are held out
            of Action now and Lapsed pending confirmation. Before this pass, Action now read{' '}
            {beforeAction.count} files ({fmtMoney(beforeAction.volume)}) and Lapsed read {beforeLapsed.count}{' '}
            files ({fmtMoney(beforeLapsed.volume)}); {fmtMoney(suppressedVolume)} of that was phantom.
          </p>
          <div className="space-y-2">
            {appearsRenewed.map(({ deal, evidence, from }) => (
              <AppearsRenewedCard
                key={deal.id}
                dealId={deal.id}
                dealName={deal.contactName ?? deal.dealName}
                amount={deal.amount}
                from={from}
                evidence={evidence}
                evidenceKey={appearsRenewedEvidenceKey(evidence)}
                zohoHref={zohoDealUrl(deal.id)}
                canDecide={canDecide}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Action now (0-130 days) ── */}
      <BucketSection title="Action now" tone="amber" hint="Zero to 130 days to maturity. The 120-day rate-hold window opens inside this. Michael must engage." bucket={buckets.action} cardProps={cardProps} cardTone="amber" />

      {/* ── Monitoring (130-150 days) ── */}
      <BucketSection title="Monitoring" tone="gray" hint="130 to 150 days out. The Strategic Mortgage Monitoring drip should be running here." bucket={buckets.monitoring} cardProps={cardProps} cardTone="amber" />

      {/* ── Watching (150+ days): compact, visibility only ── */}
      <section>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="w-2.5 h-2.5 rounded-full bg-gray-300" />
          <h2 className="font-heading font-bold text-navy text-lg">Watching</h2>
          <span className="text-sm font-body text-gray-500">
            {buckets.watching.count} files · {fmtMoney(buckets.watching.volume)}
          </span>
        </div>
        <p className="text-xs font-body text-gray-400 mb-2">150+ days out. Visibility only, no action.</p>
        {buckets.watching.count === 0 ? (
          <p className="text-sm text-gray-400 font-body">Nothing further out on the book.</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-x-auto">
            {buckets.watching.deals.map(d => (
              <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-2 text-xs font-body min-w-[440px]">
                <span className="text-navy truncate flex-1">{d.contactName ?? d.dealName}</span>
                <span className="text-gray-500 w-20 text-right">{fmtMoneyCompact(d.amount)}</span>
                <span className="text-gray-500 w-24 text-right">{fmtShortDate(d.maturityDate)}</span>
                <span className="text-gray-400 w-16 text-right">
                  {d.maturityDate ? `${daysToMaturity(d.maturityDate, todayYMD)}d` : ''}
                </span>
                <a href={zohoDealUrl(d.id)} target="_blank" rel="noreferrer" className="text-navy hover:text-lime shrink-0">
                  Zoho
                </a>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Resolved ── */}
      <section>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
          <h2 className="font-heading font-bold text-navy text-lg">Resolved</h2>
          <span className="text-sm font-body text-gray-500">
            {buckets.resolved.count} files · {fmtMoney(buckets.resolved.volume)}
          </span>
        </div>
        {buckets.resolved.count === 0 ? (
          <p className="text-sm text-gray-400 font-body">
            No renewals resolved yet. An outcome lands here once a renewal is marked renewed elsewhere,
            no longer needed, or opted out.
          </p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
            {buckets.resolved.deals.map(d => (
              <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-2 text-xs font-body">
                <span className="text-navy truncate">{d.contactName ?? d.dealName}</span>
                <span className="flex items-center gap-3 shrink-0">
                  <span className="text-gray-500">{fmtMoneyCompact(d.amount)}</span>
                  <span className="text-green-700 font-semibold">{d.renewalStatus ?? 'opted out'}</span>
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] font-body text-gray-400 mt-2">
          A won renewal records as Renewed With Us (the picklist value arrived 2026-07-13); it, renewed
          elsewhere, no longer needs, and opted out all resolve a file here.
        </p>
      </section>
    </div>
  )
}

function Header({ dripPending }: { dripPending: number }) {
  return (
    <div className="mb-1">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="font-heading text-navy text-2xl font-bold">Renewals</h1>
        <Link
          href="/portal/admin/renewals/drip"
          className="text-xs font-semibold text-navy underline decoration-gray-300 hover:decoration-navy"
        >
          Renewal Drip{dripPending > 0 ? ` · ${dripPending} waiting` : ''}
        </Link>
      </div>
      <p className="text-gray-500 font-body text-sm mt-1">
        Every funded deal by maturity window. The payment shock is why a client answers the phone;
        the buckets are why none of them slips again.
      </p>
    </div>
  )
}

function LapsedReconciliation({
  recons,
  retention,
  hasExport,
  zohoDealUrl,
}: {
  recons: { deal: RenewalDeal; recon: Reconciliation }[]
  retention: ReturnType<typeof retentionSummary>
  hasExport: boolean
  zohoDealUrl: (id: string) => string
}) {
  if (!hasExport) {
    return (
      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-heading font-bold text-navy text-base mb-1">Lapsed reconciliation</h2>
        <p className="text-sm font-body text-gray-500">
          Upload a Strategic Mortgage Monitoring export on the{' '}
          <Link href="/portal/admin/opportunities" className="text-navy underline hover:text-lime">Opportunities</Link>{' '}
          page to reconcile these lapsed files against what the monitoring service still sees.
        </p>
      </section>
    )
  }
  const recoverable = recons.filter(r => r.recon.recoverable)
  const recoverableVol = recoverable.reduce((s, r) => s + r.deal.amount, 0)
  const retentionPct = retention.total > 0 ? Math.round((retention.stillWithLender / retention.total) * 100) : null
  const label: Record<string, { text: string; cls: string }> = {
    still_with_lender: { text: 'still with lender', cls: 'text-green-700 bg-green-50 border-green-200' },
    lender_changed: { text: 'lender changed', cls: 'text-amber-800 bg-amber-50 border-amber-200' },
    unmonitored: { text: 'unmonitored', cls: 'text-gray-600 bg-gray-50 border-gray-200' },
  }
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <h2 className="font-heading font-bold text-navy text-base">Lapsed reconciliation</h2>
        <span className="text-xs font-body text-gray-500">
          reconciled against the latest monitoring export by borrower name
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <BookStat label="Still with lender" value={String(retention.stillWithLender)} sub={`${fmtMoney(recoverableVol)} recoverable`} tone={undefined} />
        <BookStat label="Lender changed" value={String(retention.lenderChanged)} sub="won or lost — unknown" />
        <BookStat label="Unmonitored" value={String(retention.unmonitored)} sub="not in the export" />
        <BookStat label="Retention signal" value={retentionPct == null ? 'n/a' : `${retentionPct}%`} sub="still with lender / matched" />
      </div>
      <p className="text-xs font-body text-gray-500 mb-3">
        Still-with-lender past maturity is almost certainly an automatic lender renewal &mdash; recoverable, and the
        highest-value calls on the board. Lender-changed means the client moved; the data cannot say whether the deal was
        written or lost. Conflicts below are flagged, never overwritten.
      </p>
      <div className="border border-gray-100 rounded-lg divide-y divide-gray-100 overflow-x-auto">
        {recons.map(({ deal, recon }) => (
          <div key={deal.id} className="flex items-start justify-between gap-3 px-3 py-2 text-xs font-body min-w-[520px]">
            <div className="flex-1 min-w-0">
              <span className="text-navy font-semibold">{deal.contactName ?? deal.dealName}</span>
              <span className="text-gray-400"> · {fmtMoneyCompact(deal.amount)}</span>
              {recon.conflicts.length > 0 && (
                <div className="mt-0.5 text-amber-800">
                  {recon.conflicts.map(c => (
                    <span key={c.field} className="mr-2">
                      {c.field}: Zoho <span className="font-semibold">{c.zohoValue}</span> vs export{' '}
                      <span className="font-semibold">{c.exportValue}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <span className="flex items-center gap-2 shrink-0">
              <span className={`px-2 py-0.5 rounded border text-[11px] font-semibold ${label[recon.reconClass].cls}`}>
                {label[recon.reconClass].text}
              </span>
              <a href={zohoDealUrl(deal.id)} target="_blank" rel="noreferrer" className="text-navy hover:text-lime">Zoho</a>
            </span>
          </div>
        ))}
      </div>
      <p className="text-[11px] font-body text-gray-400 mt-2">
        Matching is by borrower name; a name the export does not carry reconciles as unmonitored. A conflict never
        triggers a write &mdash; resolve it in Zoho, or from the Opportunities backfill where the CRM field is empty.
      </p>
    </section>
  )
}

function BookStat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'bad' }) {
  return (
    <div className="border border-gray-100 rounded-lg px-3 py-2 bg-gray-50/50">
      <p className="text-[11px] font-body text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`font-heading font-bold text-lg ${tone === 'bad' ? 'text-red-600' : 'text-navy'}`}>{value}</p>
      <p className="text-[11px] font-body text-gray-500 mt-0.5">{sub}</p>
    </div>
  )
}

function BucketSection({
  title,
  tone,
  hint,
  bucket,
  cardProps,
  cardTone,
}: {
  title: string
  tone: 'amber' | 'gray'
  hint: string
  bucket: { deals: RenewalDeal[]; count: number; volume: number }
  cardProps: (d: RenewalDeal, t: 'red' | 'amber' | 'gray' | 'green') => any
  cardTone: 'amber' | 'gray'
}) {
  return (
    <section>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className={`w-2.5 h-2.5 rounded-full ${tone === 'amber' ? 'bg-amber-500' : 'bg-gray-300'}`} />
        <h2 className="font-heading font-bold text-navy text-lg">{title}</h2>
        <span className="text-sm font-body text-gray-500">
          {bucket.count} files · {fmtMoney(bucket.volume)}
        </span>
      </div>
      <p className="text-xs font-body text-gray-400 mb-3">{hint}</p>
      {bucket.count === 0 ? (
        <p className="text-sm text-gray-400 font-body">Nothing in this window right now.</p>
      ) : (
        <div className="space-y-2">
          {bucket.deals.map(d => (
            <RenewalCard key={d.id} {...cardProps(d, cardTone)} />
          ))}
        </div>
      )}
    </section>
  )
}
