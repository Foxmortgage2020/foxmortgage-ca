'use client'

// Rates v3 tab shell. Four URL-addressable destinations
// (?tab=scenario|lenders|promos|all), Scenario the default. State lives in
// the URL (Session 5 convention) so back navigation and sharing work; the
// last tab is remembered per session, but an explicit ?tab in the URL always
// wins, and a deal-room prefill (?from=...) always lands on Scenario
// regardless of the remembered tab.

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { RateQuoteFullRow, SheetProvenance } from '@/lib/underwriting'
import type { LenderCoverage } from '@/lib/lender-browse'
import type { RatesReference } from '@/lib/scenario'
import { useKnowledgeFetch } from '@/lib/knowledge-client'
import RatesScenario from '@/components/admin/RatesScenario'
import RatesLenders from '@/components/admin/RatesLenders'
import RatesPromos from '@/components/admin/RatesPromos'
import RatesBrowser from '@/components/admin/RatesBrowser'

const TABS = [
  { value: 'scenario', label: 'Scenario', hint: 'Who wins this deal' },
  { value: 'lenders', label: 'Lenders', hint: 'Where a lender sits today' },
  { value: 'promos', label: 'Promos', hint: "What's live, what's expiring" },
  { value: 'all', label: 'All quotes', hint: 'The dense table' },
] as const
type Tab = (typeof TABS)[number]['value']
const TAB_MEMORY_KEY = 'fox_rates_tab_v1'

function isTab(x: string | null): x is Tab {
  return x !== null && TABS.some(t => t.value === x)
}

export default function RatesTabs({
  quotes,
  provenance,
  coverage,
  todayYMD,
  unattributed = [],
}: {
  quotes: RateQuoteFullRow[]
  provenance: Record<string, SheetProvenance>
  coverage: LenderCoverage
  todayYMD: string
  unattributed?: { fileName: string | null; receivedAt: string | null }[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  const urlTab = sp.get('tab')
  const fromFile = sp.get('from')
  const active: Tab = isTab(urlTab) ? urlTab : 'scenario'

  // Resolve the tab when the URL does not name one: a prefill forces
  // Scenario, otherwise the remembered tab, otherwise Scenario. Reflected
  // into the URL with replace so every tab is addressable without adding a
  // history entry. When the URL does name a tab, remember it.
  useEffect(() => {
    if (isTab(urlTab)) {
      try {
        sessionStorage.setItem(TAB_MEMORY_KEY, urlTab)
      } catch {
        /* private mode */
      }
      return
    }
    let next: Tab = 'scenario'
    if (!fromFile) {
      try {
        const remembered = sessionStorage.getItem(TAB_MEMORY_KEY)
        if (isTab(remembered)) next = remembered
      } catch {
        /* private mode */
      }
    }
    const params = new URLSearchParams(sp.toString())
    params.set('tab', next)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTab, fromFile])

  function goTab(t: Tab) {
    if (t === active) return
    try {
      sessionStorage.setItem(TAB_MEMORY_KEY, t)
    } catch {
      /* private mode */
    }
    const params = new URLSearchParams(sp.toString())
    params.set('tab', t)
    // push (scrolls to top): back returns to the previous tab.
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div>
      <div className="mt-5 border-b border-cool-200" role="tablist" aria-label="Rates views">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(t => {
            const on = t.value === active
            return (
              <button
                key={t.value}
                role="tab"
                aria-selected={on}
                onClick={() => goTab(t.value)}
                title={t.hint}
                data-testid={`rates-tab-${t.value}`}
                className={`shrink-0 px-4 py-2.5 text-sm font-ui font-semibold border-b-2 -mb-px transition ${
                  on
                    ? 'border-navy text-navy'
                    : 'border-transparent text-cool-500 hover:text-navy hover:border-cool-300'
                }`}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-5">
        {active === 'scenario' && <RatesScenario quotes={quotes} provenance={provenance} />}
        {active === 'lenders' && (
          <RatesLenders quotes={quotes} coverage={coverage} todayYMD={todayYMD} unattributed={unattributed} />
        )}
        {active === 'promos' && <RatesPromos />}
        {active === 'all' && <AllQuotesTab quotes={quotes} initialLender={sp.get('lender')} />}
      </div>
    </div>
  )
}

// The dense table gets its own tab. It needs the prime reference to price
// floating rows, fetched client-side through the browser-minted token like
// every knowledge read.
function AllQuotesTab({
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
