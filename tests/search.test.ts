import { describe, expect, it } from 'vitest'
import {
  filterNav,
  groupResults,
  rankDeals,
  rankLenders,
  normalizeQuery,
  type GroupInput,
  type LenderTarget,
  type NavItemLike,
} from '../lib/search'
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

  it('finds a consolidated sub-tab by its label and carries the tab query', () => {
    // The palette searches the sub-tab catalogue alongside the nav, so typing
    // a tab name lands the user on that tab of the consolidated page.
    const pages: NavItemLike[] = [
      { label: 'Promos', href: '/portal/admin/lenders?tab=promos', description: 'Lender promotions.' },
      { label: 'Lender intel', href: '/portal/admin/lenders?tab=intel', description: 'The intel feed.' },
      { label: 'Bookkeeping', href: '/portal/admin/revenue?tab=bookkeeping', description: 'The review queue.' },
    ]
    const res = filterNav(pages, 'promo')
    expect(res).toHaveLength(1)
    expect(res[0].title).toBe('Promos')
    expect(res[0].href).toBe('/portal/admin/lenders?tab=promos')
  })
})

describe('rankLenders', () => {
  const lenders: LenderTarget[] = [
    { slug: 'mcap', name: 'MCAP' },
    { slug: 'first-national', name: 'First National' },
    { slug: 'first-national-excalibur', name: 'First National Excalibur' },
    { slug: 'scotia', name: 'Scotiabank' },
  ]

  it('returns nothing for an empty query', () => {
    expect(rankLenders(lenders, '  ')).toEqual([])
  })

  it('ranks a name startsWith ahead of an includes and jumps into the Rates by-lender view', () => {
    const res = rankLenders(lenders, 'first')
    // Both start with "first"; alphabetical tiebreak keeps the shorter first.
    expect(res.map(r => r.title)).toEqual(['First National', 'First National Excalibur'])
    expect(res[0].type).toBe('lender')
    expect(res[0].href).toBe('/portal/admin/lenders?tab=rates&view=lenders&lender=first-national')
  })

  it('matches on the slug as well as the display name', () => {
    // A user could type either the slug or the spoken name.
    expect(rankLenders(lenders, 'scotia').map(r => r.title)).toEqual(['Scotiabank'])
    expect(rankLenders([{ slug: 'nbc-optimum', name: 'NBC Optimum' }], 'nbc-optimum')).toHaveLength(1)
  })

  it('caps the number of results', () => {
    const many: LenderTarget[] = Array.from({ length: 20 }, (_, i) => ({
      slug: `lender-${i}`,
      name: `Lender ${i}`,
    }))
    expect(rankLenders(many, 'lender', 8)).toHaveLength(8)
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

  it('finds a deal by its BRXM file ref OR its client name (both reach the same room)', () => {
    // Locks the finding that deals are already searchable both ways: the
    // brief asked for it and it was already true.
    const workbench = [wb({ id: 'wb-7', fileRef: 'BRXM-F053107', zohoPotentialId: 'z-7' })]
    const zoho = [zd({ id: 'z-7', dealName: 'Sofia Ricci Refinance' })]
    const byRef = rankDeals(workbench, zoho, 'BRXM-F053107')
    expect(byRef).toHaveLength(1)
    expect(byRef[0].href).toBe('/portal/admin/deals/wb-7')
    const byName = rankDeals(workbench, zoho, 'ricci')
    expect(byName[0].id).toBe('wb-7')
    expect(byName[0].href).toBe('/portal/admin/deals/wb-7')
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
