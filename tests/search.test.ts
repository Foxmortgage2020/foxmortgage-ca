import { describe, expect, it } from 'vitest'
import { filterNav, groupResults, rankDeals, normalizeQuery, type GroupInput, type NavItemLike } from '../lib/search'
import type { WorkbenchDeal } from '../lib/underwriting'
import type { SlimDeal } from '../lib/zoho-admin'

const nav: NavItemLike[] = [
  { label: 'Rates', href: '/portal/admin/rates', description: 'Current approved lender quotes.' },
  { label: 'Revenue', href: '/portal/admin/revenue', description: 'Commission forecast and rate mix.' },
  { label: 'Partners', href: '/portal/admin/partners', description: 'Partner directory and health.' },
  { label: 'Deals', href: '/portal/admin/deals', description: 'Every active file in one place.' },
]

describe('normalizeQuery', () => {
  it('trims, collapses whitespace, and lowercases', () => {
    expect(normalizeQuery('  Jo   Wells ')).toBe('jo wells')
  })
})

describe('filterNav', () => {
  it('returns nothing for an empty query', () => {
    expect(filterNav(nav, '   ')).toEqual([])
  })

  it('ranks label startsWith ahead of a label includes ahead of a description includes', () => {
    // "rate" prefixes "Rates" (rank 0); appears inside Revenue's description
    // "rate mix" (rank 2). Rates must come first.
    const res = filterNav(nav, 'rate')
    expect(res.map(r => r.title)).toEqual(['Rates', 'Revenue'])
    expect(res[0].type).toBe('nav')
    expect(res[0].href).toBe('/portal/admin/rates')
  })

  it('places a label-includes match ahead of a description-only match', () => {
    // "re" prefixes Revenue (0); is inside "Partners"? no. Inside Rates? no.
    // Use a query that hits one label-includes and one description-includes.
    const items: NavItemLike[] = [
      { label: 'Compliance', href: '/c', description: 'the deal register lives here' },
      { label: 'Deals', href: '/d', description: 'files' },
    ]
    const res = filterNav(items, 'deal')
    // Deals: label startsWith (0). Compliance: description includes (2).
    expect(res.map(r => r.title)).toEqual(['Deals', 'Compliance'])
  })
})

const wb = (over: Partial<WorkbenchDeal>): WorkbenchDeal => ({
  id: 'wb-1',
  fileRef: 'BRXM-F000001',
  stage: 'Underwriting',
  closingDate: null,
  zohoPotentialId: null,
  status: 'active',
  updatedAt: '2026-07-10T00:00:00Z',
  ...over,
})

const zd = (over: Partial<SlimDeal>): SlimDeal => ({
  id: 'z-1',
  dealName: 'Jane Doe Purchase',
  stage: 'Underwriting In Progress',
  amount: 500000,
  closingDate: null,
  createdTime: null,
  ...over,
})

describe('rankDeals', () => {
  it('returns nothing for an empty query', () => {
    expect(rankDeals([wb({})], [zd({})], '  ')).toEqual([])
  })

  it('joins a workbench deal to its Zoho row and emits it once (dedup)', () => {
    const workbench = [wb({ id: 'wb-9', fileRef: 'BRXM-F053724', zohoPotentialId: 'zoho-9' })]
    const zoho = [zd({ id: 'zoho-9', dealName: 'Ava Lindqvist Refi' })]
    const res = rankDeals(workbench, zoho, 'lindqvist')
    expect(res).toHaveLength(1)
    expect(res[0].id).toBe('wb-9')
    expect(res[0].title).toBe('Ava Lindqvist Refi')
    expect(res[0].href).toBe('/portal/admin/deals/wb-9')
    // The Zoho row was consumed by the join and does not appear again even
    // though its name also matches.
    expect(res.filter(r => r.title === 'Ava Lindqvist Refi')).toHaveLength(1)
  })

  it('matches on the file ref and falls back to the file ref as the title when no Zoho name joins', () => {
    const workbench = [wb({ id: 'wb-2', fileRef: 'IFMS-F001515', zohoPotentialId: null })]
    const res = rankDeals(workbench, [], 'f001515')
    expect(res).toHaveLength(1)
    expect(res[0].title).toBe('IFMS-F001515')
    expect(res[0].subtitle).toContain('IFMS-F001515')
    expect(res[0].href).toBe('/portal/admin/deals/wb-2')
  })

  it('includes a Zoho-only match with a list href when no workbench row exists', () => {
    const res = rankDeals([], [zd({ id: 'z-42', dealName: 'Fraser Investment' })], 'fraser')
    expect(res).toHaveLength(1)
    expect(res[0].id).toBe('z-42')
    expect(res[0].href).toContain('/portal/admin/deals?q=')
  })
})

describe('groupResults', () => {
  const someResult = { type: 'deal' as const, id: 'x', title: 'X', href: '/x' }

  it("marks an errored source degraded regardless of result count", () => {
    const inputs: GroupInput[] = [{ type: 'deal', label: 'Deals', results: [], errored: true }]
    expect(groupResults(inputs)[0].status).toBe('degraded')
  })

  it('marks a zero-result (non-errored) source empty', () => {
    const inputs: GroupInput[] = [{ type: 'contact', label: 'Contacts', results: [] }]
    expect(groupResults(inputs)[0].status).toBe('empty')
  })

  it('marks a source with results ok', () => {
    const inputs: GroupInput[] = [{ type: 'deal', label: 'Deals', results: [someResult] }]
    expect(groupResults(inputs)[0].status).toBe('ok')
  })
})
