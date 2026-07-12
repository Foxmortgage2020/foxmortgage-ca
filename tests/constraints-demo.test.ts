// Demo-mode guard for the client-constraints store. Constraints are per-client
// PII, so in demo every READ resolves to empty and every WRITE is refused, all
// without touching the network. Mirrors tests/smm-demo.test.ts.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/demo', () => ({ isDemoMode: () => true }))

import {
  constraintsFor,
  pinConfirmationsFor,
  addConstraint,
  retireConstraint,
  addPinConfirmation,
} from '@/lib/constraints-store'

describe('constraints store is inert in demo mode', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    process.env.FOXCA_SUPABASE_URL = 'https://demo.example.co'
    process.env.FOXCA_SUPABASE_KEY = 'demo-key'
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network must not be reached in demo'))
  })
  afterEach(() => fetchSpy.mockRestore())

  it('reads resolve to empty with zero network calls', async () => {
    expect(await constraintsFor('K')).toMatchObject({ configured: true, ok: true, data: [] })
    expect(await pinConfirmationsFor('K')).toMatchObject({ configured: true, ok: true, data: [] })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('writes are refused with zero network calls', async () => {
    const a = await addConstraint({ clientKey: 'K', lenderSlug: 'scotia', lenderLabel: null, type: 'excluded', reason: 'test reason', actingEmail: 'x@y.com' })
    const r = await retireConstraint('id', 'x@y.com')
    const p = await addPinConfirmation({ clientKey: 'K', quoteId: 'q', lenderSlug: 'scotia', requirement: 'physician', requirementText: null, actingEmail: 'x@y.com' })
    for (const res of [a, r, p]) expect(res).toMatchObject({ configured: true, ok: false })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
