// The Lenders page's single tab row (2026-07-20 consolidation). One row —
// Scenario, Rates, Promos, Intel, Knowledge — replaces the two stacked rows
// (the outer rates|intel|knowledge and the inner scenario|lenders|promos|all).
// The old inner "Lenders" and "All quotes" tabs become the Rates tab's two
// views (?view=lenders | all). Pure so the redirect mapping is unit-tested.
//
// Collision note: ?tab=rates was never a durable URL in the old scheme (the
// inner shell always client-rewrote it to ?tab=scenario), so `rates` is free
// for the new merged tab. The durable old inner values were scenario / lenders
// / promos / all; `scenario` and `promos` carry over unchanged, and lenders /
// all redirect to the Rates tab's two views. Nothing 404s.

export const LENDERS_TAB_KEYS = ['scenario', 'rates', 'promos', 'intel', 'knowledge'] as const
export type LendersTab = (typeof LENDERS_TAB_KEYS)[number]

export const RATES_VIEWS = ['lenders', 'all'] as const
export type RatesView = (typeof RATES_VIEWS)[number]

// The rate-engine tabs (scenario / rates / promos) that share the book fetch,
// vs intel / knowledge which are their own reads.
export function isRateEngineTab(tab: LendersTab): tab is 'scenario' | 'rates' | 'promos' {
  return tab === 'scenario' || tab === 'rates' || tab === 'promos'
}

export function lendersTabPermission(tab: LendersTab): 'rates.view' | 'intel.view' | 'knowledge.view' {
  return tab === 'intel' ? 'intel.view' : tab === 'knowledge' ? 'knowledge.view' : 'rates.view'
}

// Resolve a raw ?tab (including the retired inner-tab values) to the single
// row. A legacy value (lenders / all) sets needsRedirect so the page
// canonicalizes the URL to ?tab=rates&view=...; an unknown or absent tab
// resolves to Scenario (the default landing) without a redirect.
export function resolveLendersTab(
  rawTab: string | undefined,
  rawView: string | undefined,
): { tab: LendersTab; view: RatesView; needsRedirect: boolean } {
  const view: RatesView = rawView === 'all' ? 'all' : 'lenders'
  if (rawTab === 'lenders') return { tab: 'rates', view: 'lenders', needsRedirect: true }
  if (rawTab === 'all') return { tab: 'rates', view: 'all', needsRedirect: true }
  if (rawTab && (LENDERS_TAB_KEYS as readonly string[]).includes(rawTab)) {
    return { tab: rawTab as LendersTab, view, needsRedirect: false }
  }
  return { tab: 'scenario', view, needsRedirect: false }
}
