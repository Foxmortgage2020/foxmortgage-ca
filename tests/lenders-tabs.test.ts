// The Lenders single tab row (2026-07-20 consolidation). The redirect mapping
// is the load-bearing part — every old URL must reach its new home — so it is
// pure and unit-tested here.

import { describe, it, expect } from 'vitest'
import {
  resolveLendersTab,
  lendersTabPermission,
  isRateEngineTab,
  LENDERS_TAB_KEYS,
} from '@/lib/lenders-tabs'

describe('resolveLendersTab', () => {
  it('carries the surviving tab values through unchanged', () => {
    for (const t of ['scenario', 'rates', 'promos', 'intel', 'knowledge'] as const) {
      const r = resolveLendersTab(t, undefined)
      expect(r.tab).toBe(t)
      expect(r.needsRedirect).toBe(false)
    }
  })

  it('redirects the retired inner tabs to the Rates tab views', () => {
    const lenders = resolveLendersTab('lenders', undefined)
    expect(lenders).toEqual({ tab: 'rates', view: 'lenders', needsRedirect: true })
    const all = resolveLendersTab('all', undefined)
    expect(all).toEqual({ tab: 'rates', view: 'all', needsRedirect: true })
  })

  it('reads ?view for the Rates tab and defaults to By lender', () => {
    expect(resolveLendersTab('rates', 'all').view).toBe('all')
    expect(resolveLendersTab('rates', 'lenders').view).toBe('lenders')
    expect(resolveLendersTab('rates', undefined).view).toBe('lenders')
    expect(resolveLendersTab('rates', 'garbage').view).toBe('lenders')
  })

  it('defaults an absent or unknown tab to Scenario without a redirect', () => {
    expect(resolveLendersTab(undefined, undefined)).toEqual({ tab: 'scenario', view: 'lenders', needsRedirect: false })
    expect(resolveLendersTab('nonsense', undefined)).toEqual({ tab: 'scenario', view: 'lenders', needsRedirect: false })
  })
})

describe('lendersTabPermission', () => {
  it('maps each tab to its owning permission key', () => {
    expect(lendersTabPermission('scenario')).toBe('rates.view')
    expect(lendersTabPermission('rates')).toBe('rates.view')
    expect(lendersTabPermission('promos')).toBe('rates.view')
    expect(lendersTabPermission('intel')).toBe('intel.view')
    expect(lendersTabPermission('knowledge')).toBe('knowledge.view')
  })
})

describe('isRateEngineTab', () => {
  it('is true only for the three book-backed tabs', () => {
    expect(LENDERS_TAB_KEYS.filter(isRateEngineTab)).toEqual(['scenario', 'rates', 'promos'])
  })
})
