// Deal room — one page per workbench deal, assembled from granted tables
// only. Provenance is the product: every value that stores a citation
// renders it. Sections whose tables are not granted to portal_readonly
// (borrowers, income_calcs, ratio_calcs, evidence) say so plainly instead
// of working around the grant; the missing grants are listed in the
// Session 3 completion report for a fox-underwriting follow-up.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/authz'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import {
  getAgentIdByEmail,
  getDealAudit,
  getDealConditions,
  getDealDetail,
  getDealFlags,
  getDealShadowHistory,
  getDealStatementDocs,
  type UwResult,
} from '@/lib/underwriting'
import { fmtDateTime, fmtMoney, fmtShortDate, torontoTodayYMD } from '@/lib/dates'

export const dynamic = 'force-dynamic'

function val<T>(r: UwResult<T> | null): T | null {
  return r && r.configured && r.ok ? r.data : null
}

const label = (s: string) => s.replace(/_/g, ' ')

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

function NotGranted({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-400 font-body">{children}</p>
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

export default async function DealRoomPage({ params }: { params: { id: string } }) {
  await requirePermission('deals.view')

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

  const [condsR, flagsR, stmtDocsR, shadowR, auditR] = await Promise.all([
    getDealConditions(agentId, deal.id),
    getDealFlags(agentId, deal.id),
    getDealStatementDocs(agentId, deal.id),
    getDealShadowHistory(agentId, deal.id),
    getDealAudit(agentId, deal.id, 25),
  ])
  const conds = val(condsR) ?? []
  const flags = val(flagsR) ?? []
  const stmtDocs = val(stmtDocsR) ?? []
  const shadow = val(shadowR) ?? []
  const audit = val(auditR) ?? []

  const today = torontoTodayYMD()
  const openConds = conds.filter(c => c.status !== 'satisfied' && c.status !== 'waived')
  const pendingStmtDocs = stmtDocs.filter(d => d.fields.some(f => f.status === 'extracted'))

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

      <div className="mt-6 space-y-4">
        {/* Borrowers: table not granted */}
        <Section title="Borrowers">
          <NotGranted>
            Borrower identity is not granted to the portal read-only role yet (the borrowers
            table stays workbench-side). When the grant lands, names render here masked exactly
            as stored.
          </NotGranted>
        </Section>

        {/* Ratios and calcs: tables not granted */}
        <Section title="Ratios and calcs">
          <NotGranted>
            Income and ratio calculations are not granted to the portal read-only role yet
            (income_calcs and ratio_calcs). When the grants land, each value renders with the
            calc version and inputs hash the workbench stores beside it. Until then the CLI
            remains the place to read them.
          </NotGranted>
        </Section>

        {/* Statement evidence: granted, provenance visible */}
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
            <p className="text-sm text-gray-400 font-body">No statement extractions on this file.</p>
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

        {/* Conditions */}
        <Section title={`Conditions (${openConds.length} open of ${conds.length})`}>
          {conds.length === 0 ? (
            <p className="text-sm text-gray-400 font-body">No conditions recorded on this file.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-body min-w-[560px]">
                <thead>
                  <tr className="text-left text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                    <th className="py-2 pr-3 font-medium">Condition</th>
                    <th className="py-2 pr-3 font-medium">Owner</th>
                    <th className="py-2 pr-3 font-medium">Due</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {conds.map(c => {
                    const overdue =
                      c.dueDate !== null && c.dueDate < today && c.status !== 'satisfied' && c.status !== 'waived'
                    return (
                      <tr key={c.id} className={`border-b border-gray-50 ${overdue ? 'bg-red-50' : ''}`}>
                        <td className="py-2 pr-3 text-gray-700">
                          {c.condNumber ? `${c.condNumber}. ` : ''}
                          {c.text}
                        </td>
                        <td className="py-2 pr-3 text-gray-500 capitalize">{c.owner}</td>
                        <td className={`py-2 pr-3 ${overdue ? 'text-red-700 font-semibold' : 'text-gray-500'}`}>
                          {c.dueDate ? fmtShortDate(c.dueDate) : 'none'}
                          {overdue ? ' (overdue)' : ''}
                        </td>
                        <td className="py-2">
                          <Chip
                            tone={
                              c.status === 'satisfied' || c.status === 'waived'
                                ? 'green'
                                : c.status === 'evidence_attached'
                                  ? 'amber'
                                  : 'gray'
                            }
                          >
                            {label(c.status)}
                          </Chip>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* Flags with disposition history */}
        <Section title={`Flags (${flags.filter(f => f.status === 'open').length} open of ${flags.length})`}>
          {flags.length === 0 ? (
            <p className="text-sm text-gray-400 font-body">No flags raised on this file.</p>
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
                      .
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
            <p className="text-sm text-gray-400 font-body">
              No shadow scores recorded yet. Score this file from the{' '}
              <Link href="/portal/admin/approvals" className="underline text-navy">
                Approvals shadow queue
              </Link>
              .
            </p>
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

        {/* Notes draft: no notes table exists in the workbench yet */}
        <Section title="Submission notes">
          <NotGranted>
            The workbench does not store generated submission notes in a table yet, so there is
            nothing the read-only role can render here. When a notes table lands and is granted,
            the draft appears read-only with a copy button.
          </NotGranted>
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
            <p className="text-sm text-gray-400 font-body">No audit entries reference this deal yet.</p>
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
