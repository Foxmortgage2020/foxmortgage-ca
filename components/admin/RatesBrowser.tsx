'use client'

// The rates browser: every current approved quote in a dense filterable
// table, straight from the granted workbench tables. Columns render what
// the rate_quotes schema actually carries; nothing is invented. Superseded
// quotes sit behind a toggle, clearly marked, because rate history answers
// "what did we have last month" questions.
//
// Session 6: rate_type is identity. Fixed rows print their rate;
// adjustable and variable rows print their discount (P−1.05 style) with
// the effective rate beside it when the prime reference is loaded, and the
// honest prime-unavailable state when it is not. Cash back tiers are their
// own rows with a chip; program conditions ride the row as a tooltip and
// an expandable line.

import { useMemo, useState } from 'react'
import type { RateQuoteBrowserRow } from '@/lib/underwriting'
import {
  RATE_TYPES,
  RATE_TYPE_LABEL,
  fmtDiscount,
  quoteEffectiveRate,
  quoteRateDisplay,
  type RatesReference,
} from '@/lib/scenario'

const label = (s: string) => s.replace(/_/g, ' ')

function termLabel(months: number): string {
  return months % 12 === 0 ? `${months / 12} yr` : `${months} mo`
}

function rateCell(q: RateQuoteBrowserRow, reference: RatesReference | null): React.ReactNode {
  const d = quoteRateDisplay(q, reference)
  switch (d.kind) {
    case 'fixed':
      return <>{d.rate.toFixed(2)}%</>
    case 'floating-printed':
      return (
        <>
          {d.discount !== null ? `${fmtDiscount(d.discount)} ` : ''}
          <span className="text-gray-500 font-normal">({d.rate.toFixed(2)}% printed)</span>
        </>
      )
    case 'floating-computed':
      return (
        <>
          {fmtDiscount(d.discount)}{' '}
          <span
            className="text-gray-500 font-normal"
            title={`Effective ${d.effective.toFixed(2)}% at prime ${d.primeValue.toFixed(2)}% as of ${d.primeAsOf}${d.overridden ? ' (lender prime)' : ''}`}
          >
            (eff {d.effective.toFixed(2)}%)
          </span>
        </>
      )
    case 'floating-no-prime':
      return (
        <>
          {fmtDiscount(d.discount)}{' '}
          <span className="text-gray-400 font-normal">(prime unavailable)</span>
        </>
      )
    case 'unpriced':
      return <span className="text-gray-400">not priced</span>
  }
}

