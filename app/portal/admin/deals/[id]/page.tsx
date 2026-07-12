// Deal room — one page per workbench deal, assembled from the granted
// 16-table surface. Provenance is the product: every value that stores a
// citation, calc version, or inputs hash renders it.
//
// Attempt-and-fallback (Session 4 standing rule): every section queries
// its tables and falls back to the not-granted state only on an actual
// permission refusal (42501/HTTP 403) or absence, never as a hardcoded
// placeholder. Grants land in the workbench repo; this page follows.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { can, requirePermission } from '@/lib/authz'
import { isDemoMode } from '@/lib/demo'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { isTerminalWorkbenchDeal } from '@/config/pipeline'
import {
  getAgentIdByEmail,
  getDealAudit,
  getDealBorrowers,
  getDealConditions,
  getDealDetail,
  getDealDocuments,
  getDealFlags,
  getDealIncomeCalcs,
  getDealRatioCalcs,
  getDealShadowHistory,
  getDealStatementDocs,
  getRateQuotesFull,
  isPermissionRefusal,
  type UwResult,
} from '@/lib/underwriting'
import ConditionsPanel from '@/components/admin/ConditionsPanel'
import ComplianceCard from '@/components/admin/ComplianceCard'
import ClientConstraints from '@/components/admin/ClientConstraints'
import { scenarioFromParams, scenarioParamsFromDeal, scenarioVerdict } from '@/lib/scenario'
import { activeConstraints } from '@/lib/constraints'
import { constraintsFor } from '@/lib/constraints-store'
import { dealConstraintCost, costSentence } from '@/lib/constraint-cost'
import { lenderDisplayName } from '@/config/lenders'
import { fmtDateTime, fmtMoney, fmtShortDate, torontoTodayYMD } from '@/lib/dates'

export const dynamic = 'force-dynamic'

function val<T>(r: UwResult<T> | null): T | null {
  return r && r.configured && r.ok ? r.data : null
}

const label = (s: string) => s.replace(/_/g, ' ')

type SectionState<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'not-granted' }
  | { kind: 'error'; message: string }

function sectionState<T>(res: UwResult<T>): SectionState<T> {
  if (res.configured && res.ok) return { kind: 'ok', data: res.data }
  if (isPermissionRefusal(res)) return { kind: 'not-granted' }
  return {
    kind: 'error',
    message: res.configured && !res.ok ? res.error : 'Workbench not connected',
  }
}

