// Comms gate client (B7-P, adversarial-review fix). The workbench's comms
// approve gate overloads HTTP 409 with the true fail-closed reason (the kill
// switch is off, the client is suppressed, a cap was hit, the mode gate
// refused). In the engine's dark-by-default state that reason is exactly what
// the operator needs, so approveCommsTouch must surface the workbench message
// rather than the generic "Already decided." — while other queues keep the
// fixed 409 copy. @/lib/demo is forced non-demo so the real gate path runs.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/demo', () => {
  class DemoWriteBlocked extends Error {
    constructor(op: string) {
      super(`Demo mode is read-only; the operation "${op}" was blocked.`)
      this.name = 'DemoWriteBlocked'
    }
  }
  return {
    DEMO_COOKIE: 'fox_demo', DEMO_AGENT_ID: 'demo-agent', DemoWriteBlocked,
    demoModeAvailable: () => false, isDemoMode: () => false,
    blockInDemo: (op: string) => { throw new DemoWriteBlocked(op) },
    setDemoCookie: async () => {}, clearDemoCookie: async () => {},
  }
})

import { approveCommsTouch, skipCommsTouch } from '@/lib/gates'

function mock409(errorMessage: string) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: false, status: 409,
    json: async () => ({ error: errorMessage }),
    text: async () => JSON.stringify({ error: errorMessage }),
    headers: new Headers(),
  } as unknown as Response)
}

describe('comms approve surfaces the workbench 409 reason (kill switch / cap / suppression)', () => {
  beforeEach(() => { process.env.GATES_API_URL = 'https://gates.example.co' })
  afterEach(() => { vi.restoreAllMocks() })

  it('approve shows the workbench kill-switch reason, not the generic already-decided copy', async () => {
    mock409('client comms are turned off (the kill switch); nothing was approved or sent')
    const r = await approveCommsTouch('t1', 'tok')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.kind).toBe('conflict')
      expect(r.message).toBe('client comms are turned off (the kill switch); nothing was approved or sent')
      expect(r.message).not.toBe('Already decided.')
    }
  })

  it('a cap / suppression refusal reason is surfaced too', async () => {
    mock409('the client is on the suppression list')
    const r = await approveCommsTouch('t1', 'tok')
    expect(r.ok === false && r.message).toBe('the client is on the suppression list')
  })

  it('skip (no surface409) keeps the fixed 409 copy — 409 there genuinely means already decided', async () => {
    mock409('the touch was decided concurrently')
    const r = await skipCommsTouch('t1', 'stale', 'tok')
    expect(r.ok === false && r.message).toBe('Already decided.')
  })
})
