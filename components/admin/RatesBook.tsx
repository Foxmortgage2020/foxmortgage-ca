'use client'

// The Rates tab's merged view (2026-07-20 consolidation): the old "Lenders"
// (where a lender sits today) and "All quotes" (the dense table) inner tabs,
// now one dataset behind a By lender / All quotes toggle. Same rows, grouped or
// flat — no data or pricing logic changes. The view lives in ?view=lenders|all
// so a deep link (and the redirected old ?tab=lenders / ?tab=all) resolves.
// Matching stays client-side over the loaded quotes prop; no lime.

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { RateQuoteFullRow } from '@/lib/underwriting'
import type { LenderCoverage } from '@/lib/lender-browse'
import type { RatesReference } from '@/lib/scenario'
import { useKnowledgeFetch } from '@/lib/knowledge-client'
import RatesLenders from '@/components/admin/RatesLenders'
import RatesBrowser from '@/components/admin/RatesBrowser'

type View = 'lenders' | 'all'

export default function RatesBook({
  quotes,
  coverage,
  todayYMD,
  unattributed = [],
  canManageContacts = false,
}: {
  quotes: RateQuoteFullRow[]
  coverage: LenderCoverage
  todayYMD: string
  unattributed?: { fileName: string | null; receivedAt: string | null }[]
  canManageContacts?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const view: View = sp.get('view') === 'all' ? 'all' : 'lenders'

  function setView(v: View) {
    if (v === view) return
    const params = new URLSearchParams(sp.toString())
    params.set('view', v)
    // replace (scroll:false): switching the view is not a history stop, and the
    // book is already loaded (a short server cache absorbs the re-render).
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const TABS: { value: View; label: string; hint: string }[] = [
    { value: 'lenders', label: 'By lender', hint: 'Where each lender sits today' },
    { value: 'all', label: 'All quotes', hint: 'The dense table' },
  ]

  return (
    <div>
      <div
        className="inline-flex rounded-[9px] border border-cool-200 bg-white p-0.5"
        role="tablist"
        aria-label="Rates view"
      >
        {TABS.map(t => {
          const on = t.value === view
          return (
            <button
              key={t.value}
              role="tab"
              aria-selected={on}
              onClick={() => setView(t.value)}
              title={t.hint}
              data-testid={`rates-view-${t.value}`}
              className={`px-3.5 py-1.5 rounded-[7px] text-[13px] font-ui font-semibold transition ${
                on ? 'bg-navy text-white' : 'text-cool-600 hover:text-navy'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      <div className="mt-5">
        {view === 'lenders' ? (
          <RatesLenders
            quotes={quotes}
            coverage={coverage}
            todayYMD={todayYMD}
            unattributed={unattributed}
            canManageContacts={canManageContacts}
          />
        ) : (
          <AllQuotes quotes={quotes} initialLender={sp.get('lender')} />
        )}
      </div>
    </div>
  )
}

// The dense table needs the prime reference to price floating rows, fetched
// client-side through the browser-minted token like every knowledge read.
function AllQuotes({
  quotes,
  initialLender,
}: {
  quotes: RateQuoteFullRow[]
  initialLender: string | null
}) {
  const referenceRes = useKnowledgeFetch<RatesReference>('/api/portal/admin/knowledge/rates-reference')
  return (
    <div>
      <p className="text-sm text-cool-500 font-ui mb-4">
        Every approved quote, with superseded history behind its toggle. Effective rates for floating
        rows compute against the served prime.
      </p>
      <RatesBrowser
        quotes={quotes}
        initialLender={initialLender ?? undefined}
        reference={referenceRes.data ?? null}
      />
    </div>
  )
}
