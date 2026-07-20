// The rate-book fetch decoupling (2026-07-20). The Lenders page re-renders on
// every scenario / select param change; getRateQuotesFull is agent-scoped and
// identical across those params, so a short in-process cache reads the ~1,257-
// row book ONCE per page visit instead of paginating it on every navigation.
// This proves the cache: repeated calls within the TTL make exactly one DB read.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('getRateQuotesFull caches the agent-scoped book', () => {
  beforeEach(() => {
    vi.stubEnv('UW_SUPABASE_URL', 'https://uw.example.co')
    vi.stubEnv('UW_SUPABASE_READONLY_KEY', 'bearer-key')
    vi.stubEnv('UW_SUPABASE_PUBLISHABLE_KEY', 'apikey')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('reads the DB once for repeated calls, then serves from cache (zero re-reads)', async () => {
    const { getRateQuotesFull } = await import('@/lib/underwriting')
    // One short page (< 1,000 rows) so uwSelectAll stops after a single fetch.
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        { id: 'q1', lender_slug: 'mcap', status: 'approved', confidence: 1, term_months: 60, rate: 4.59 },
      ],
      text: async () => '',
      headers: new Headers(),
    } as unknown as Response)

    // A unique agent id no other test uses, so the module cache starts empty.
    const agentId = 'rate-cache-test-agent-2026-07-20'
    const first = await getRateQuotesFull(agentId)
    const second = await getRateQuotesFull(agentId)
    const third = await getRateQuotesFull(agentId)

    expect(first.configured && first.ok && first.data.length).toBe(1)
    expect(second.configured && second.ok && second.data.length).toBe(1)
    expect(third.configured && third.ok).toBe(true)
    // The book was read from the DB exactly once across three calls.
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
