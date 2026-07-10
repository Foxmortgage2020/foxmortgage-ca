// Intel — the lender intel feed (Session 4), read-only from
// lender_intel_items. The workbench owns the intel lifecycle; this page
// never marks, mutates, or re-triages anything. Items that produced a
// rate sheet review show the review's outcome.

import Link from 'next/link'
import { requirePermission } from '@/lib/authz'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { getAgentIdByEmail, getIntelItems, type UwResult } from '@/lib/underwriting'
import { fmtDateTime } from '@/lib/dates'

export const dynamic = 'force-dynamic'

function val<T>(r: UwResult<T> | null): T | null {
  return r && r.configured && r.ok ? r.data : null
}

const label = (s: string) => s.replace(/_/g, ' ')

export default async function IntelPage({
  searchParams,
}: {
  searchParams: { lender?: string; kind?: string }
}) {
  await requirePermission('intel.view')

  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  const agentId = agentRes.configured && agentRes.ok ? agentRes.data : null

  if (!agentId) {
    return (
      <div className="max-w-4xl">
        <Header />
        <div className="mt-6 bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500 font-body">
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
    const qs = new URLSearchParams()
    const lender = next.lender === undefined ? lenderFilter : next.lender
    const kind = next.kind === undefined ? kindFilter : next.kind
    if (lender) qs.set('lender', lender)
    if (kind) qs.set('kind', kind)
    const s = qs.toString()
    return s ? `/portal/admin/intel?${s}` : '/portal/admin/intel'
  }

  const pill = (active: boolean) =>
    `text-xs font-semibold px-3 py-2 rounded-full border ${
      active ? 'bg-navy text-white border-navy' : 'bg-white text-navy border-gray-200 hover:border-navy/40'
    }`

  return (
    <div className="max-w-4xl">
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
        <span className="text-gray-200">|</span>
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
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-6 text-center">
            <p className="text-sm text-gray-500 font-body">No intel items match this view.</p>
          </div>
        ) : (
          items.map(item => (
            <div key={item.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-body font-semibold text-navy">
                  {item.lenderSlugGuess ?? 'unidentified lender'}
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  {item.itemKind}
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
                  {label(item.docClassGuess)}
                </span>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    item.status === 'new'
                      ? 'bg-amber-100 text-amber-800'
                      : item.status === 'ignored'
                        ? 'bg-gray-100 text-gray-500'
                        : 'bg-green-100 text-green-700'
                  }`}
                >
                  {item.status}
                </span>
                <span className="text-[11px] text-gray-400 ml-auto">{fmtDateTime(item.receivedAt)}</span>
              </div>
              {item.fileName && <p className="text-xs font-body text-gray-600 mt-1.5">{item.fileName}</p>}
              {item.messageText && (
                <p className="text-xs font-body text-gray-500 mt-1 break-words">{item.messageText}</p>
              )}
              {item.review && (
                <p className="text-xs font-body mt-2">
                  <span
                    className={`font-semibold ${item.review.decision === 'approved' ? 'text-green-700' : 'text-red-600'}`}
                  >
                    Sheet {item.review.decision}
                  </span>{' '}
                  <span className="text-gray-500">
                    ({item.review.quotesTotal} quotes) {fmtDateTime(item.review.decidedAt)}
                  </span>{' '}
                  <Link
                    href="/portal/admin/audit?action=rates.sheet"
                    className="text-navy underline hover:text-lime"
                  >
                    outcome in the audit log
                  </Link>
                </p>
              )}
            </div>
          ))
        )}
      </div>

      <p className="text-xs text-gray-400 font-body mt-4">
        Read-only: the workbench owns the intel lifecycle. Lender names here are ingest guesses
        until a sheet review confirms them.
      </p>
    </div>
  )
}

function Header() {
  return (
    <div>
      <h1 className="font-heading text-navy text-2xl font-bold">Intel</h1>
      <p className="text-gray-500 font-body text-sm mt-1">
        Lender intel from Roam ingest, reverse-chronological, with the review outcome where an
        item produced one.
      </p>
    </div>
  )
}
