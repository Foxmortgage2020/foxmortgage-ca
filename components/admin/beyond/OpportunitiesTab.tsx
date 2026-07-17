// The Strategic Mortgage Monitoring engine (the Opportunities board) —
// reparented unchanged as the Beyond funding page's Opportunities tab (B3).
// Reads the latest upload's raw rows from FOXCA, parses and collapses them,
// computes Fox's own opportunity analysis against the gate-approved rate
// book beside the service's figure, and ranks who to call by dollars.
// Everything here is analysis on estimate-labeled monitored data;
// underwriting begins at application.

import Link from 'next/link'
import { can, requirePermission } from '@/lib/authz'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { getAgentIdByEmail, getRateQuotesFull } from '@/lib/underwriting'
import {
  activeOverrides,
  latestOpportunityStatuses,
  rawRowsForUpload,
  recentUploads,
  recordSavingsAnalysisBatch,
  smmStoreConfigured,
  type OverrideRow,
} from '@/lib/smm-store'
import { buildSavingsLogEntry } from '@/lib/savings-log'
import { lenderMethodologyFor, methodologyFromClaim } from '@/lib/lenders'
import { selectIrdBasisClaim } from '@/lib/knowledge-claims'
import { getKnowledgeClaims } from '@/lib/underwriting'
import OverridePanel from '@/components/admin/OverridePanel'
import {
  collapseCoBorrowers,
  diffUploads,
  hasParseFailure,
  isPlaceholder,
  parseSmmRow,
  type FoxAnalysis,
  type SmmMortgage,
} from '@/lib/smm'
import { appearsRenewedEvidenceKey, detectAppearsRenewed, findExportByName, indexMortgagesByName, type BookQuote } from '@/lib/smm-match'
import { bucketRenewals } from '@/lib/renewals'
import { analyzeMortgage, bookQuoteFromRow, comparableKey, overrideCandidates } from '@/lib/smm-analysis'
import { getRenewalDeals } from '@/lib/zoho-admin'
import { recentRenewalEvents } from '@/lib/renewals-store'
import { fmtMoney, torontoTodayYMD } from '@/lib/dates'
import { isDemoMode } from '@/lib/demo'
import SmmUpload from '@/components/admin/SmmUpload'
import OpportunityCard from '@/components/admin/OpportunityCard'

export interface OppView {
  mortgage: SmmMortgage
  analysis: FoxAnalysis
  serviceSavings: number | null
  serviceRelief: number | null
  scenarioHref: string
  prepHref: string
  pdfKey: string // householdId, for the PDF route
  overrideId: string | null
  overrideOptions: { key: string; label: string }[]
}

