'use client'

// Lender knowledge index: every lender with its profile as-of date. Stale
// knowledge is worse than no knowledge, so anything older than 90 days is
// flagged visibly. Draft profiles carry their red-pen caveat; a withheld
// machine profile says so instead of pretending.

import Link from 'next/link'
import { useKnowledgeFetch } from '@/lib/knowledge-client'
import { isStaleAsOf, KNOWLEDGE_STALE_DAYS } from '@/lib/knowledge'
import type { KnowledgeLenderSummary } from '@/lib/gates'
import LenderMark from '@/components/admin/LenderMark'

export default function KnowledgeIndex({ todayYMD }: { todayYMD: string }) {
  const { data, error, loading, retry } = useKnowledgeFetch<{ lenders: KnowledgeLenderSummary[] }>(
    '/api/portal/admin/knowledge/lenders',
  )

  if (loading) return <p className="text-sm text-cool-400 font-ui py-4">Loading the knowledge base…</p>
  if (error) {
    return (
      <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <p className="text-sm text-amber-800 font-ui">Knowledge base unavailable: {error}</p>
        <button onClick={retry} className="shrink-0 text-sm font-semibold text-amber-800 underline py-1.5">
          Retry
        </button>
      </div>
    )
  }
  const lenders = data?.lenders ?? []
  if (lenders.length === 0) {
    return <p className="text-sm text-cool-400 font-ui py-4">No lender knowledge files are bundled yet.</p>
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {lenders.map(l => {
        const stale = isStaleAsOf(l.as_of, todayYMD)
        return (
          <Link
            key={l.slug}
            href={`/portal/admin/knowledge/${l.slug}`}
            className="block bg-white border border-cool-200 rounded-xl p-4 hover:border-navy/40 transition-colors"
          >
            <div className="flex flex-wrap items-center gap-2">
              <LenderMark slug={l.slug} name={l.name} size={26} />
              <h2 className="font-heading font-bold text-navy text-base">{l.name}</h2>
              <span className="text-[11px] text-cool-400 uppercase">{l.slug}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {l.as_of ? (
                <span className="text-xs font-ui text-cool-500">profile as of {l.as_of}</span>
              ) : (
                <span className="text-xs font-ui text-cool-500">machine profile withheld by design</span>
              )}
              {stale && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                  stale: older than {KNOWLEDGE_STALE_DAYS} days
                </span>
              )}
              {l.draft && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                  draft: red-pen review pending
                </span>
              )}
              {!l.has_profile && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-cool-100 text-cool-600">
                  notes only
                </span>
              )}
            </div>
          </Link>
        )
      })}
    </div>
  )
}
