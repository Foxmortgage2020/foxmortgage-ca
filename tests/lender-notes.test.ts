// Lender-notes button logic: demo produces a canned note with ZERO real reads
// or writes (no token mint, no fetch); outside demo it POSTs to the proxy and
// reads the draft out of the GateResult envelope.

import { describe, expect, it, vi } from 'vitest'
import { runLenderNotesGeneration, runFinmoPull, runSubmissionSet, runNoteEdit, DEMO_LENDER_NOTE, LENDER_NOTES_CEILING } from '@/lib/lender-notes-client'

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

  it('a fresh-pull failure surfaces the stale-fallback offer; a second call sends allow_stale_snapshot', async () => {
    const fetchFail = vi.fn(async () => ({
      status: 502,
      json: async () => ({ ok: false, message: 'Finmo was unreachable (HTTP 403). The last snapshot was pulled 15 hours ago. To generate from that snapshot instead, confirm the stale-snapshot fallback.' }),
    }))
    const r1 = await runLenderNotesGeneration({ dealId: 'd-1', advisorContext: '', demo: false, mintToken: async () => 'tok', gatesTokenHeader: HEADER, fetchImpl: fetchFail as unknown as typeof fetch })
    expect(r1.ok).toBe(false)
    expect(r1.staleFallbackAvailable).toBe(true)

    const fetchOk = vi.fn(async (_url: string, _opts: any) => ({ status: 200, json: async () => ({ ok: true, data: { generatedText: 'N' } }) }))
    await runLenderNotesGeneration({ dealId: 'd-1', advisorContext: '', demo: false, allowStale: true, mintToken: async () => 'tok', gatesTokenHeader: HEADER, fetchImpl: fetchOk as unknown as typeof fetch })
    expect(JSON.parse((fetchOk.mock.calls[0]![1] as { body: string }).body)).toEqual({ allow_stale_snapshot: true })
  })

  it('surfaces the over-ceiling flag + count on an over-length draft; a normal note carries neither', async () => {
    const over = vi.fn(async () => ({ status: 200, json: async () => ({ ok: true, data: { generatedText: 'LONG NOTE', overCeiling: true, chars: 4094 } }) }))
    const r = await runLenderNotesGeneration({ dealId: 'd-1', advisorContext: '', demo: false, mintToken: async () => 'tok', gatesTokenHeader: HEADER, fetchImpl: over as unknown as typeof fetch })
    expect(r).toMatchObject({ ok: true, note: 'LONG NOTE', overCeiling: true, chars: 4094 })
    const ok = vi.fn(async () => ({ status: 200, json: async () => ({ ok: true, data: { generatedText: 'N' } }) }))
    const r2 = await runLenderNotesGeneration({ dealId: 'd-1', advisorContext: '', demo: false, mintToken: async () => 'tok', gatesTokenHeader: HEADER, fetchImpl: ok as unknown as typeof fetch })
    expect(r2.overCeiling).toBeUndefined()
  })

  it('a non-stale failure does not offer the fallback', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 502, json: async () => ({ ok: false, message: 'the note failed validation: contains an em dash' }) }))
    const r = await runLenderNotesGeneration({ dealId: 'd-1', advisorContext: '', demo: false, mintToken: async () => 'tok', gatesTokenHeader: HEADER, fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(r.ok).toBe(false)
    expect(r.staleFallbackAvailable).toBe(false)
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

  it('surfaces context/snapshot counts + a replaced-edit warning on success', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ ok: true, data: { generatedText: 'N', finmoSnapshot: 'refreshed', callsInWindow: 2, emailsLinked: 3, replacedEditCount: 1 } }) }))
    const r = await runLenderNotesGeneration({
      dealId: 'd-1', advisorContext: '', demo: false,
      mintToken: async () => 'tok', gatesTokenHeader: HEADER, fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(r).toMatchObject({ ok: true, finmoSnapshot: 'refreshed', callsInWindow: 2, emailsLinked: 3, replacedEditCount: 1 })
  })
})

describe('the readiness-strip actions are demo-safe (zero real reads or writes)', () => {
  const mintToken = () => { throw new Error('mintToken must not be called in demo') }
  const fetchImpl = vi.fn()
  const demoArgs = { demo: true, mintToken: mintToken as unknown as () => Promise<string | null>, gatesTokenHeader: HEADER, fetchImpl: fetchImpl as unknown as typeof fetch }

  it('runFinmoPull no-ops in demo', async () => {
    const r = await runFinmoPull({ dealId: 'demo-deal-1', ...demoArgs })
    expect(r.ok).toBe(true); expect(r.demo).toBe(true); expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('runSubmissionSet no-ops in demo', async () => {
    const r = await runSubmissionSet({ dealId: 'demo-deal-1', action: 'set_target_lender', value: 'TD', ...demoArgs })
    expect(r.ok).toBe(true); expect(r.demo).toBe(true); expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('runNoteEdit no-ops in demo', async () => {
    const r = await runNoteEdit({ dealId: 'demo-deal-1', text: 'edited body of a note long enough to save', ...demoArgs })
    expect(r.ok).toBe(true); expect(r.demo).toBe(true); expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('the readiness-strip actions POST to the proxy outside demo', () => {
  it('runSubmissionSet posts the action + value + note', async () => {
    const fetchImpl = vi.fn(async (_url: string, _opts: any) => ({ status: 200, json: async () => ({ ok: true, data: {} }) }))
    await runSubmissionSet({ dealId: 'd-1', action: 'set_rate_override', value: 4.29, note: 'BDM quote', demo: false, mintToken: async () => 'tok', gatesTokenHeader: HEADER, fetchImpl: fetchImpl as unknown as typeof fetch })
    const [url, opts] = fetchImpl.mock.calls[0]!
    expect(url).toBe('/api/portal/admin/gates/deals/d-1/submission')
    expect(JSON.parse(opts.body)).toEqual({ action: 'set_rate_override', value: 4.29, note: 'BDM quote' })
    expect(opts.headers[HEADER]).toBe('tok')
  })
  it('runNoteEdit posts the edited text', async () => {
    const fetchImpl = vi.fn(async (_url: string, _opts: any) => ({ status: 200, json: async () => ({ ok: true, data: {} }) }))
    await runNoteEdit({ dealId: 'd-1', text: 'the edited note body', demo: false, mintToken: async () => 'tok', gatesTokenHeader: HEADER, fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(fetchImpl.mock.calls[0]![0]).toBe('/api/portal/admin/gates/deals/d-1/lender-notes/edit')
    expect(JSON.parse(fetchImpl.mock.calls[0]![1].body)).toEqual({ text: 'the edited note body' })
  })
})