function Section({
  title,
  children,
  action,
}: {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
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

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-400 font-body">{children}</p>
}

function SectionFallback({ state, notGrantedCopy }: { state: SectionState<unknown>; notGrantedCopy: string }) {
  if (state.kind === 'not-granted') return <Muted>{notGrantedCopy}</Muted>
  return <Muted>This section did not load: {state.kind === 'error' ? state.message : 'unknown'}. Reload to retry.</Muted>
}

function Chip({ tone, children }: { tone: 'green' | 'amber' | 'red' | 'gray'; children: React.ReactNode }) {
  const cls = {
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-700',
    gray: 'bg-gray-100 text-gray-600',
  }[tone]
  return <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{children}</span>
}

// Calc provenance line: the version and inputs hash the workbench stores
// beside every calculation. Never render a calc stripped of these.
function CalcProvenance({ version, hash, at }: { version: string; hash: string; at: string }) {
  return (
    <p className="text-[11px] text-gray-400 font-body mt-0.5">
      calc {version} · inputs {hash.slice(0, 12)} · {fmtDateTime(at)}
    </p>
  )
}

export default async function DealRoomPage({ params }: { params: { id: string } }) {
  const user = await requirePermission('deals.view')

  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  const agentId = agentRes.configured && agentRes.ok ? agentRes.data : null
  if (!agentId) {
    return (
      <div className="max-w-4xl">
        <h1 className="font-heading text-navy text-2xl font-bold">Deal room</h1>
        <div className="mt-6 bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500 font-body">
            Workbench not available right now. See Status for details.
          </p>
        </div>
      </div>
    )
  }

  const dealRes = await getDealDetail(agentId, params.id)
  const deal = val(dealRes)
  if (dealRes.configured && dealRes.ok && !deal) notFound()
  if (!deal) {
    return (
      <div className="max-w-4xl">
        <h1 className="font-heading text-navy text-2xl font-bold">Deal room</h1>
        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-5">
          <p className="text-sm text-amber-800 font-body">The workbench did not answer for this deal. Reload to retry.</p>
        </div>
      </div>
    )
  }

  const [condsR, flagsR, stmtDocsR, shadowR, auditR, borrowersR, incomeR, ratiosR, documentsR] =
    await Promise.all([
      getDealConditions(agentId, deal.id),
      getDealFlags(agentId, deal.id),
      getDealStatementDocs(agentId, deal.id),
      getDealShadowHistory(agentId, deal.id),
      getDealAudit(agentId, deal.id, 25),
      getDealBorrowers(agentId, deal.id),
      getDealIncomeCalcs(agentId, deal.id),
      getDealRatioCalcs(agentId, deal.id),
      getDealDocuments(agentId, deal.id),
    ])
  const conds = val(condsR) ?? []
  const flags = val(flagsR) ?? []
  const stmtDocs = val(stmtDocsR) ?? []
  const shadow = val(shadowR) ?? []
  const audit = val(auditR) ?? []
  const borrowers = sectionState(borrowersR)
  const income = sectionState(incomeR)
  const ratios = sectionState(ratiosR)
  const documents = sectionState(documentsR)

  const today = torontoTodayYMD()
  const openConds = conds.filter(c => c.status !== 'satisfied' && c.status !== 'waived')
  const openFlags = flags.filter(f => f.status === 'open')
  const pendingStmtDocs = stmtDocs.filter(d => d.fields.some(f => f.status === 'extracted'))
  const terminal = isTerminalWorkbenchDeal(deal)
  // Session 9: demo mode is read-only — hide the condition decision controls
  // (the server also rejects any write with DemoWriteBlocked).
  const canDecideConditions = can(user, 'conditions.decide') && !isDemoMode()

  // Part 4 — suitability documentation: an active client constraint with its
  // reason AND a quantified cost is the documented suitability assessment FSRA
  // names. Fetch the active constraints and compute the cost from the eligible
  // fixed book (province + program filtered), then hand the top one to the
  // compliance card, which counts it toward documented posture.
  const clientKey = deal.zohoPotentialId ?? deal.fileRef
  const constraintsRes = await constraintsFor(clientKey)
  const activeList = activeConstraints(
    constraintsRes.configured && constraintsRes.ok ? constraintsRes.data : [],
  )
  let complianceConstraint: {
    type: (typeof activeList)[number]['type']
    lenderLabel: string
    reason: string
    costSentence: string
    actingEmail: string
    createdAt: string
  } | null = null
  if (activeList.length > 0) {
    const scenario = scenarioFromParams(
      scenarioParamsFromDeal({
        fileRef: deal.fileRef,
        dealType: deal.dealType,
        mortgageAmount: deal.mortgageAmount,
        purchasePrice: deal.purchasePrice,
      }),
    )
    const quotesR = await getRateQuotesFull(agentId)
    const book = quotesR.configured && quotesR.ok ? quotesR.data : []
    const eligibleAll = book
      .filter(q => q.status === 'approved' && q.rateType === 'fixed' && q.rate != null && q.productClass === scenario.productClass)
      .filter(q => scenarioVerdict(q, scenario).category === 'eligible')
      .map(q => ({ lenderSlug: q.lenderSlug, rate: q.rate as number, termMonths: q.termMonths }))
    // Compare like terms: the standard 5-year (60mo) subset, so a 1-year teaser
    // never masquerades as a lender's best against another lender's 5-year.
    const sameTerm = eligibleAll.filter(q => q.termMonths === 60)
    const eligibleFixed = (sameTerm.length > 0 ? sameTerm : eligibleAll).map(q => ({ lenderSlug: q.lenderSlug, rate: q.rate }))
    const cost = dealConstraintCost(eligibleFixed, lenderDisplayName, activeList, deal.mortgageAmount, 25, 60)
    // Documented suitability requires a real trade-off: the constraint actually
    // costs the client something (a non-optimal choice for a stated reason). A
    // zero-cost preference is a note, not a suitability assessment, so it never
    // upgrades the compliance posture. Attribute the cost to the constraint that
    // drives it (the exclusion or requirement), not just the first one recorded.
    if (cost && cost.monthlyDelta > 0) {
      const driver = activeList.find(c => c.type === 'excluded' || c.type === 'required') ?? activeList[0]
      complianceConstraint = {
        type: driver.type,
        lenderLabel: driver.lenderLabel ?? driver.lenderSlug,
        reason: driver.reason,
        costSentence: costSentence(cost),
        actingEmail: driver.actingEmail,
        createdAt: driver.createdAt,
      }
    }
  }

  return (
    <div className="max-w-4xl">
      {/* Snapshot header */}
      <div className="mb-2">
        <Link href="/portal/admin/deals" className="text-xs font-semibold text-gray-400 hover:text-navy">
          &larr; Deals
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-heading text-navy text-2xl font-bold">{deal.fileRef}</h1>
        <Chip tone="gray">{label(deal.dealType)}</Chip>
        {deal.stage && <Chip tone="gray">{label(deal.stage)}</Chip>}
        <Chip tone={deal.status === 'active' ? 'green' : 'gray'}>{deal.status}</Chip>
        {/* Prefill only reads the deals row into rates searchParams; it
            writes nothing anywhere (Session 5 Part 4). */}
        <div className="ml-auto flex items-center gap-2">
          {/* One-tap Call Prep: the agent page auto-sends the prep for
              this file. Reads only; the brief cites its sources. */}
          <Link
            href={`/portal/admin/agent?prep=${encodeURIComponent(deal.fileRef)}`}
            className="text-xs font-bold bg-navy text-white rounded-lg px-3 py-1.5 hover:opacity-90"
            data-testid="prep-call-for-deal"
          >
            Prep a call
          </Link>
          <Link
            href={`/portal/admin/rates?${new URLSearchParams(
              scenarioParamsFromDeal({
                fileRef: deal.fileRef,
                dealType: deal.dealType,
                mortgageAmount: deal.mortgageAmount,
                purchasePrice: deal.purchasePrice,
              }),
            ).toString()}`}
            className="text-xs font-bold bg-lime text-navy rounded-lg px-3 py-1.5 hover:opacity-90"
            data-testid="find-rates-for-deal"
          >
            Find rates for this deal
          </Link>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm font-body">
        <div>
          <p className="text-xs text-gray-400">Mortgage amount</p>
          <p className="text-navy font-semibold">
            {deal.mortgageAmount !== null ? fmtMoney(deal.mortgageAmount) : 'not recorded'}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Purchase price</p>
          <p className="text-navy font-semibold">
            {deal.purchasePrice !== null ? fmtMoney(deal.purchasePrice) : 'not recorded'}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Closing</p>
          <p className="text-navy font-semibold">{deal.closingDate ? fmtShortDate(deal.closingDate) : 'none set'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Lender / product</p>
          <p className="text-navy font-semibold capitalize">
            {deal.lender ?? 'not set'}
            {deal.product ? `, ${deal.product}` : ''}
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs font-body">
        {deal.zohoPotentialId ? (
          <a
            href={`https://crm.zoho.com/crm/org906105026/tab/Potentials/${deal.zohoPotentialId}`}
            target="_blank"
            rel="noreferrer"
            className="text-navy font-semibold underline hover:text-lime"
          >
            Open in Zoho CRM
          </a>
        ) : (
          <span className="text-gray-400">No linked Zoho record</span>
        )}
        <span className="text-gray-400">Workbench updated {fmtDateTime(deal.updatedAt)}</span>
      </div>

      {/* Terminal cleanup note: visible without shouting */}
      {terminal && (openConds.length > 0 || openFlags.length > 0) && (
        <p className="mt-3 text-xs font-body text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          This file is {deal.status !== 'active' ? deal.status : label(deal.stage ?? 'closed')} with{' '}
          {openConds.length > 0
            ? `${openConds.length} condition${openConds.length === 1 ? '' : 's'}`
            : ''}
          {openConds.length > 0 && openFlags.length > 0 ? ' and ' : ''}
          {openFlags.length > 0 ? `${openFlags.length} flag${openFlags.length === 1 ? '' : 's'}` : ''}{' '}
          still open from before closeout. These do not feed the attention rail; clean them up
          here when convenient.
        </p>
      )}

      <div className="mt-6 space-y-4">
        {/* Compliance (Session 6): posture from recorded signals only,
            gaps stated honestly, linked into the module. */}
        <ComplianceCard
          stage={deal.stage}
          status={deal.status}
          conditions={conds}
          flags={flags}
          todayYMD={today}
          constraint={complianceConstraint}
        />

        {/* Client lender constraints (Part 2): per-client rules keyed to a
            stable client key (Zoho potential id, or the file ref when none).
            Reads from FOXCA; recording needs constraints.manage and is refused
            in demo (both enforced server-side). */}
        <ClientConstraints
          clientKey={deal.zohoPotentialId ?? deal.fileRef}
          canManage={can(user, 'constraints.manage')}
        />

        {/* Borrowers (granted 2026-07-09; masked values render exactly as stored) */}
        <Section title="Borrowers">
          {borrowers.kind === 'ok' ? (
            borrowers.data.length === 0 ? (
              <Muted>No borrower rows on this file yet.</Muted>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {borrowers.data.map(b => (
                  <div key={b.id} className="border border-gray-100 rounded-lg p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-body font-semibold text-navy">{b.fullName}</span>
                      <Chip tone="gray">{label(b.role)}</Chip>
                    </div>
                    <p className="text-xs text-gray-500 font-body mt-1">
                      {b.dob ? `DOB ${b.dob}` : 'DOB not recorded'}
                      {b.maritalStatus ? ` · ${label(b.maritalStatus)}` : ''}
                    </p>
                    {b.employment != null && (
                      <details className="mt-1.5">
                        <summary className="text-[11px] text-gray-400 cursor-pointer select-none">
                          employment as stored
                        </summary>
                        <pre className="mt-1 text-[11px] text-gray-600 bg-gray-50 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-words">
                          {JSON.stringify(b.employment, null, 1)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : (
            <SectionFallback
              state={borrowers}
              notGrantedCopy="Borrower identity is not granted to the portal read-only role. When the grant lands, names render here masked exactly as stored."
            />
          )}
        </Section>

        {/* Ratios and calcs (granted 2026-07-09; provenance beside every value) */}
        <Section title="Ratios and calcs">
          {ratios.kind === 'ok' || income.kind === 'ok' ? (
            <div className="space-y-4">
              {ratios.kind === 'ok' &&
                (ratios.data.length === 0 ? (
                  <Muted>No ratio calcs recorded on this file yet.</Muted>
                ) : (
                  <div className="space-y-2">
                    {ratios.data.map(r => (
                      <div key={r.id} className="border border-gray-100 rounded-lg p-3">
                        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm font-body">
                          {r.lenderSlug && <Chip tone="gray">{r.lenderSlug}</Chip>}
                          <span className="text-gray-500">
                            GDS <span className="text-navy font-semibold">{r.gds ?? 'n/a'}</span>
                          </span>
                          <span className="text-gray-500">
                            TDS <span className="text-navy font-semibold">{r.tds ?? 'n/a'}</span>
                          </span>
                          <span className="text-gray-500">
                            LTV <span className="text-navy font-semibold">{r.ltv ?? 'n/a'}</span>
                          </span>
                          <span className="text-gray-500">
                            Qual rate <span className="text-navy font-semibold">{r.qualRate ?? 'n/a'}</span>
                          </span>
                          <span className="text-gray-500">
                            Pmt <span className="text-navy font-semibold">{r.pmtContract !== null ? fmtMoney(r.pmtContract) : 'n/a'}</span>
                            {r.pmtStress !== null ? ` (stress ${fmtMoney(r.pmtStress)})` : ''}
                          </span>
                        </div>
                        <CalcProvenance version={r.calcVersion} hash={r.inputsHash} at={r.createdAt} />
                      </div>
                    ))}
                  </div>
                ))}
              {income.kind === 'ok' &&
                (income.data.length === 0 ? (
                  <Muted>No income calcs recorded on this file yet.</Muted>
                ) : (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Income calcs</h3>
                    {income.data.map(c => (
                      <div key={c.id} className="border border-gray-100 rounded-lg p-3">
                        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm font-body">
                          <span className="text-navy font-semibold">{fmtMoney(c.resultAnnual)}/yr</span>
                          <span className="text-gray-500 capitalize">{label(c.basis)}</span>
                          {c.lenderSlug && <Chip tone="gray">{c.lenderSlug}</Chip>}
                        </div>
                        <CalcProvenance version={c.calcVersion} hash={c.inputsHash} at={c.createdAt} />
                      </div>
                    ))}
                  </div>
                ))}
              {(ratios.kind !== 'ok' || income.kind !== 'ok') && (
                <Muted>
                  {ratios.kind !== 'ok' ? 'Ratio calcs did not load. ' : ''}
                  {income.kind !== 'ok' ? 'Income calcs did not load.' : ''}
                </Muted>
              )}
            </div>
          ) : (
            <SectionFallback
              state={ratios}
              notGrantedCopy="Income and ratio calculations are not granted to the portal read-only role. When the grants land, each value renders with the calc version and inputs hash the workbench stores beside it."
            />
          )}
        </Section>

        {/* Documents (granted 2026-07-09; metadata only) */}
        <Section title="Documents">
          {documents.kind === 'ok' ? (
            documents.data.length === 0 ? (
              <Muted>No documents recorded on this file yet.</Muted>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-body min-w-[480px]">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                      <th className="py-2 pr-3 font-medium">Document</th>
                      <th className="py-2 pr-3 font-medium">Source</th>
                      <th className="py-2 pr-3 font-medium">Received</th>
                      <th className="py-2 font-medium">Review</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.data.map(d => (
                      <tr key={d.id} className="border-b border-gray-50">
                        <td className="py-2 pr-3 text-gray-700 capitalize">{label(d.docType)}</td>
                        <td className="py-2 pr-3 text-gray-500">{d.source}</td>
                        <td className="py-2 pr-3 text-gray-500">
                          {d.receivedAt ? fmtDateTime(d.receivedAt) : 'not recorded'}
                        </td>
                        <td className="py-2">
                          <Chip
                            tone={
                              d.reviewStatus === 'approved'
                                ? 'green'
                                : d.reviewStatus === 'rejected'
                                  ? 'red'
                                  : d.reviewStatus === 'pending'
                                    ? 'amber'
                                    : 'gray'
                            }
                          >
                            {label(d.reviewStatus)}
                          </Chip>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <SectionFallback
              state={documents}
              notGrantedCopy="Document metadata is not granted to the portal read-only role. When the grant lands, the document list renders here (metadata only, never file content)."
            />
          )}
        </Section>

        {/* Statement evidence: provenance visible */}
        <Section
          title="Statement evidence"
          action={
            pendingStmtDocs.length > 0 ? (
              <Link href="/portal/admin/approvals" className="text-xs font-semibold text-navy hover:text-lime">
                {pendingStmtDocs.length} pending in Approvals &rarr;
              </Link>
            ) : undefined
          }
        >
          {stmtDocs.length === 0 ? (
            <Muted>No statement extractions on this file.</Muted>
          ) : (
            <div className="space-y-4">
              {stmtDocs.map(doc => (
                <div key={doc.documentId} className="border border-gray-100 rounded-lg p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-body font-semibold text-navy capitalize">{label(doc.docClass)}</span>
                    {doc.review ? (
                      <Chip tone={doc.review.decision === 'approved' ? 'green' : 'red'}>
                        {doc.review.decision} by {doc.review.decidedBy} {fmtDateTime(doc.review.decidedAt)}
                      </Chip>
                    ) : doc.fields.some(f => f.status === 'extracted') ? (
                      <Chip tone="amber">review pending</Chip>
                    ) : null}
                  </div>
                  <div className="mt-2 divide-y divide-gray-50">
                    {doc.fields.map(f => (
                      <div key={f.id} className="py-1.5">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm font-body">
                          <span className="text-gray-600">{label(f.fieldName)}</span>
                          <span className="text-navy font-semibold">
                            {f.valueNumeric !== null ? f.valueNumeric : f.valueText}
                            {f.unit ? ` ${f.unit}` : ''}
                          </span>
                          <Chip
                            tone={
                              f.status === 'approved'
                                ? 'green'
                                : f.status === 'rejected'
                                  ? 'red'
                                  : f.status === 'extracted'
                                    ? 'amber'
                                    : 'gray'
                            }
                          >
                            {f.status}
                          </Chip>
                          {f.heldReason && <Chip tone="amber">{f.heldReason}</Chip>}
                        </div>
                        <p className="text-[11px] text-gray-500 font-body mt-0.5 break-words">
                          p{f.sourcePage}: &ldquo;{f.sourceSnippet}&rdquo; (conf {f.confidence})
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-gray-400 font-body mt-3">
            Rate sheet reviews are practice-level, not per deal; their history lives on the{' '}
            <Link href="/portal/admin/approvals" className="underline">
              Approvals
            </Link>{' '}
            desk and in the audit log.
          </p>
        </Section>

        {/* Conditions with decisions (Session 4) */}
        <Section title={`Conditions (${openConds.length} open of ${conds.length})`}>
          <ConditionsPanel conditions={conds} canDecide={canDecideConditions} todayYMD={today} />
        </Section>

        {/* Flags with disposition history */}
        <Section title={`Flags (${openFlags.length} open of ${flags.length})`}>
          {flags.length === 0 ? (
            <Muted>No flags raised on this file.</Muted>
          ) : (
            <div className="space-y-3">
              {flags.map(f => (
                <div key={f.id} className="border border-gray-100 rounded-lg p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={f.severity === 'high' ? 'red' : f.severity === 'warning' ? 'amber' : 'gray'}>
                      {f.severity}
                    </Chip>
                    <span className="text-sm font-body font-semibold text-navy capitalize">{label(f.kind)}</span>
                    <Chip tone={f.status === 'open' ? 'amber' : 'green'}>{f.status}</Chip>
                    <span className="text-[11px] text-gray-400 ml-auto">{fmtDateTime(f.createdAt)}</span>
                  </div>
                  {f.status === 'resolved' && (
                    <p className="text-xs font-body text-gray-600 mt-1.5">
                      Dispositioned as <span className="font-semibold">{f.resolution}</span>
                      {f.resolvedAt ? ` ${fmtDateTime(f.resolvedAt)}` : ''}
                      {f.reason ? `: ${f.reason}` : ''}
                    </p>
                  )}
                  {f.status === 'open' && (
                    <p className="text-xs font-body text-gray-500 mt-1.5">
                      Open. Disposition it from the{' '}
                      <Link href="/portal/admin/approvals" className="underline text-navy">
                        Approvals flags queue
                      </Link>
                      {terminal ? ' (listed under closed files there)' : ''}.
                    </p>
                  )}
                  {Object.keys(f.detail).length > 0 && (
                    <details className="mt-1.5">
                      <summary className="text-[11px] text-gray-400 cursor-pointer select-none">flag detail</summary>
                      <pre className="mt-1 text-[11px] text-gray-600 bg-gray-50 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-words">
                        {JSON.stringify(f.detail, null, 1)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Shadow history */}
        <Section title="Shadow scores">
          {shadow.length === 0 ? (
            <Muted>
              No shadow scores recorded yet. Score this file from the{' '}
              <Link href="/portal/admin/approvals" className="underline text-navy">
                Approvals shadow queue
              </Link>
              .
            </Muted>
          ) : (
            <div className="space-y-2">
              {shadow.map(s => (
                <div key={s.id} className="border border-gray-100 rounded-lg p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-body font-semibold text-navy capitalize">{s.dimension}</span>
                    <Chip tone={s.agreement ? 'green' : 'red'}>{s.agreement ? 'agreed' : 'disagreed'}</Chip>
                    <span className="text-[11px] text-gray-400 ml-auto">{fmtDateTime(s.scoredAt)}</span>
                  </div>
                  {s.disagreementNote && (
                    <p className="text-xs font-body text-gray-600 mt-1">{s.disagreementNote}</p>
                  )}
                  {s.systemValue !== null && (
                    <details className="mt-1">
                      <summary className="text-[11px] text-gray-400 cursor-pointer select-none">
                        system value as recorded
                      </summary>
                      <pre className="mt-1 text-[11px] text-gray-600 bg-gray-50 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-words">
                        {JSON.stringify(s.systemValue, null, 1)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Notes: no notes table exists in the workbench yet (report artifacts only) */}
        <Section title="Submission notes">
          <Muted>
            The workbench generates submission notes as report artifacts, not stored rows, so
            there is nothing the read-only role can render here yet. When a notes table lands
            and is granted, the draft appears read-only with a copy button.
          </Muted>
        </Section>

        {/* Deal-scoped audit */}
        <Section
          title="Recent audit entries"
          action={
            <Link href="/portal/admin/audit" className="text-xs font-semibold text-navy hover:text-lime">
              Full audit log &rarr;
            </Link>
          }
        >
          {audit.length === 0 ? (
            <Muted>No audit entries reference this deal yet.</Muted>
          ) : (
            <div className="divide-y divide-gray-50">
              {audit.map(a => (
                <div key={a.id} className="py-2">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm font-body">
                    <span className="text-navy font-semibold">{a.action}</span>
                    <span className="text-xs text-gray-500">
                      {a.actorEmail ? `${a.actorEmail} through the portal` : a.actor}
                    </span>
                    <span className="text-[11px] text-gray-400 ml-auto">{fmtDateTime(a.createdAt)}</span>
                  </div>
                  {a.detail !== null && (
                    <details className="mt-0.5">
                      <summary className="text-[11px] text-gray-400 cursor-pointer select-none">detail</summary>
                      <pre className="mt-1 text-[11px] text-gray-600 bg-gray-50 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-words">
                        {JSON.stringify(a.detail, null, 1)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}
