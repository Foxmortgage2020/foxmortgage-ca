// Deals — every workbench deal for the practice, with the Zoho stage
// joined beside the workbench state where zoho_potential_id matches
// (the Session 1 join approach). Default sort: closing date. Filters:
// stage, has open flags. Each row opens the deal room.

import Link from 'next/link'
import { requirePermission } from '@/lib/authz'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import {
  getAgentIdByEmail,
  getDealsSummary,
  getOpenConditionCounts,
  getOpenFlagCountsByDeal,
  getShadowScoredDimCounts,
  type UwResult,
} from '@/lib/underwriting'
import { getAllDealsSlim, type SlimDeal } from '@/lib/zoho-admin'
import { fmtShortDate } from '@/lib/dates'

export const dynamic = 'force-dynamic'

function val<T>(r: UwResult<T> | null): T | null {
  return r && r.configured && r.ok ? r.data : null
}

export default async function DealsPage({
  searchParams,
}: {
  searchParams: { stage?: string; flags?: string }
}) {
  await requirePermission('deals.view')

  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  const agentId = agentRes.configured && agentRes.ok ? agentRes.data : null

  if (!agentRes.configured || !agentId) {
    return (
      <div className="max-w-5xl">
        <Header />
        <div className="mt-6 bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500 font-body">
            {!agentRes.configured
              ? 'Workbench not connected. The deal list reads the fox-underwriting project through the read-only role.'
              : 'Workbench is configured but not answering. See Status for details.'}
          </p>
        </div>
      </div>
    )
  }

  const [wbDealsR, condCountsR, flagCountsR, shadowDimsR, zohoDeals] = await Promise.all([
    getDealsSummary(agentId),
    getOpenConditionCounts(agentId),
    getOpenFlagCountsByDeal(agentId),
    getShadowScoredDimCounts(agentId),
    getAllDealsSlim().catch(() => null),
  ])

  const wbDeals = val(wbDealsR) ?? []
  const condCounts = val(condCountsR) ?? {}
  const flagCounts = val(flagCountsR) ?? {}
  const shadowDims = val(shadowDimsR) ?? {}

  const zohoById = new Map<string, SlimDeal>()
  if (zohoDeals) for (const d of zohoDeals) zohoById.set(d.id, d)

  const stages = Array.from(
    new Set(wbDeals.map(d => d.stage).filter((s): s is string => Boolean(s))),
  ).sort()

  const stageFilter = searchParams.stage?.trim() || null
  const flagsOnly = searchParams.flags === 'open'

  const rows = wbDeals
    .filter(d => (stageFilter ? d.stage === stageFilter : true))
    .filter(d => (flagsOnly ? (flagCounts[d.id] ?? 0) > 0 : true))
    .sort((a, b) => {
      if (!a.closingDate && !b.closingDate) return 0
      if (!a.closingDate) return 1
      if (!b.closingDate) return -1
      return a.closingDate.localeCompare(b.closingDate)
    })

  const filterHref = (next: { stage?: string | null; flags?: boolean }) => {
    const qs = new URLSearchParams()
    const stage = next.stage === undefined ? stageFilter : next.stage
    const flags = next.flags === undefined ? flagsOnly : next.flags
    if (stage) qs.set('stage', stage)
    if (flags) qs.set('flags', 'open')
    const s = qs.toString()
    return s ? `/portal/admin/deals?${s}` : '/portal/admin/deals'
  }

  return (
    <div className="max-w-5xl">
      <Header />

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link
          href={filterHref({ stage: null })}
          className={`text-xs font-semibold px-3 py-2 rounded-full border ${
            !stageFilter ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-gray-200 hover:border-navy/40'
          }`}
        >
          All stages
        </Link>
        {stages.map(s => (
          <Link
            key={s}
            href={filterHref({ stage: s })}
            className={`text-xs font-semibold px-3 py-2 rounded-full border capitalize ${
              stageFilter === s ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-gray-200 hover:border-navy/40'
            }`}
          >
            {s.replace(/_/g, ' ')}
          </Link>
        ))}
        <Link
          href={filterHref({ flags: !flagsOnly })}
          className={`text-xs font-semibold px-3 py-2 rounded-full border ${
            flagsOnly ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-navy border-gray-200 hover:border-navy/40'
          }`}
        >
          Open flags only
        </Link>
      </div>

      {zohoDeals === null && (
        <p className="text-xs text-amber-700 font-body mt-3">
          Zoho is unreachable right now, so the CRM stage column shows unavailable.
        </p>
      )}

      {/* List */}
      <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-hidden">
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500 font-body px-5 py-6">
            No workbench deals match this view.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-body min-w-[720px]">
              <thead>
                <tr className="text-left text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <th className="py-2.5 px-4 font-medium">File</th>
                  <th className="py-2.5 px-2 font-medium">Workbench stage</th>
                  <th className="py-2.5 px-2 font-medium">Zoho stage</th>
                  <th className="py-2.5 px-2 font-medium">Closing</th>
                  <th className="py-2.5 px-2 font-medium text-right">Open conditions</th>
                  <th className="py-2.5 px-2 font-medium text-right">Open flags</th>
                  <th className="py-2.5 px-4 font-medium">Shadow</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(d => {
                  const zoho = d.zohoPotentialId ? zohoById.get(d.zohoPotentialId) : undefined
                  const conds = condCounts[d.id] ?? 0
                  const flags = flagCounts[d.id] ?? 0
                  const dims = shadowDims[d.id] ?? 0
                  return (
                    <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2.5 px-4">
                        <Link href={`/portal/admin/deals/${d.id}`} className="text-navy font-semibold hover:text-lime">
                          {d.fileRef}
                        </Link>
                        {d.status !== 'active' && (
                          <span className="ml-2 text-[10px] font-semibold text-gray-400 uppercase">{d.status}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-gray-600 capitalize">
                        {d.stage ? d.stage.replace(/_/g, ' ') : 'not set'}
                      </td>
                      <td className="py-2.5 px-2 text-gray-600">
                        {zoho ? zoho.stage : zohoDeals === null ? 'unavailable' : d.zohoPotentialId ? 'no match' : 'not linked'}
                      </td>
                      <td className="py-2.5 px-2 text-gray-600">
                        {d.closingDate ? fmtShortDate(d.closingDate) : 'none set'}
                      </td>
                      <td className={`py-2.5 px-2 text-right font-semibold ${conds > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                        {conds}
                      </td>
                      <td className={`py-2.5 px-2 text-right font-semibold ${flags > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                        {flags}
                      </td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                            dims >= 4
                              ? 'bg-green-100 text-green-700'
                              : dims > 0
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          shadow {dims}/4
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-400 font-body mt-3">
        Shadow n/4 counts the dimensions Michael has scored against the system on that file. The
        whole workbench runs in shadow until the agreement streak earns trust.
      </p>
    </div>
  )
}

function Header() {
  return (
    <div>
      <h1 className="font-heading text-navy text-2xl font-bold">Deals</h1>
      <p className="text-gray-500 font-body text-sm mt-1">
        Every workbench file with its Zoho stage beside the workbench state. Sorted by closing
        date; rows open the deal room.
      </p>
    </div>
  )
}
