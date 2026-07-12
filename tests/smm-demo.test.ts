// Demo-mode guard for the SMM store. The monitoring export is real borrower
// PII and there are no SMM demo fixtures, so in demo every READ must resolve to
// empty (the board, Home rail, and backfill scan then show no real names) and
// every WRITE must be refused — all WITHOUT touching the network. Mocks
// @/lib/demo to force isDemoMode() true and spies on fetch to prove zero calls.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/demo', () => ({
  isDemoMode: () => true,
}))

import {
  recentUploads,
  rawRowsForUpload,
  latestOpportunityStatuses,
  createUpload,
  setOpportunityStatus,
  recordBackfillEvent,
} from '@/lib/smm-store'

describe('SMM store is inert in demo mode', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    // Give the store env so the ONLY thing that could stop a fetch is the demo
    // guard, not a missing configuration.
    process.env.FOXCA_SUPABASE_URL = 'https://demo.example.co'
    process.env.FOXCA_SUPABASE_KEY = 'demo-key'
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network must not be reached in demo'))
  })
  afterEach(() => fetchSpy.mockRestore())

  it('reads resolve to empty with zero network calls', async () => {
    const a = await recentUploads(5)
    const b = await rawRowsForUpload('any-id')
    const c = await latestOpportunityStatuses()
    expect(a).toMatchObject({ configured: true, ok: true, data: [] })
    expect(b).toMatchObject({ configured: true, ok: true, data: [] })
    expect(c).toMatchObject({ configured: true, ok: true, data: [] })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('writes are refused with zero network calls', async () => {
    const u = await createUpload('f.csv', 'x@y.com')
    const s = await setOpportunityStatus('HH1', null, 'contacted', 'x@y.com', null)
    const r = await recordBackfillEvent({ householdId: 'HH1', module: 'Potentials', recordId: 'D1', fields: {}, actingEmail: 'x@y.com', result: 'ok' })
    for (const res of [u, s, r]) expect(res).toMatchObject({ configured: true, ok: false })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