export default async function OpportunitiesTab() {
  const user = await requirePermission('opportunities.view')
  const todayYMD = torontoTodayYMD()
  const canManage = can(user, 'opportunities.manage') && !isDemoMode()

  if (!smmStoreConfigured()) {
    return (
      <div>
        <Header />
        <div className="bg-white border border-cool-200 rounded-[9px] p-5">
          <p className="text-sm text-cool-600 font-ui">
            The upload store is not connected. Set FOXCA_SUPABASE_URL and FOXCA_SUPABASE_KEY to enable
            the monitoring pipeline.
          </p>
        </div>
      </div>
    )
  }

  const uploadsR = await recentUploads(5)
  const uploads = uploadsR.configured && uploadsR.ok ? uploadsR.data : []
  const current = uploads.find(u => !u.superseded) ?? uploads[0] ?? null
  const prior = uploads.filter(u => u.id !== current?.id)[0] ?? null

  if (!current) {
    return (
      <div className="space-y-5">
        <Header />
        {canManage && <SmmUpload />}
        <div className="bg-white border border-cool-200 rounded-[9px] p-5">
          <p className="text-sm text-cool-600 font-ui">
            No monitoring export uploaded yet. Upload the monthly CSV to build the board.
          </p>
        </div>
      </div>
    )
  }

  // Parse the current batch and (for the delta) the prior batch.
  const [currRowsR, priorRowsR, statusesR] = await Promise.all([
    rawRowsForUpload(current.id),
    prior ? rawRowsForUpload(prior.id) : Promise.resolve(null),
    latestOpportunityStatuses(),
  ])
  const currParsed = (currRowsR.configured && currRowsR.ok ? currRowsR.data : []).map(parseSmmRow)
  const priorParsed = priorRowsR && priorRowsR.configured && priorRowsR.ok ? priorRowsR.data.map(parseSmmRow) : []
  const statuses = new Map(
    (statusesR.configured && statusesR.ok ? statusesR.data : []).map(s => [s.householdId, s]),
  )

  const { mortgages } = collapseCoBorrowers(currParsed)
  const delta = priorParsed.length > 0 ? diffUploads(priorParsed, currParsed) : null

  // Approved rate book for the comparable (server-side, read-only role).
  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  const agentId = agentRes.configured && agentRes.ok ? agentRes.data : null
  const quotesR = agentId ? await getRateQuotesFull(agentId) : null
  const book: BookQuote[] =
    quotesR && quotesR.configured && quotesR.ok ? quotesR.data.map(bookQuoteFromRow) : []

  // Approved LENDER-WIDE ird_comparison_basis knowledge claims (fail-closed
  // selection in selectIrdBasisClaim: program-scoped claims never apply
  // lender-wide): methodologyKnown = hardcoded-table-known OR claim-known,
  // so only lenders the LENDERS table does not cover are looked up (one read
  // per distinct slug, small set). A claim whose basis does not map fails
  // closed in methodologyFromClaim.
  const irdClaimBySlug = new Map<string, { claim_value: unknown; id: string; asOfDate: string | null }>()
  if (agentId) {
    const claimSlugs = Array.from(
      new Set(
        mortgages
          .map(m => m.primary)
          .filter(p => lenderMethodologyFor(p.lender.display) == null && p.lender.slug)
          .map(p => p.lender.slug!),
      ),
    )
    await Promise.all(
      claimSlugs.map(async slug => {
        const r = await getKnowledgeClaims(agentId, slug)
        if (r.configured && r.ok) {
          const claim = selectIrdBasisClaim(r.data)
          if (claim) irdClaimBySlug.set(slug, claim)
        }
      }),
    )
  }
  const irdClaimFor = (p: (typeof mortgages)[number]['primary']) =>
    (p.lender.slug ? irdClaimBySlug.get(p.lender.slug) : undefined) ?? null
  const methodologyFor = (p: (typeof mortgages)[number]['primary']) => {
    const tableKnown = lenderMethodologyFor(p.lender.display) != null
    const claimMethod = tableKnown ? null : methodologyFromClaim(irdClaimFor(p))
    return {
      known: tableKnown || claimMethod != null,
      source: tableKnown ? 'lenders_table' : claimMethod?.source,
    }
  }

  // Michael's active overrides (retire-not-delete store; validated at set
  // time). One read; each household's override drives its analysis.
  const overridesR = await activeOverrides()
  // The list is created_at DESC; keep the FIRST (newest) per household so the
  // board and the PDF route resolve the same override if a concurrency race
  // ever leaves two actives.
  const overrideByHousehold = new Map<string, OverrideRow>()
  for (const o of overridesR.configured && overridesR.ok ? overridesR.data : []) {
    if (!overrideByHousehold.has(o.householdId)) overrideByHousehold.set(o.householdId, o)
  }

  // Build a view per mortgage. Part 1c: transaction type derived from maturity
  // governs the product class and the whole analysis (analyzeMortgage).
  const views: OppView[] = mortgages.map(m => {
    const p = m.primary
    const ovr = overrideByHousehold.get(p.householdId) ?? null
    const { analysis, productClass, transaction } = analyzeMortgage(p, book, todayYMD, {
      override: ovr
        ? {
            type: ovr.overrideType,
            comparable: ovr.comparable as unknown as import('@/lib/smm').Comparable,
            reason: ovr.reason,
            sourceNote: ovr.sourceNote,
          }
        : null,
      methodologyClaim: irdClaimFor(p),
    })
    // The scenario prefill purpose follows the transaction so the Rates page
    // lands on the same class the comparable used.
    const purpose = transaction === 'refinance' ? 'refinance' : 'transfer'
    const scenarioParams = new URLSearchParams({ purpose, am: '25', from: p.householdId })
    if (p.balance) scenarioParams.set('amount', String(Math.round(p.balance)))
    if (p.homeValue) scenarioParams.set('value', String(Math.round(p.homeValue)))
    scenarioParams.set('class', productClass)
    return {
      mortgage: m,
      analysis,
      serviceSavings: p.savingsPotential,
      serviceRelief: p.paymentRelief,
      scenarioHref: `/portal/admin/lenders?${scenarioParams.toString()}`,
      prepHref: `/portal/admin/agent?prep=${encodeURIComponent(`${p.firstName} ${p.lastName}`.trim() || p.fileRef)}`,
      pdfKey: p.householdId,
      overrideId: ovr?.id ?? null,
      // The picker options for a manual override: server-derived, approved +
      // eligible + same tier only. The route re-derives and matches the key,
      // so nothing outside this list can ever be set.
      overrideOptions: overrideCandidates(p, book, todayYMD).map(c => ({
        key: comparableKey(c),
        label: `${c.rateType ?? c.kind} ${c.rate}% · ${c.lender} · ${c.termMonths}mo · sheet ${c.asOf ?? 'n/a'}`,
      })),
    }
  })

  // Reproducibility log (guardrails 1 and 5): the board is a deliverable
  // surface, so each determination it renders lands one append-only row —
  // deduped on (household, surface, calc version, inputs hash), so re-viewing
  // the same board writes nothing new; a new upload, a book change, or a math
  // change writes fresh rows. Demo writes nothing (store-refused).
  const loggedBatch = await recordSavingsAnalysisBatch(
    views.map(v => {
      const methodology = methodologyFor(v.mortgage.primary)
      return buildSavingsLogEntry({
        row: v.mortgage.primary,
        analysis: v.analysis,
        surface: 'board',
        uploadId: current.id,
        actingEmail: user.email,
        todayYMD,
        methodologyKnown: methodology.known,
        methodologySource: methodology.source,
        crossFamilyApproved: false,
      })
    }),
  )
  if (views.length > 0 && (!loggedBatch.configured || !loggedBatch.ok)) {
    console.error('[opportunities] board analysis log batch did not land')
  }

  // ── Appears renewed (Task 2): a household whose Zoho deal the feed
  // contradicts (renewed since the deal closed) is not a call. Suppressed
  // from Act now into its own strip; confirm or decline lives on the
  // Renewals page. Detection scope = EXACTLY the radar's action + lapsed
  // pools, the same deals the Renewals page renders decision cards for — a
  // suppressed household always has its affordance, and a confirmed one
  // (Renewed With Us → resolved) leaves the pools and the strip together.
  // A Zoho read failure suppresses nothing (the analysis is feed-side). ──
  const appearsRenewedHouseholds = new Set<string>()
  try {
    const idx = indexMortgagesByName(mortgages)
    const [rd, eventsR] = await Promise.all([getRenewalDeals(), recentRenewalEvents(500)])
    const declined = new Map<string, string>()
    if (eventsR.configured && eventsR.ok) {
      for (const e of eventsR.data) {
        if (e.action === 'appears_renewed_declined' && !declined.has(e.dealId)) {
          declined.set(e.dealId, typeof e.fields?.evidenceKey === 'string' ? (e.fields.evidenceKey as string) : '')
        }
      }
    }
    const radar = bucketRenewals(rd.withMaturity, todayYMD)
    for (const d of [...radar.action.deals, ...radar.lapsed.deals]) {
      const m = findExportByName(d.contactName, idx)
      if (!m) continue
      const ev = detectAppearsRenewed(
        { closingDate: d.closingDate, lender: d.lenderName, rate: d.mortgageRate, maturity: d.maturityDate },
        m,
      )
      if (!ev) continue
      // A decline clears the flag for THIS evidence only: if the feed later
      // changes (a real renewal), the flag returns.
      if (declined.has(d.id) && declined.get(d.id) === appearsRenewedEvidenceKey(ev)) continue
      appearsRenewedHouseholds.add(m.primary.householdId)
    }
  } catch {
    // No suppression on a failed read; the buckets stand as computed.
  }

  const bucketed = {
    act_now: views.filter(v => v.analysis.bucket === 'act_now' && !appearsRenewedHouseholds.has(v.mortgage.primary.householdId)).sort((a, b) => (b.analysis.netBenefit ?? 0) - (a.analysis.netBenefit ?? 0)),
    appears_renewed: views.filter(v => v.analysis.bucket === 'act_now' && appearsRenewedHouseholds.has(v.mortgage.primary.householdId)),
    review: views.filter(v => v.analysis.bucket === 'review'),
    marginal: views.filter(v => v.analysis.bucket === 'marginal'),
    stay_put: views.filter(v => v.analysis.bucket === 'stay_put'),
    insufficient: views.filter(v => v.analysis.bucket === 'insufficient'),
  }
  const placeholders = currParsed.filter(isPlaceholder).length
  const parseFailures = currParsed.filter(hasParseFailure).length
  const unmapped = Array.from(new Set(currParsed.filter(r => r.lenderRaw && !r.lender.mapped).map(r => r.lenderRaw)))

  return (
    <div className="space-y-5">
      <Header />

      {canManage && <SmmUpload />}

      {/* Batch summary + delta */}
      <div className="bg-white border border-cool-200 rounded-[9px] p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
          <h2 className="font-heading font-bold text-navy text-base">Latest upload</h2>
          <div className="flex items-center gap-2">
            <Link href="/portal/admin/opportunities/backfill" className="text-xs font-semibold text-navy border border-navy/20 rounded-lg px-2.5 py-1 hover:border-navy">
              Backfill Zoho &rarr;
            </Link>
            <Link href="/portal/admin/beyond?tab=renewals" className="text-xs font-semibold text-navy border border-navy/20 rounded-lg px-2.5 py-1 hover:border-navy">
              Lapsed reconciliation &rarr;
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm font-ui">
          <Stat label="Mortgages" value={String(mortgages.length)} sub={`${current.rawRowCount} raw rows, ${current.collapsedCount ?? 0} collapsed`} />
          <Stat label="Act now" value={String(bucketed.act_now.length)} sub="calls to make" tone="good" />
          <Stat label="Insufficient data" value={String(bucketed.insufficient.length)} sub={`${placeholders} placeholder, ${parseFailures} parse fail`} tone={placeholders + parseFailures > 0 ? 'warn' : undefined} />
          <Stat label="Unmapped lenders" value={String(unmapped.length)} sub={unmapped.length ? unmapped.slice(0, 2).join(', ') : 'all resolved'} tone={unmapped.length ? 'warn' : undefined} />
        </div>
        {delta && (
          <p className="text-xs font-ui text-cool-600 mt-3 border-t border-cool-100 pt-2">
            Since the prior upload: {delta.newOpportunities.length} new, {delta.improved.length} improved,{' '}
            {delta.resolved.length} resolved, {delta.departed.length} left the export.
          </p>
        )}
        {!agentId && (
          <p className="text-xs font-ui text-amber-700 mt-2">
            The approved rate book is not connected, so Fox&apos;s comparison cannot compute; the service figure still shows.
          </p>
        )}
      </div>

      <Bucket title="Act now" tone="good" hint="Positive net benefit after the penalty, ranked by dollars. These are calls." views={bucketed.act_now} statuses={statuses} uploadId={current.id} canManage={canManage} />

      {bucketed.appears_renewed.length > 0 && (
        <section>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="w-2.5 h-2.5 rounded-full bg-violet-500" />
            <h2 className="font-heading font-bold text-navy text-lg">Appears renewed</h2>
            <span className="text-sm font-ui text-cool-600">{bucketed.appears_renewed.length} files, held out of Act now</span>
          </div>
          <p className="text-xs font-ui text-violet-800 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
            The monitoring feed says these clients renewed since their Zoho deal closed, so a switch call
            now is the wrong call. Confirm or clear each one on the{' '}
            <Link href="/portal/admin/beyond?tab=renewals" className="underline font-semibold">Renewals page</Link>; they return
            to the buckets once decided.{' '}
            {bucketed.appears_renewed.map(v => `${v.mortgage.primary.firstName} ${v.mortgage.primary.lastName}`.trim() || v.mortgage.primary.fileRef).join(', ')}.
          </p>
        </section>
      )}

      <Bucket title="Needs review" tone="amber" hint="The export balance does not reconcile with the mortgage schedule. A prepayment, a payment change, or bad vendor data can cause this; both figures and the drift show on the card. Confirm with the lender before any number is stated." views={bucketed.review} statuses={statuses} uploadId={current.id} canManage={canManage} />
      <Bucket title="Marginal" tone="amber" hint="Near break-even. Worth watching, not worth a client's disruption." views={bucketed.marginal} statuses={statuses} uploadId={current.id} canManage={canManage} />
      <Bucket title="Stay put" tone="gray" hint="The client is in the right product. Still a touchpoint worth making." views={bucketed.stay_put} statuses={statuses} uploadId={current.id} canManage={canManage} />
      <Bucket title="Insufficient data" tone="gray" hint="Placeholders, parse failures, or a missing rate. Groomable, never analyzed." views={bucketed.insufficient} statuses={statuses} uploadId={current.id} canManage={canManage} />
    </div>
  )
}

