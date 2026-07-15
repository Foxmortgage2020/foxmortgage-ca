// Lender-notes button logic: demo produces a canned note with ZERO real reads
// or writes (no token mint, no fetch); outside demo it POSTs to the proxy and
// reads the draft out of the GateResult envelope.

import { describe, expect, it, vi } from 'vitest'
import { runLenderNotesGeneration, DEMO_LENDER_NOTE, LENDER_NOTES_CEILING } from '@/lib/lender-notes-client'

const HEADER = 'x-gates-token'

describe('DEMO_LENDER_NOTE obeys the skill rules', () => {
  it('has no em or en dash, carries the sign-off, and fits the ceiling', () => {
    expect(DEMO_LENDER_NOTE).not.toContain('—')
    expect(DEMO_LENDER_NOTE).not.toContain('–')
    expect(DEMO_LENDER_NOTE).toContain('Michael Fox, BRX Mortgage')
    expect(DEMO_LENDER_NOTE).toContain('DEAL SNAPSHOT')
    expect(DEMO_LENDER_NOTE.length).toBeLessThanOrEqual(LENDER_NOTES_CEILING)
    // No US terminology in the canned note.
    expect(/\bW-?2\b|\b401\s?\(?k\)?\b/i.test(DEMO_LENDER_NOTE)).toBe(false)
  })
})

describe('runLenderNotesGeneration', () => {
  it('demo mode returns the canned note with zero real reads or writes', async () => {
    const mintToken = vi.fn(async () => 'should-not-be-called')
    const fetchImpl = vi.fn()
    const r = await runLenderNotesGeneration({
      dealId: 'demo-deal-1',
      advisorContext: 'anything',
      demo: true,
      mintToken,
      gatesTokenHeader: HEADER,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(r).toEqual({ ok: true, note: DEMO_LENDER_NOTE, demo: true })
    expect(mintToken).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('outside demo it mints a token and POSTs to the proxy, returning the draft', async () => {
    const mintToken = vi.fn(async () => 'tok123')
    const fetchImpl = vi.fn(async (_url: string, _opts: any) => ({
      status: 200,
      json: async () => ({ ok: true, data: { generatedText: 'GENERATED NOTE' } }),
    }))
    const r = await runLenderNotesGeneration({
      dealId: 'd-1',
      advisorContext: '  lead with reserves  ',
      demo: false,
      mintToken,
      gatesTokenHeader: HEADER,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(r).toEqual({ ok: true, note: 'GENERATED NOTE' })
    expect(mintToken).toHaveBeenCalledOnce()
    const [url, opts] = fetchImpl.mock.calls[0]!
    expect(url).toBe('/api/portal/admin/gates/deals/d-1/lender-notes')
    expect(opts.method).toBe('POST')
    expect(opts.headers[HEADER]).toBe('tok123')
    expect(JSON.parse(opts.body)).toEqual({ advisor_context: 'lead with reserves' })
  })

  it('omits advisor_context when blank', async () => {
    const fetchImpl = vi.fn(async (_url: string, _opts: any) => ({ status: 200, json: async () => ({ ok: true, data: { generatedText: 'N' } }) }))
    await runLenderNotesGeneration({
      dealId: 'd-1', advisorContext: '   ', demo: false,
      mintToken: async () => 'tok', gatesTokenHeader: HEADER, fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(JSON.parse(fetchImpl.mock.calls[0]![1].body)).toEqual({ advisor_context: undefined })
  })

  it('surfaces the workbench diagnostic on failure', async () => {
    const fetchImpl = vi.fn(async () => ({
      status: 503,
      json: async () => ({ ok: false, kind: 'unavailable', message: 'ANTHROPIC_API_KEY is not configured on the workbench' }),
    }))
    const r = await runLenderNotesGeneration({
      dealId: 'd-1', advisorContext: '', demo: false,
      mintToken: async () => 'tok', gatesTokenHeader: HEADER, fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(r.ok).toBe(false)
    expect(r.message).toContain('ANTHROPIC_API_KEY is not configured')
  })

  it('returns a friendly message when the network throws', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('offline') })
    const r = await runLenderNotesGeneration({
      dealId: 'd-1', advisorContext: '', demo: false,
      mintToken: async () => 'tok', gatesTokenHeader: HEADER, fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(r).toEqual({ ok: false, message: 'Could not reach the server. Check your connection and retry.' })
  })
})
