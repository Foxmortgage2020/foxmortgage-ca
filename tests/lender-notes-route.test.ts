// The portal's caller for the native Lender Notes Generator (N-06), held to
// the four things that would be dangerous to get wrong: the permission gate,
// the demo refusal, the fact that the BROWSER NEVER NAMES THE ZOHO RECORD, and
// the honest reporting of a partial write.
//
// The engine itself is fox-underwriting's and is not re-tested here. What is
// tested is everything this repo owns between the button and the bridge.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { LenderNotesBridgeResult, LenderNotesRequest } from '@/lib/lender-notes-bridge'

let gate: { ok: boolean; status?: number; message?: string; user?: unknown } = { ok: true, user: { id: 'u1' } }
let demo = false
let deal: Record<string, unknown> | null = null
let agentOk = true
let bridgeCalls: LenderNotesRequest[] = []
let bridgeResult: LenderNotesBridgeResult

vi.mock('@/lib/authz', () => ({
  apiPermission: vi.fn(async () => gate),
}))
vi.mock('@/lib/demo', () => ({
  isDemoMode: vi.fn(() => demo),
}))
vi.mock('@/lib/underwriting', () => ({
  getAgentIdByEmail: vi.fn(async () =>
    agentOk ? { configured: true, ok: true, data: 'agent-1' } : { configured: true, ok: false, error: 'down' },
  ),
  getDealDetail: vi.fn(async () => ({ configured: true, ok: true, data: deal })),
}))
vi.mock('@/lib/lender-notes-bridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/lender-notes-bridge')>()
  return {
    ...actual,
    runLenderNotesOnCrm: vi.fn(async (req: LenderNotesRequest) => {
      bridgeCalls.push(req)
      return bridgeResult
    }),
  }
})

// Imported after the mocks so the route binds the doubles.
import { POST } from '@/app/api/portal/admin/underwriting/lender-notes/[dealId]/route'
import { apiPermission } from '@/lib/authz'

const URL_BASE = 'https://www.foxmortgage.ca/api/portal/admin/underwriting/lender-notes/wb-uuid-1'

function post(body: unknown = {}) {
  return new Request(URL_BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}
const params = { params: { dealId: 'wb-uuid-1' } }

function run(over: Record<string, unknown> = {}) {
  return {
    ok: true, dryRun: false, outcome: 'generated', mode: 'DRAFT',
    dealId: 'z-1', dealName: 'a file', note: 'THE NOTE', diagnostics: null,
    model: 'm', sources: null,
    writes: { history_note: true, lender_notes: true, log_note: true },
    notes: [], errors: [], auditId: 'a-1', ...over,
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  gate = { ok: true, user: { id: 'u1' } }
  demo = false
  agentOk = true
  deal = { id: 'wb-uuid-1', zohoPotentialId: '711217800000000001', finmoAppId: 'finmo-abc' }
  bridgeCalls = []
  bridgeResult = { ok: true, run: run() }
})
afterEach(() => vi.restoreAllMocks())

describe('the gate comes before anything else', () => {
  it('gates on notes.crm.write, not on the draft key', async () => {
    await POST(post(), params)
    expect(apiPermission).toHaveBeenCalledWith('notes.crm.write')
  })

  it('refuses a signed-out caller and never reaches the bridge', async () => {
    gate = { ok: false, status: 401, message: 'Signed out.' }
    const res = await POST(post(), params)
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ ok: false, kind: 'auth' })
    expect(bridgeCalls).toHaveLength(0)
  })

  it('refuses a caller without the permission and never reaches the bridge', async () => {
    gate = { ok: false, status: 403, message: 'You do not have permission for this action.' }
    const res = await POST(post(), params)
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ ok: false, kind: 'forbidden' })
    expect(bridgeCalls).toHaveLength(0)
  })

  it('refuses in demo, so a demo press can never reach a real file', async () => {
    demo = true
    const res = await POST(post({ dry_run: true }), params)
    expect(res.status).toBe(403)
    expect(bridgeCalls).toHaveLength(0)
  })
})

describe('the browser never names the Zoho record', () => {
  it('takes both identifiers off the workbench row, ignoring anything posted', async () => {
    // A client-supplied Zoho id on a CRM write is how one file's note lands on
    // another file. The body is read for mode and flags only.
    await POST(post({ zoho_deal_id: '999_ATTACKER', finmo_application_id: 'evil', dealId: 'other' }), params)
    expect(bridgeCalls[0]).toMatchObject({
      zohoDealId: '711217800000000001',
      finmoApplicationId: 'finmo-abc',
    })
  })

  it('404s when the deal room is not in the workbench', async () => {
    deal = null
    const res = await POST(post(), params)
    expect(res.status).toBe(404)
    expect(bridgeCalls).toHaveLength(0)
  })

  it('503s rather than guessing when the workbench cannot resolve the agent', async () => {
    agentOk = false
    const res = await POST(post(), params)
    expect(res.status).toBe(503)
    expect(bridgeCalls).toHaveLength(0)
  })
})

describe('the request the engine receives', () => {
  it('defaults to DRAFT and to a real run, with no force', async () => {
    await POST(post(), params)
    expect(bridgeCalls[0]).toMatchObject({ mode: 'DRAFT', dryRun: false, force: false })
  })

  it('carries dry_run and force through when asked', async () => {
    await POST(post({ dry_run: true, force: true }), params)
    expect(bridgeCalls[0]).toMatchObject({ dryRun: true, force: true })
  })

  it('accepts FINAL as the engine contract allows, but never invents it', async () => {
    await POST(post({ mode: 'final' }), params)
    expect(bridgeCalls[0]!.mode).toBe('FINAL')
    // No UI offers FINAL this session; the default stays DRAFT.
    await POST(post({}), params)
    expect(bridgeCalls[1]!.mode).toBe('DRAFT')
  })

  it('422s an unknown mode rather than silently downgrading it', async () => {
    const res = await POST(post({ mode: 'YOLO' }), params)
    expect(res.status).toBe(422)
    expect(bridgeCalls).toHaveLength(0)
  })

  it('treats an empty body as a plain DRAFT run', async () => {
    const res = await POST(new Request(URL_BASE, { method: 'POST' }), params)
    expect(res.status).toBe(200)
    expect(bridgeCalls[0]).toMatchObject({ mode: 'DRAFT', dryRun: false })
  })
})

describe('what comes back', () => {
  it('passes the run through on success', async () => {
    const res = await POST(post(), params)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.run.writes).toEqual({ history_note: true, lender_notes: true, log_note: true })
  })

  it('keeps the partial-write detail on a failure, so a half-run is visible', async () => {
    bridgeResult = {
      ok: false, kind: 'engine', message: 'Lender_Notes update failed',
      run: run({ ok: false, outcome: 'generation_failed', writes: { history_note: true, lender_notes: false, log_note: false } }),
    }
    const res = await POST(post(), params)
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.run.writes).toEqual({ history_note: true, lender_notes: false, log_note: false })
    expect(body.message).toContain('Lender_Notes update failed')
  })

  it('maps a refused bridge credential to 502, never to a 401 at the browser', async () => {
    // The caller's session was already gated here, so 401 would send an admin
    // to sign in again over a secret mismatch they cannot fix by signing in.
    bridgeResult = { ok: false, kind: 'credential', message: 'refused', run: null }
    expect((await POST(post(), params)).status).toBe(502)
  })

  it('maps a missing bridge configuration to 503', async () => {
    bridgeResult = { ok: false, kind: 'not-configured', message: 'not wired', run: null }
    expect((await POST(post(), params)).status).toBe(503)
  })
})