function Header() {
  return (
    <p className="font-ui text-sm text-cool-600">
      The monitoring export as a pipeline: who to call, by dollars, with Fox&apos;s analysis beside
      the service&apos;s figure. Analysis on monitored data; underwriting begins at application.
    </p>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'warn' }) {
  return (
    <div className="border border-cool-100 rounded-lg px-3 py-2 bg-cool-50">
      <p className="text-[11px] font-ui text-cool-500 uppercase tracking-wide">{label}</p>
      <p className={`font-heading font-bold text-lg ${tone === 'good' ? 'text-green-700' : tone === 'warn' ? 'text-amber-700' : 'text-navy'}`}>{value}</p>
      {sub && <p className="text-[11px] font-ui text-cool-600 mt-0.5">{sub}</p>}
    </div>
  )
}

function Bucket({
  title,
  tone,
  hint,
  views,
  statuses,
  uploadId,
  canManage,
}: {
  title: string
  tone: 'good' | 'amber' | 'gray'
  hint: string
  views: OppView[]
  statuses: Map<string, { status: string; actingEmail: string }>
  uploadId: string
  canManage: boolean
}) {
  return (
    <section>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className={`w-2.5 h-2.5 rounded-full ${tone === 'good' ? 'bg-green-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-cool-300'}`} />
        <h2 className="font-heading font-bold text-navy text-lg">{title}</h2>
        <span className="text-sm font-ui text-cool-600">{views.length} files</span>
      </div>
      <p className="text-xs font-ui text-cool-500 mb-3">{hint}</p>
      {views.length === 0 ? (
        <p className="text-sm text-cool-500 font-ui">Nothing here right now.</p>
      ) : (
        <div className="space-y-2">
          {views.map(v => (
            <OpportunityCard
              key={v.mortgage.key}
              householdId={v.pdfKey}
              uploadId={uploadId}
              name={`${v.mortgage.primary.firstName} ${v.mortgage.primary.lastName}`.trim() || v.mortgage.primary.fileRef}
              extraBorrowers={v.mortgage.borrowers.length - 1}
              rate={v.mortgage.primary.rate}
              rateType={v.mortgage.primary.rateType}
              lender={v.mortgage.primary.lender.display}
              balance={v.mortgage.primary.balance}
              maturity={v.mortgage.primary.maturityDate}
              analysis={v.analysis}
              serviceSavings={v.serviceSavings}
              serviceRelief={v.serviceRelief}
              scenarioHref={v.scenarioHref}
              prepHref={v.prepHref}
              status={statuses.get(v.pdfKey)?.status ?? null}
              canManage={canManage}
              overrideId={v.overrideId}
              overrideOptions={v.overrideOptions}
            />
          ))}
        </div>
      )}
    </section>
  )
}
