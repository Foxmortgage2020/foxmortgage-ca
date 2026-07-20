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

import {
  getAllDealsSlim,
  createZohoTask,
  searchZohoContacts,
  getDealCloseout,
  getZohoTask,
  setZohoTaskStatus,
  completeZohoTask,
} from '@/lib/zoho-admin'
import {
  getDealsSummary,
  getAgentIdByEmail,
  getAuditEntries,
  getNumberLinks,
  getDealDocumentRequests,
  getDealRequestReviews,
  getDealRequestDecisions,
  getApprovedConditions,
  getDealBorrowers,
} from '@/lib/underwriting'
import { buildRequestsDesk } from '@/lib/documents-desk'
import type { BorrowerInfo } from '@/lib/documents-desk'
import { listCredentials, listComplaints, createComplaint } from '@/lib/compliance'
import { updatePartner, getPartner } from '@/lib/zoho'
import { getAgents } from '@/lib/underwriting'
import {
  decideStatement,
  decideDocumentRequest,
  checkFinmoNow,
  getLenderContacts,
  createLenderContact,
  decideLenderContact,
} from '@/lib/gates'
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

  it('the calendar band (Microsoft) returns canned synthetic events with zero real reads', async () => {
    const { getTodayCalendar } = await import('@/lib/ms-calendar')
    const res = await getTodayCalendar(new Date('2026-07-20T14:00:00Z'))
    expect(res.configured && res.ok).toBe(true)
    if (res.configured && res.ok) {
      expect(res.events.length).toBeGreaterThan(0)
      // Obviously fictional, and an all-day event is always present.
      expect(res.events.some(e => e.subject.includes('Marty McFixture'))).toBe(true)
      expect(res.events.some(e => e.status === 'allday')).toBe(true)
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('the Beyond funding and Lenders strips resolve from fixtures and empty stores with zero real reads (B3)', async () => {
    const { getRenewalDeals } = await import('@/lib/zoho-admin')
    const { recentUploads } = await import('@/lib/smm-store')
    const { getKnowledgeClaimQueue } = await import('@/lib/underwriting')
    const renewals = await getRenewalDeals()
    expect(renewals.withMaturity.length).toBeGreaterThan(0)
    const uploads = await recentUploads(3)
    expect(uploads).toEqual({ configured: true, ok: true, data: [] })
    const claims = await getKnowledgeClaimQueue('anything')
    expect(claims.configured && claims.ok).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('getDealCloseout (B2b closeout read) resolves from fixtures with zero real reads', async () => {
    const inReview = await getDealCloseout('demo-z-2')
    expect(inReview?.complianceStatus).toBe('In Review')
    expect(inReview?.totalCommission).toBeNull()
    const approved = await getDealCloseout('demo-z-10')
    expect(approved?.complianceStatus).toBe('Approved')
    expect(approved?.totalCommission).toBe(7140)
    expect(await getDealCloseout('demo-z-none')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('the documents desk (B6.4) reads verdicts + decisions from fixtures with zero real reads', async () => {
    const reqR = await getDealDocumentRequests(DEMO_AGENT_ID, 'demo-deal-1')
    const condsR = await getApprovedConditions(DEMO_AGENT_ID, 'demo-deal-1')
    const borrR = await getDealBorrowers(DEMO_AGENT_ID, 'demo-deal-1')
    const reviewsR = await getDealRequestReviews(DEMO_AGENT_ID, 'demo-deal-1')
    const decisionsR = await getDealRequestDecisions(DEMO_AGENT_ID, 'demo-deal-1')
    expect(reqR.configured && reqR.ok).toBe(true)
    expect(reviewsR.configured && reviewsR.ok).toBe(true)
    expect(decisionsR.configured && decisionsR.ok).toBe(true)
    if (
      reqR.configured && reqR.ok && condsR.configured && condsR.ok && borrR.configured && borrR.ok &&
      reviewsR.configured && reviewsR.ok && decisionsR.configured && decisionsR.ok
    ) {
      const info = new Map<string, BorrowerInfo>(
        borrR.data.map(b => [b.id, { finmoBorrowerId: b.finmoBorrowerId, fullName: b.fullName, relationship: b.relationship }]),
      )
      const now = Date.parse('2026-07-18T00:00:00Z')
      const desk = buildRequestsDesk(reqR.data, condsR.data, info, now, reviewsR.data, decisionsR.data)
      const cards = desk.sections.flatMap(s => s.cards)
      // General + Marty + Sample + two disambiguated "Jordan" sections (B6.3).
      expect(desk.sections.map(s => s.label)).toEqual(
        expect.arrayContaining(['General', 'Marty', 'Sample', 'Jordan (parent)', 'Jordan (spouse)']),
      )
      // All four review verdict states render.
      const states = new Set(cards.map(c => c.state))
      for (const s of ['waiting', 'ai_flagged', 'ai_passed', 'ai_questions', 'ai_stale_cycle', 'reviewed']) {
        expect(states).toContain(s)
      }
      // Questions has its own pill and does not swell Needs your look.
      expect(desk.filterCounts.questions).toBeGreaterThanOrEqual(1)
      // The bank statement shows all three truths: Finmo approved, AI flagged, approved by you.
      const bank = cards.find(c => c.name === 'Bank Statement (90 days)')!
      expect(bank.finmoApproved).toBe(true)
      expect(bank.state).toBe('ai_flagged')
      expect(bank.verdictSource).toBe('review')
      expect(bank.decision?.verdict).toBe('approved')
      expect(bank.filter).toBe('done')
      // A commitment condition's verdict is preferred where it covers the request.
      const loe = cards.find(c => c.name === 'Letter of Employment')!
      expect(loe.state).toBe('ai_flagged')
      expect(loe.analysis?.reason).toBe('Dated over 30 days ago')
      // Two requests were withdrawn in Finmo (hidden from active groups + counts).
      expect(desk.withdrawnCount).toBe(2)
      expect(desk.progress.total).toBe(cards.length)
    }
    // The request-less residual (Task 3) resolves from the documents fixture.
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

  it('the task complete/reopen write path is demo-blocked and reads nothing', async () => {
    // The reads never touch Zoho...
    await expect(getZohoTask('demo-t-1')).resolves.toBeNull()
    // ...and every task Status write throws before any fetch.
    await expect(setZohoTaskStatus('demo-t-1', 'Completed')).rejects.toBeInstanceOf(DemoWriteBlocked)
    await expect(completeZohoTask('demo-t-1')).rejects.toBeInstanceOf(DemoWriteBlocked)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('a gate decision rejects with DemoWriteBlocked and never calls fetch', async () => {
    await expect(decideStatement('demo-doc', 'approve', 'tok')).rejects.toBeInstanceOf(DemoWriteBlocked)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('the documents-desk gate actions (approve / send back / check Finmo) reject in demo and never call fetch', async () => {
    await expect(decideDocumentRequest('req-1', 'approve', 'tok')).rejects.toBeInstanceOf(DemoWriteBlocked)
    await expect(decideDocumentRequest('req-1', 'send_back', 'tok', 'please resend')).rejects.toBeInstanceOf(DemoWriteBlocked)
    await expect(checkFinmoNow('demo-deal-1', 'tok')).rejects.toBeInstanceOf(DemoWriteBlocked)
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

  it('lender contacts read canned in demo (zero real reads) and every write rejects', async () => {
    const read = await getLenderContacts('tok')
    expect(read.ok).toBe(true)
    if (read.ok) expect(read.data.contacts.length).toBeGreaterThan(0)
    await expect(
      createLenderContact('mcap', { name: 'Demo BDM', email: 'bdm@example.com' }, 'tok'),
    ).rejects.toBeInstanceOf(DemoWriteBlocked)
    await expect(
      decideLenderContact('demo-contact-1', { action: 'supersede', name: 'Demo BDM', phone: '6475551234' }, 'tok'),
    ).rejects.toBeInstanceOf(DemoWriteBlocked)
    await expect(
      decideLenderContact('demo-contact-1', { action: 'retire', reason: 'left the desk' }, 'tok'),
    ).rejects.toBeInstanceOf(DemoWriteBlocked)
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

// The Desk (2026-07-14 shell redesign): the count layer behind the strip,
// the sidebar badges, and the poll route makes zero real reads in demo —
// every underlying fetcher is demo-guarded, the renewal-events store (no
// guard of its own) is skipped, and the rate book fetch is skipped too.
import { computeDeskCounts } from '@/lib/desk'

describe('demo mode on the Desk count layer', () => {
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

  it('computeDeskCounts reads nothing real for an admin in demo', async () => {
    const counts = await computeDeskCounts({
      userId: 'demo-user',
      email: 'demo@example.com',
      name: 'Demo Admin',
      roles: ['admin'],
    })
    // Approvals queues resolve from fixtures (numbers, not nulls); the
    // export-dependent sections stay honest nulls (demo store is empty).
    expect(typeof counts.sheets).toBe('number')
    expect(counts.reviewFiles).toBeNull()
    expect(counts.manualMatches).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('demo mode on the renewal drip (2026-07-16): canned queue, zero reads, writes blocked', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => '',
      headers: new Headers(),
    } as unknown as Response)
  })

  it('the drip queue and sequence states resolve from fixtures with ZERO real reads', async () => {
    const { getRenewalDripQueue, getRenewalSequenceStates } = await import('@/lib/underwriting')
    const q = await getRenewalDripQueue('demo-agent')
    const s = await getRenewalSequenceStates('demo-agent')
    expect(q.configured && q.ok && q.data.length).toBeGreaterThan(0)
    expect(s.configured && s.ok && s.data.length).toBeGreaterThan(0)
    if (q.configured && q.ok) {
      // The canned queue is synthetic clients only, with provenance rendered.
      expect(q.data[0]!.clientName).toBe('Dana Whitfield')
      expect(q.data[0]!.sentences[0]!.source).toBe('zoho:deal')
      expect(q.data.some((i) => i.status === 'held')).toBe(true)
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('every drip write path rejects with DemoWriteBlocked and never calls fetch', async () => {
    const { approveRenewalTouch, editRenewalTouchDraft, skipRenewalTouch, excludeRenewalSequence, setRenewalAutosend } = await import('@/lib/gates')
    await expect(approveRenewalTouch('t1', 'tok')).rejects.toThrow(/Demo mode/)
    await expect(editRenewalTouchDraft('t1', { body: 'x'.repeat(30) }, 'tok')).rejects.toThrow(/Demo mode/)
    await expect(skipRenewalTouch('t1', 'why', 'tok')).rejects.toThrow(/Demo mode/)
    await expect(excludeRenewalSequence('s1', 'why', 'tok')).rejects.toThrow(/Demo mode/)
    await expect(setRenewalAutosend('touch-150', true, 'tok')).rejects.toThrow(/Demo mode/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('demo mode on the client comms desk (B7-P): canned queue, zero reads, writes blocked', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => '',
      headers: new Headers(),
    } as unknown as Response)
  })

  it('the queue, per-deal timeline, and settings resolve from fixtures with ZERO real reads', async () => {
    const { getCommsQueue, getDealCommsTimeline, getCommsSettings } = await import('@/lib/underwriting')
    const q = await getCommsQueue('demo-agent')
    const tl = await getDealCommsTimeline('demo-agent', 'demo-zoho-10')
    const settings = await getCommsSettings('demo-agent')
    expect(q.configured && q.ok && q.data.length).toBeGreaterThan(0)
    if (q.configured && q.ok) {
      // Synthetic clients only, and every touch family is present.
      expect(q.data[0]!.clientName).toBe('Sofia Ricci')
      const kinds = new Set(q.data.map((i) => i.touchKind))
      expect(kinds).toEqual(new Set(['stage_update', 'app_chase', 'doc_chase', 'review_ask']))
      expect(q.data.some((i) => i.status === 'held')).toBe(true)
    }
    expect(tl.configured && tl.ok && tl.data.hasSequences).toBe(true)
    // The demo settings show the engine DARK (kill switch off) with a suppression.
    expect(settings.configured && settings.ok && settings.data.settings?.comms_enabled).toBe(false)
    expect(settings.configured && settings.ok && settings.data.suppressions.length).toBeGreaterThan(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('every comms write path rejects with DemoWriteBlocked and never calls fetch', async () => {
    const { approveCommsTouch, editCommsTouchDraft, skipCommsTouch, setCommsSettings } = await import('@/lib/gates')
    await expect(approveCommsTouch('t1', 'tok')).rejects.toThrow(/Demo mode/)
    await expect(editCommsTouchDraft('t1', { body: 'x'.repeat(10) }, 'tok')).rejects.toThrow(/Demo mode/)
    await expect(skipCommsTouch('t1', 'stale', 'tok')).rejects.toThrow(/Demo mode/)
    await expect(setCommsSettings({ comms_enabled: true }, 'tok')).rejects.toThrow(/Demo mode/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

// ─── The client portal (B5) ─────────────────────────────────────────────────
// A client's own file page is the highest-stakes surface in the app: it shows
// a real person's PII to whoever holds a link. In demo it must render fully
// from the synthetic fixture and touch nothing real, and the admin's link
// controls must refuse to mint anything.

describe('demo mode on the client portal (B5)', () => {
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
  it('the demo client file renders in full with zero real reads', async () => {
    const { demoClientFileView, DEMO_CLIENT_TOKEN } = await import('@/lib/demo-fixtures')
    const view = demoClientFileView(DEMO_CLIENT_TOKEN)
    expect(view).toBeTruthy()
    expect(view!.firstName).toBe('Sofia')
    expect(view!.journey.mapped).toBe(true)
    // A real page: a current phase in client words and a team to contact.
    expect(view!.journey.current?.label).toBe('Reviewing your file')
    expect(view!.team.length).toBeGreaterThanOrEqual(2)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('the admin link list resolves empty in demo, with no store call', async () => {
    const { clientLinksForDeal } = await import('@/lib/client-links-store')
    const res = await clientLinksForDeal('7112178000000000001')
    expect(res).toEqual({ configured: true, ok: true, data: [] })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('minting or revoking a client link is refused in demo and never calls fetch', async () => {
    const { createClientLink, revokeClientLink } = await import('@/lib/client-links-store')
    await expect(
      createClientLink({
        zohoDealId: '7112178000000000001',
        fileRef: 'FOX-1004',
        tokenHash: 'x'.repeat(64),
        createdBy: 'demo@example.com',
        expiresAt: new Date().toISOString(),
      }),
    ).rejects.toThrow(/Demo mode/)
    await expect(revokeClientLink('11111111-1111-1111-1111-111111111111', 'demo@example.com')).rejects.toThrow(
      /Demo mode/,
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('the audit recorder writes nothing in demo', async () => {
    const { recordClientLinkEvent } = await import('@/lib/client-links-store')
    await recordClientLinkEvent({
      linkId: null,
      zohoDealId: '7112178000000000001',
      fileRef: 'FOX-1004',
      action: 'created',
      actingEmail: 'demo@example.com',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

// ─── The client presentation (B8b) ──────────────────────────────────────────
// Scenarios, graded offers, and the pre-approval letter are as PII-sensitive as
// the status page: they show a real client their own figures. In demo the admin
// lists resolve from fixtures with zero real reads, the demo client file carries
// all three surfaces, and every write is refused.

describe('demo mode on the client presentation (B8b)', () => {
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

  it('the admin authoring lists resolve from fixtures with zero real reads', async () => {
    const { scenariosForDeal, offersForDeal, lettersForDeal } = await import(
      '@/lib/client-presentation-store'
    )
    const sc = await scenariosForDeal('demo-z-2') // the refi carries scenarios
    const of = await offersForDeal('demo-z-1') // the purchase carries offers
    const lt = await lettersForDeal('demo-z-1') // …and a letter
    expect(sc.configured && sc.ok && sc.data.length).toBeGreaterThan(0)
    expect(of.configured && of.ok && of.data.length).toBeGreaterThan(0)
    expect(lt.configured && lt.ok && lt.data.length).toBeGreaterThan(0)
    if (of.configured && of.ok) {
      // A grade is materialised on the offer snapshot (the A offer is complete).
      const graded = of.data.find(o => o.snapshot.grade.coverageComplete)
      expect(graded?.snapshot.grade.letter).toBeTruthy()
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('the demo client file carries scenarios, offers, and a valid letter (zero real reads)', async () => {
    const { demoClientFileView, DEMO_CLIENT_TOKEN } = await import('@/lib/demo-fixtures')
    const purchase = demoClientFileView(DEMO_CLIENT_TOKEN)!
    expect(purchase.offers.length).toBeGreaterThan(0)
    expect(purchase.letter?.valid).toBe(true)
    // One offer is grade-complete, one is "grading incomplete" — the brief's contrast.
    expect(purchase.offers.some(o => o.grade.coverageComplete)).toBe(true)
    expect(purchase.offers.some(o => !o.grade.coverageComplete)).toBe(true)
    const refi = demoClientFileView('a1'.repeat(32))!
    expect(refi.scenarios.length).toBe(2)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('every presentation write path rejects with DemoWriteBlocked and never calls fetch', async () => {
    const {
      upsertScenario,
      setScenarioPublished,
      deleteScenario,
      createOffer,
      setOfferPublished,
      deleteOffer,
      mintLetter,
      supersedeLetter,
    } = await import('@/lib/client-presentation-store')
    await expect(
      upsertScenario({
        id: null,
        zohoDealId: 'demo-z-1',
        fileRef: null,
        label: 'x',
        inputs: { mortgageAmount: 400000, ratePct: 5, amortizationYears: 25 },
        figures: { monthlyPayment: 1, totalInterest: 1 },
        inputsHash: 'h',
        calcVersion: 1,
        createdBy: 'demo@example.com',
      }),
    ).rejects.toThrow(/Demo mode/)
    await expect(setScenarioPublished('s1', true)).rejects.toThrow(/Demo mode/)
    await expect(deleteScenario('s1')).rejects.toThrow(/Demo mode/)
    await expect(
      createOffer({ zohoDealId: 'demo-z-1', fileRef: null, quoteId: 'q1', snapshot: {} as any, createdBy: 'x' }),
    ).rejects.toThrow(/Demo mode/)
    await expect(setOfferPublished('o1', true)).rejects.toThrow(/Demo mode/)
    await expect(deleteOffer('o1')).rejects.toThrow(/Demo mode/)
    await expect(
      mintLetter({ zohoDealId: 'demo-z-1', fileRef: null, snapshot: {} as any, rateHoldExpiry: '2027-01-01', createdBy: 'x' }),
    ).rejects.toThrow(/Demo mode/)
    await expect(supersedeLetter('l1')).rejects.toThrow(/Demo mode/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('demo mode on the qualification explorer (B9)', () => {
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

  it('the admin list resolves from a fixture and the client file carries a baseline, with zero real reads', async () => {
    const { qualificationForDeal } = await import('@/lib/qualification-store')
    const q = await qualificationForDeal('demo-z-1')
    expect(q.configured && q.ok && q.data.length).toBeGreaterThan(0)
    if (q.configured && q.ok) expect(q.data[0].published).toBe(true)
    const { demoClientFileView, DEMO_CLIENT_TOKEN } = await import('@/lib/demo-fixtures')
    expect(demoClientFileView(DEMO_CLIENT_TOKEN)!.qualification).toBeTruthy()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('the demo baseline reaches all four bands as the client moves the controls (zero real reads)', async () => {
    const { demoClientFileView, DEMO_CLIENT_TOKEN } = await import('@/lib/demo-fixtures')
    const { computeQualification } = await import('@/lib/qualification')
    const b = demoClientFileView(DEMO_CLIENT_TOKEN)!.qualification!
    const bandAt = (price: number, downPayment: number, propertyTaxMonthly: number) =>
      computeQualification(b, { price, downPayment, propertyTaxMonthly, condoMonthly: 0 }).band.key
    const bands = new Set([
      bandAt(545000, 109000, 200),
      bandAt(565000, 56500, 300),
      bandAt(690000, 69000, 400),
      bandAt(1127000, 225400, 500),
    ])
    expect(bands).toEqual(new Set(['fits', 'options', 'alternatives', 'conversation']))
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('every qualification write rejects with DemoWriteBlocked and never calls fetch', async () => {
    const { upsertQualificationBaseline, setQualificationPublished, deleteQualificationBaseline } = await import(
      '@/lib/qualification-store'
    )
    await expect(
      upsertQualificationBaseline({
        id: null,
        zohoDealId: 'demo-z-1',
        fileRef: null,
        baseline: {} as any,
        sources: {},
        baselineHash: 'h',
        calcVersion: 1,
        createdBy: 'demo@example.com',
      }),
    ).rejects.toThrow(/Demo mode/)
    await expect(setQualificationPublished('q1', true)).rejects.toThrow(/Demo mode/)
    await expect(deleteQualificationBaseline('q1')).rejects.toThrow(/Demo mode/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
