// The Intel engine (Session 4) — reparented unchanged as the Lenders
// page's Intel tab (B3), read-only from lender_intel_items. The workbench
// owns the intel lifecycle; this surface never marks, mutates, or
// re-triages anything. Items that produced a rate sheet review show the
// review's outcome. Filter links carry tab=intel so state stays on the tab.

import Link from 'next/link'
import { requirePermission } from '@/lib/authz'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { getAgentIdByEmail, getIntelItems, type UwResult } from '@/lib/underwriting'
import { fmtDateTime } from '@/lib/dates'
import LenderMark from '@/components/admin/LenderMark'
import { lenderDisplayName } from '@/config/lenders'

function val<T>(r: UwResult<T> | null): T | null {
  return r && r.configured && r.ok ? r.data : null
}

const label = (s: string) => s.replace(/_/g, ' ')

export default async function IntelTab({
  searchParams,
}: {
  searchParams: { lender?: string; kind?: string }
}) {
  await requirePermission('intel.view')

  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  const agentId = agentRes.configured && agentRes.ok ? agentRes.data : null

  if (!agentId) {
    return (
      <div>
        <Header />
        <div className="mt-4 bg-white border border-cool-200 rounded-[9px] p-5">
          <p className="text-sm text-cool-600 font-ui">
            {!agentRes.configured
              ? 'Workbench not connected. The intel feed reads lender_intel_items through the read-only role.'
              : 'Workbench is configured but not answering. See Status for details.'}
          </p>
        </div>
      </div>
    )
  }

  const itemsR = await getIntelItems(agentId)
  const allItems = val(itemsR) ?? []

  const lenders = Array.from(
    new Set(allItems.map(i => i.lenderSlugGuess).filter((s): s is string => Boolean(s))),
  ).sort()
  const kinds = Array.from(new Set(allItems.map(i => i.itemKind))).sort()

  const lenderFilter = searchParams.lender?.trim() || null
  const kindFilter = searchParams.kind?.trim() || null
  const items = allItems
    .filter(i => (lenderFilter ? i.lenderSlugGuess === lenderFilter : true))
    .filter(i => (kindFilter ? i.itemKind === kindFilter : true))

  const filterHref = (next: { lender?: string | null; kind?: string | null }) => {
    const qs = new URLSearchParams({ tab: 'intel' })
    const lender = next.lender === undefined ? lenderFilter : next.lender
    const kind = next.kind === undefined ? kindFilter : next.kind
    if (lender) qs.set('lender', lender)
    if (kind) qs.set('kind', kind)
    return `/portal/admin/lenders?${qs.toString()}`
  }

  const pill = (active: boolean) =>
    `text-xs font-semibold px-3 py-2 rounded-full border ${
      active ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-cool-250 hover:border-navy/40'
    }`

  return (
    <div>
      <Header />

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link href={filterHref({ lender: null })} className={pill(!lenderFilter)}>
          All lenders
        </Link>
        {lenders.map(l => (
          <Link key={l} href={filterHref({ lender: l })} className={pill(lenderFilter === l)}>
            {l}
          </Link>
        ))}
        <span className="text-cool-300">|</span>
        <Link href={filterHref({ kind: null })} className={pill(!kindFilter)}>
          All sources
        </Link>
        {kinds.map(k => (
          <Link key={k} href={filterHref({ kind: k })} className={pill(kindFilter === k)}>
            {k}
          </Link>
        ))}
      </div>

      {/* Feed */}
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <div className="bg-white border border-cool-200 rounded-[9px] px-4 py-6 text-center">
            <p className="text-sm text-cool-600 font-ui">No intel items match this view.</p>
          </div>
        ) : (
          items.map(item => (
            <div key={item.id} className="bg-white border border-cool-200 rounded-[9px] p-4">
              <div className="flex flex-wrap items-center gap-2">
                {item.lenderSlugGuess ? (
                  <span className="flex items-center gap-1.5">
                    <LenderMark slug={item.lenderSlugGuess} size={22} />
                    <span className="text-sm font-ui font-semibold text-navy">
                      {lenderDisplayName(item.lenderSlugGuess)}
                    </span>
                  </span>
                ) : (
                  <span className="text-sm font-ui font-semibold text-cool-500">unidentified lender</span>
                )}
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-cool-100 text-cool-700">
                  {item.itemKind}
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-cool-100 text-cool-700 capitalize">
                  {label(item.docClassGuess)}
                </span>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    item.status === 'new'
                      ? 'bg-amber-100 text-amber-800'
                      : item.status === 'ignored'
                        ? 'bg-cool-100 text-cool-500'
                        : 'bg-green-100 text-green-700'
                  }`}
                >
                  {item.status}
                </span>
                <span className="text-[11px] text-cool-500 ml-auto">{fmtDateTime(item.receivedAt)}</span>
              </div>
              {item.fileName && <p className="text-xs font-ui text-cool-700 mt-1.5">{item.fileName}</p>}
              {item.messageText && (
                <p className="text-xs font-ui text-cool-600 mt-1 break-words">{item.messageText}</p>
              )}
              {item.review && (
                <p className="text-xs font-ui mt-2">
                  <span
                    className={`font-semibold ${item.review.decision === 'approved' ? 'text-green-700' : 'text-red-600'}`}
                  >
                    Sheet {item.review.decision}
                  </span>{' '}
                  <span className="text-cool-600">
                    ({item.review.quotesTotal} quotes) {fmtDateTime(item.review.decidedAt)}
                  </span>{' '}
                  <Link
                    href="/portal/admin/audit?action=rates.sheet"
                    className="text-navy underline hover:text-ink"
                  >
                    outcome in the audit log
                  </Link>
                </p>
              )}
            </div>
          ))
        )}
      </div>

      <p className="text-xs text-cool-500 font-ui mt-4">
        Read-only: the workbench owns the intel lifecycle. Lender names here are ingest guesses
        until a sheet review confirms them.
      </p>
    </div>
  )
}

function Header() {
  return (
    <p className="font-ui text-sm text-cool-600">
      Lender intel from Roam ingest, reverse-chronological, with the review outcome where an
      item produced one.
    </p>
  )
}
