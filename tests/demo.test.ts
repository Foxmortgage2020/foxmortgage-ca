// Demo mode acceptance (Session 9). Mocks @/lib/demo so isDemoMode() and
// demoModeAvailable() are forced true, then proves the guards short-circuit
// at the fetcher boundary: reads resolve to the fixtures with ZERO real
// fetch calls, and every write path throws DemoWriteBlocked.
//
// Only @/lib/demo is mocked — the fixtures in @/lib/demo-fixtures stay real,
// so the guards return the genuine fixture objects the pages would render.

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/demo', () => {
  class DemoWriteBlocked extends Error {
    constructor(op: string) {
      super(`Demo mode is read-only; the operation "${op}" was blocked.`)
      this.name = 'DemoWriteBlocked'
    }
  }
  return {
    DEMO_COOKIE: 'fox_demo',
    DEMO_AGENT_ID: 'demo-agent',
    DemoWriteBlocked,
    demoModeAvailable: () => true,
    isDemoMode: () => true,
    blockInDemo: (op: string) => {
      throw new DemoWriteBlocked(op)
    },
    setDemoCookie: async () => {},
    clearDemoCookie: async () => {},
  }
})

import { getAllDealsSlim, createZohoTask, searchZohoContacts } from '@/lib/zoho-admin'
import {
  getDealsSummary,
  getAgentIdByEmail,
  getAuditEntries,
  getNumberLinks,
} from '@/lib/underwriting'
import { listCredentials, listComplaints, createComplaint } from '@/lib/compliance'
import { updatePartner, getPartner } from '@/lib/zoho'
import { getAgents } from '@/lib/underwriting'
import { decideStatement } from '@/lib/gates'
import { DemoWriteBlocked, DEMO_AGENT_ID } from '@/lib/demo'
import {
  demoSlimDeals,
  demoDeals,
  demoCredentials,
  demoDealAudit,
} from '@/lib/demo-fixtures'

describe('demo mode guards', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => '',
      headers: new Headers(),
    } as unknown as Response)
  })

  it('getAllDealsSlim (zoho) returns the fixture and never calls fetch', async () => {
    const deals = await getAllDealsSlim()
    expect(deals).toBe(demoSlimDeals)
    expect(deals.length).toBeGreaterThan(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('getDealsSummary (workbench) returns the demo UwResult and never calls fetch', async () => {
    const res = await getDealsSummary('anything')
    expect(res).toEqual({ configured: true, ok: true, data: demoDeals })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('getAgentIdByEmail returns ok with DEMO_AGENT_ID', async () => {
    const res = await getAgentIdByEmail('michael@example.com')
    expect(res).toEqual({ configured: true, ok: true, data: DEMO_AGENT_ID })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('listCredentials returns the demo credentials with no fetch', async () => {
    const res = await listCredentials()
    expect(res.configured && res.ok).toBe(true)
    if (res.configured && res.ok) {
      expect(res.data).toBe(demoCredentials)
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('the audit viewer is fixtured too — no real file ref leaks on any page', async () => {
    const res = await getAuditEntries('anything', {}, 50, 0)
    expect(res.configured && res.ok).toBe(true)
    if (res.configured && res.ok) {
      expect(res.data.rows.length).toBeGreaterThan(0)
      expect(res.data.total).toBe(res.data.rows.length)
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('global-search contact lookup returns empty in demo (no real name leaks)', async () => {
    const rows = await searchZohoContacts('fox', 'word')
    expect(rows).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('learned number links return empty in demo (no real phone/contact data)', async () => {
    const res = await getNumberLinks('anything')
    expect(res).toEqual({ configured: true, ok: true, data: [] })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('the Zoho write path throws DemoWriteBlocked and never calls fetch', async () => {
    await expect(createZohoTask({ subject: 'demo task' })).rejects.toBeInstanceOf(DemoWriteBlocked)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('a gate decision rejects with DemoWriteBlocked and never calls fetch', async () => {
    await expect(decideStatement('demo-doc', 'approve', 'tok')).rejects.toBeInstanceOf(DemoWriteBlocked)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('compliance reads return empty and writes reject in demo (FSRA register untouched)', async () => {
    const list = await listComplaints()
    expect(list).toEqual({ configured: true, ok: true, data: [] })
    await expect(
      createComplaint({ receivedOn: '2026-01-01', source: 's', summary: 'x', reference: null, actor: 'a' }),
    ).rejects.toBeInstanceOf(DemoWriteBlocked)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('partner reads return empty/null and partner writes reject in demo', async () => {
    expect(await getPartner('123')).toBeNull()
    await expect(updatePartner('123', { Name: 'x' })).rejects.toBeInstanceOf(DemoWriteBlocked)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('the workbench agents/staff table is fixtured empty in demo (no real staff PII)', async () => {
    const res = await getAgents()
    expect(res).toEqual({ configured: true, ok: true, data: [] })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

// The Rates-regression session's touched surfaces: the demo guards sit ABOVE
// the pagination layer, so demo mode reads nothing on the coverage map or
// the approvals sheet queue. (getRateQuotesFull carries no demo guard BY
// DESIGN — lender rate data intentionally stays real in demo; it is not
// borrower data. Session 9 contract.)
import { getIntelItems, getPendingSheetReviews, getRateSheetQueue } from '@/lib/underwriting'

describe('demo mode on the coverage + approvals fetchers (regression session)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => '',
      headers: new Headers(),
    } as unknown as Response)
  })

  it('intel, pending reviews, and the sheet queue return fixtures with zero real reads', async () => {
    const [intel, pending, sheets] = await Promise.all([
      getIntelItems('anything'),
      getPendingSheetReviews('anything'),
      getRateSheetQueue('anything'),
    ])
    for (const r of [intel, pending, sheets]) {
      expect(r.configured).toBe(true)
      expect((r as { ok: boolean }).ok).toBe(true)
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
