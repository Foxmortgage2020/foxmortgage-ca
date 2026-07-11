'use client'

// One lender's knowledge page: the markdown rendered in the house style,
// the profile's structured figures with their as-of dates beside them,
// active offers, and the approved-quote link into the rates browser.
// A draft profile carries its caveat; a withheld profile (MCAP) states
// the withholding instead of inventing figures.

import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useKnowledgeFetch } from '@/lib/knowledge-client'
import { isStaleAsOf, KNOWLEDGE_STALE_DAYS, profileFigureRows, profileKnownGaps } from '@/lib/knowledge'
import type { KnowledgeLenderDetail } from '@/lib/gates'
import PromoCountdowns from '@/components/admin/PromoCountdowns'
import LenderMark from '@/components/admin/LenderMark'

// House-style markdown mapping: navy headings, readable body, bordered
// GFM tables that scroll inside their own container on phones.
const MD_COMPONENTS = {
  h1: (p: any) => <h2 className="font-heading text-navy font-bold text-lg mt-6 mb-2" {...p} />,
  h2: (p: any) => <h3 className="font-heading text-navy font-bold text-base mt-5 mb-2" {...p} />,
  h3: (p: any) => <h4 className="font-heading text-navy font-bold text-sm mt-4 mb-1.5" {...p} />,
  p: (p: any) => <p className="text-sm font-body text-gray-700 leading-relaxed my-2" {...p} />,
  ul: (p: any) => <ul className="list-disc pl-5 my-2 space-y-1" {...p} />,
  ol: (p: any) => <ol className="list-decimal pl-5 my-2 space-y-1" {...p} />,
  li: (p: any) => <li className="text-sm font-body text-gray-700 leading-relaxed" {...p} />,
  strong: (p: any) => <strong className="font-semibold text-navy" {...p} />,
  code: (p: any) => <code className="text-[12px] bg-gray-100 rounded px-1 py-0.5" {...p} />,
  a: (p: any) => <a className="text-navy underline hover:text-lime" target="_blank" rel="noreferrer" {...p} />,
  table: (p: any) => (
    <div className="overflow-x-auto my-3">
      <table className="w-full text-sm font-body border border-gray-200" {...p} />
    </div>
  ),
  th: (p: any) => (
    <th className="text-left text-xs text-gray-500 uppercase tracking-wide border border-gray-200 bg-gray-50 px-2 py-1.5" {...p} />
  ),
  td: (p: any) => <td className="border border-gray-100 px-2 py-1.5 text-gray-700 align-top" {...p} />,
  blockquote: (p: any) => <blockquote className="border-l-2 border-lime pl-3 my-2 text-gray-600" {...p} />,
  hr: () => <hr className="my-4 border-gray-200" />,
}

export default function LenderKnowledge({
  slug,
  todayYMD,
  approvedQuoteCount,
}: {
  slug: string
  todayYMD: string
  approvedQuoteCount: number | null
}) {
  const { data, error, loading, retry } = useKnowledgeFetch<KnowledgeLenderDetail>(
    `/api/portal/admin/knowledge/lenders/${encodeURIComponent(slug)}`,
  )

  if (loading) return <p className="text-sm text-gray-400 font-body py-4">Loading lender knowledge…</p>
  if (error || !data) {
    return (
      <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <p className="text-sm text-amber-800 font-body">
          {error?.includes('Not found') ? 'No knowledge file exists for this lender slug.' : `Lender knowledge unavailable: ${error}`}
        </p>
        <button onClick={retry} className="shrink-0 text-sm font-semibold text-amber-800 underline py-1.5">
          Retry
        </button>
      </div>
    )
  }

  const stale = isStaleAsOf(data.as_of, todayYMD)
  const figures = profileFigureRows(data.profile)
  const gaps = profileKnownGaps(data.profile)

  return (
    <div className="space-y-4">
      {/* Header chips */}
      <div className="flex flex-wrap items-center gap-2">
        <LenderMark slug={data.slug} name={data.name} size={34} />
        <h1 className="font-heading text-navy text-2xl font-bold">{data.name}</h1>
        {data.as_of && <span className="text-xs font-body text-gray-500">profile as of {data.as_of}</span>}
        {stale && (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
            stale: older than {KNOWLEDGE_STALE_DAYS} days
          </span>
        )}
      </div>

      {data.draft && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-sm text-amber-800 font-body">
            Draft profile: the red-pen review is pending. Verify any figure against the source
            before quoting it to a client or lender.
          </p>
        </div>
      )}

      {/* Structured figures with their as-of dates */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-heading text-navy font-bold text-base mb-3">Structured figures</h2>
        {data.profile === null ? (
          <p className="text-sm text-gray-500 font-body">
            The machine profile for this lender is deliberately withheld; the notes below are the
            knowledge. No figures are invented here.
          </p>
        ) : figures.length === 0 ? (
          <p className="text-sm text-gray-400 font-body">The profile carries no figure entries yet.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {figures.map((f, i) => (
              <div key={i} className="py-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="text-xs font-body text-gray-500 capitalize">{f.path}</span>
                <span className="text-sm font-body font-semibold text-navy break-words">{f.value}</span>
                <span className="text-[11px] text-gray-400 ml-auto">
                  {f.asOf ? `as of ${f.asOf}` : 'context'}
                  {f.source ? ` · ${f.source}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
        {gaps.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Known gaps</p>
            <ul className="list-disc pl-5 space-y-0.5">
              {gaps.map((g, i) => (
                <li key={i} className="text-xs font-body text-gray-500">
                  {g}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Offers and rates cross-links */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-navy font-bold text-base">Active offers</h2>
          <Link
            href={`/portal/admin/rates?lender=${encodeURIComponent(data.slug)}`}
            className="text-xs font-semibold text-navy hover:text-lime"
          >
            {approvedQuoteCount !== null ? `${approvedQuoteCount} approved quotes in Rates` : 'Rates'} &rarr;
          </Link>
        </div>
        <PromoCountdowns lenderSlug={data.slug} />
      </div>

      {/* The knowledge markdown, verbatim content in house styling */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-heading text-navy font-bold text-base mb-1">Notes</h2>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS as any}>
          {data.markdown}
        </ReactMarkdown>
      </div>

      <p className="text-xs text-gray-400 font-body">
        This content is git-versioned in the workbench repo and updates ship with its deploys.
        Every figure keeps its as-of date; never quote one without it.
      </p>
    </div>
  )
}