export default function RatesBrowser({
  quotes,
  initialLender,
  reference = null,
}: {
  quotes: RateQuoteBrowserRow[]
  initialLender?: string
  reference?: RatesReference | null
}) {
  const [lender, setLender] = useState(initialLender ?? '')
  const [term, setTerm] = useState('')
  const [product, setProduct] = useState('')
  const [rateType, setRateType] = useState('')
  const [showSuperseded, setShowSuperseded] = useState(false)

  const lenders = useMemo(() => Array.from(new Set(quotes.map(q => q.lenderSlug))).sort(), [quotes])
  const terms = useMemo(
    () => Array.from(new Set(quotes.map(q => q.termMonths))).sort((a, b) => a - b),
    [quotes],
  )
  const products = useMemo(() => Array.from(new Set(quotes.map(q => q.productClass))).sort(), [quotes])

  const rows = useMemo(
    () =>
      quotes
        .filter(q => (showSuperseded ? true : q.status === 'approved'))
        .filter(q => (lender ? q.lenderSlug === lender : true))
        .filter(q => (term ? String(q.termMonths) === term : true))
        .filter(q => (product ? q.productClass === product : true))
        .filter(q => (rateType ? q.rateType === rateType : true))
        .sort((a, b) => {
          if (a.lenderSlug !== b.lenderSlug) return a.lenderSlug.localeCompare(b.lenderSlug)
          if (a.termMonths !== b.termMonths) return a.termMonths - b.termMonths
          // Effective rate where computable; floating rows the reference
          // cannot price sort after, deepest discount first.
          const ea = quoteEffectiveRate(a, reference)
          const eb = quoteEffectiveRate(b, reference)
          if (ea !== null && eb !== null && ea !== eb) return ea - eb
          if (ea === null && eb !== null) return 1
          if (ea !== null && eb === null) return -1
          return (a.primeVariance ?? 0) - (b.primeVariance ?? 0)
        }),
    [quotes, lender, term, product, rateType, showSuperseded, reference],
  )

  const approvedShown = rows.filter(r => r.status === 'approved').length
  const supersededShown = rows.length - approvedShown

  const selectCls =
    'border border-gray-200 rounded-lg px-2.5 py-2 text-sm font-body bg-white focus:outline-none focus:border-navy/50'

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={lender} onChange={e => setLender(e.target.value)} className={selectCls} aria-label="Lender">
          <option value="">All lenders</option>
          {lenders.map(l => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select value={term} onChange={e => setTerm(e.target.value)} className={selectCls} aria-label="Term">
          <option value="">All terms</option>
          {terms.map(t => (
            <option key={t} value={String(t)}>
              {termLabel(t)}
            </option>
          ))}
        </select>
        <select value={product} onChange={e => setProduct(e.target.value)} className={selectCls} aria-label="Product">
          <option value="">All products</option>
          {products.map(p => (
            <option key={p} value={p}>
              {label(p)}
            </option>
          ))}
        </select>
        <select
          value={rateType}
          onChange={e => setRateType(e.target.value)}
          className={selectCls}
          aria-label="Rate type"
          data-testid="table-rate-type-filter"
        >
          <option value="">All rate types</option>
          {RATE_TYPES.map(t => (
            <option key={t} value={t}>
              {RATE_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm font-body text-gray-600 min-h-[40px] px-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showSuperseded}
            onChange={e => setShowSuperseded(e.target.checked)}
            className="accent-[#032133]"
          />
          Include superseded history
        </label>
      </div>

      <p className="text-xs text-gray-400 font-body mt-2">
        {approvedShown} approved quote{approvedShown === 1 ? '' : 's'}
        {showSuperseded ? ` and ${supersededShown} superseded` : ''} shown.
        {reference?.prime
          ? ` Floating effective rates use prime ${reference.prime.value.toFixed(2)}% as of ${reference.prime.as_of}.`
          : ' Prime reference not loaded; floating rows show their discount alone.'}
      </p>

      {/* Table */}
      <div className="mt-3 bg-white border border-gray-200 rounded-xl overflow-hidden">
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500 font-body px-5 py-6">No quotes match this view.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-body min-w-[720px]">
              <thead>
                <tr className="text-left text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <th className="py-2.5 px-4 font-medium">Lender</th>
                  <th className="py-2.5 px-2 font-medium">Product</th>
                  <th className="py-2.5 px-2 font-medium">Variant</th>
                  <th className="py-2.5 px-2 font-medium">Type</th>
                  <th className="py-2.5 px-2 font-medium text-right">Term</th>
                  <th className="py-2.5 px-2 font-medium text-right">Rate</th>
                  <th className="py-2.5 px-2 font-medium text-right">Comp</th>
                  <th className="py-2.5 px-2 font-medium">Sheet</th>
                  <th className="py-2.5 px-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(q => (
                  <tr
                    key={q.id}
                    className={`border-b border-gray-50 ${q.status === 'superseded' ? 'text-gray-400' : ''}`}
                  >
                    <td className="py-2 px-4 font-semibold text-navy">{q.lenderSlug}</td>
                    <td className="py-2 px-2 capitalize">
                      {label(q.productClass)}
                      {q.cashbackPct !== null && (
                        <span
                          className="ml-1.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800"
                          title={q.programNotes ?? undefined}
                        >
                          {q.cashbackPct}% cash back
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2" title={q.programNotes ?? undefined}>
                      {q.variant ?? ''}
                    </td>
                    <td className="py-2 px-2">
                      {q.rateType === 'fixed' ? (
                        <span className="text-gray-500">Fixed</span>
                      ) : (
                        <span
                          className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
                            q.rateType === 'adjustable'
                              ? 'bg-sky-100 text-sky-900'
                              : 'bg-violet-100 text-violet-900'
                          }`}
                        >
                          {RATE_TYPE_LABEL[q.rateType]}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right">{termLabel(q.termMonths)}</td>
                    <td className={`py-2 px-2 text-right font-semibold whitespace-nowrap ${q.status === 'approved' ? 'text-navy' : ''}`}>
                      {rateCell(q, reference)}
                    </td>
                    <td className="py-2 px-2 text-right">{q.compBps !== null ? `${q.compBps} bps` : ''}</td>
                    <td className="py-2 px-2">
                      {q.asOfDate ?? 'undated'}
                      {q.expiryDate ? ` (to ${q.expiryDate})` : ''}
                    </td>
                    <td className="py-2 px-4">
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          q.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {q.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
