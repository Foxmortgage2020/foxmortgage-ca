// Audit viewer — the workbench's append-only log given a screen. Reverse
// chronological, filterable, server-paginated, exportable. Gate actions
// taken through the portal show the human's email; CLI and system entries
// show their actor. This is a supervision artifact: entries are never
// edited or deleted, test entries included (they are marked and
// superseded instead).

import Link from 'next/link'
import { requirePermission } from '@/lib/authz'
import { AUDIT_EXPORT_CAP, WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import {
  getAgentIdByEmail,
  getAuditEntries,
  getDealIdByFileRef,
  type AuditFilters,
} from '@/lib/underwriting'
import { fmtDateTime, torontoDayEndISO, torontoDayStartISO } from '@/lib/dates'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

const ACTORS = ['system', 'claude', 'michael', 'portal'] as const

interface AuditSearchParams {
  from?: string
  to?: string
  actor?: string
  action?: string
  deal?: string
  page?: string
}

function buildFilters(sp: AuditSearchParams): { filters: AuditFilters; dealRefMiss: boolean } {
  const ymd = /^\d{4}-\d{2}-\d{2}$/
  const filters: AuditFilters = {}
  if (sp.from && ymd.test(sp.from)) filters.fromISO = torontoDayStartISO(sp.from)
  if (sp.to && ymd.test(sp.to)) filters.toISO = torontoDayEndISO(sp.to)
  if (sp.actor && (ACTORS as readonly string[]).includes(sp.actor)) filters.actor = sp.actor
  if (sp.action?.trim()) filters.actionLike = sp.action.trim().slice(0, 60)
  return { filters, dealRefMiss: false }
}

export default async function AuditPage({ searchParams }: { searchParams: AuditSearchParams }) {
  await requirePermission('audit.view')

  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  const agentId = agentRes.configured && agentRes.ok ? agentRes.data : null

  const page = Math.max(1, Number(searchParams.page) || 1)
  const { filters } = buildFilters(searchParams)

  let dealRefMiss = false
  if (agentId && searchParams.deal?.trim()) {
    const dealRes = await getDealIdByFileRef(agentId, searchParams.deal.trim())
    if (dealRes.configured && dealRes.ok && dealRes.data) filters.dealId = dealRes.data
    else dealRefMiss = true
  }

  const entriesRes =
    agentId && !dealRefMiss
      ? await getAuditEntries(agentId, filters, PAGE_SIZE, (page - 1) * PAGE_SIZE)
      : null
  const entries = entriesRes && entriesRes.configured && entriesRes.ok ? entriesRes.data.rows : []
  const total = entriesRes && entriesRes.configured && entriesRes.ok ? entriesRes.data.total : null
  const totalPages = total !== null ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : null

  const qs = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams()
    const merged: Record<string, string | undefined> = {
      from: searchParams.from,
      to: searchParams.to,
      actor: searchParams.actor,
      action: searchParams.action,
      deal: searchParams.deal,
      ...overrides,
    }
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v)
    return params.toString()
  }

  return (
    <div className="max-w-4xl">
      <div>
        <h1 className="font-heading text-navy text-2xl font-bold">Audit Log</h1>
        <p className="text-gray-500 font-body text-sm mt-1">
          Append-only supervision record from the workbench. Entries are never edited or
          deleted; test entries are marked and superseded, never removed. Portal gate actions
          carry the acting human&rsquo;s identity.{' '}
          <Link href="/portal/admin/audit/view-as" className="text-navy underline hover:text-lime">
            View-as sessions
          </Link>{' '}
          have their own log.
        </p>
      </div>

      {!agentId ? (
        <div className="mt-6 bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500 font-body">
            {!agentRes.configured
              ? 'Workbench not connected. The audit log reads the fox-underwriting project through the read-only role.'
              : 'Workbench is configured but not answering. See Status for details.'}
          </p>
        </div>
      ) : (
        <>
          {/* Filters (plain GET form; the URL is the state) */}
          <form method="GET" className="mt-5 bg-white border border-gray-200 rounded-xl p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-sm font-body">
              <label className="block">
                <span className="text-xs text-gray-400">From</span>
                <input
                  type="date"
                  name="from"
                  defaultValue={searchParams.from ?? ''}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-2.5 py-2"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-400">To</span>
                <input
                  type="date"
                  name="to"
                  defaultValue={searchParams.to ?? ''}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-2.5 py-2"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-400">Actor</span>
                <select
                  name="actor"
                  defaultValue={searchParams.actor ?? ''}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-2.5 py-2 bg-white"
                >
                  <option value="">any</option>
                  {ACTORS.map(a => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-gray-400">Action contains</span>
                <input
                  type="text"
                  name="action"
                  defaultValue={searchParams.action ?? ''}
                  placeholder="statements.doc"
                  className="mt-1 w-full border border-gray-200 rounded-lg px-2.5 py-2"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-400">Deal file ref</span>
                <input
                  type="text"
                  name="deal"
                  defaultValue={searchParams.deal ?? ''}
                  placeholder="BRXM-F053107"
                  className="mt-1 w-full border border-gray-200 rounded-lg px-2.5 py-2"
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className="min-h-[40px] px-4 py-2 rounded-lg text-sm font-semibold font-body bg-navy text-white hover:bg-navy/90"
              >
                Apply filters
              </button>
              <Link href="/portal/admin/audit" className="text-xs font-semibold text-gray-500 hover:text-navy">
                Clear
              </Link>
              <a
                href={`/api/portal/admin/audit/export?${qs({})}`}
                className="ml-auto text-xs font-semibold text-navy underline hover:text-lime"
              >
                Export CSV (first {AUDIT_EXPORT_CAP.toLocaleString('en-CA')} rows of this view)
              </a>
            </div>
          </form>

          {dealRefMiss && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-sm text-amber-800 font-body">
                No workbench deal matches file ref &ldquo;{searchParams.deal}&rdquo;. Check the ref
                and try again.
              </p>
            </div>
          )}

          {entriesRes && (!entriesRes.configured || !entriesRes.ok) && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-sm text-amber-800 font-body">The audit query failed. Reload to retry.</p>
            </div>
          )}

          {/* Entries */}
          <div className="mt-4 bg-white border border-gray-200 rounded-xl">
            {entries.length === 0 ? (
              <p className="text-sm text-gray-500 font-body px-5 py-6">
                No entries match this view.
              </p>
            ) : (
              <div className="divide-y divide-gray-50">
                {entries.map(a => (
                  <div key={a.id} className="px-4 py-2.5">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm font-body">
                      <span className="text-[11px] text-gray-400 tabular-nums w-32 shrink-0">
                        {fmtDateTime(a.createdAt)}
                      </span>
                      <span
                        className={`text-xs font-semibold ${a.actor === 'portal' ? 'text-navy' : 'text-gray-500'}`}
                      >
                        {a.actorEmail ?? a.actor}
                      </span>
                      <span className="text-navy font-semibold">{a.action}</span>
                      {a.dealRef && a.dealId && (
                        <Link
                          href={`/portal/admin/deals/${a.dealId}`}
                          className="text-xs text-gray-500 underline hover:text-navy"
                        >
                          {a.dealRef}
                        </Link>
                      )}
                    </div>
                    {a.detail !== null && (
                      <details>
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
          </div>

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between text-sm font-body">
            <div>
              {page > 1 ? (
                <Link
                  href={`/portal/admin/audit?${qs({ page: String(page - 1) })}`}
                  className="font-semibold text-navy hover:text-lime"
                >
                  &larr; Newer
                </Link>
              ) : (
                <span className="text-gray-300">&larr; Newer</span>
              )}
            </div>
            <p className="text-xs text-gray-400">
              Page {page}
              {totalPages !== null ? ` of ${totalPages}` : ''}
              {total !== null ? ` (${total.toLocaleString('en-CA')} entries)` : ''}
            </p>
            <div>
              {totalPages === null || page < totalPages ? (
                <Link
                  href={`/portal/admin/audit?${qs({ page: String(page + 1) })}`}
                  className="font-semibold text-navy hover:text-lime"
                >
                  Older &rarr;
                </Link>
              ) : (
                <span className="text-gray-300">Older &rarr;</span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
