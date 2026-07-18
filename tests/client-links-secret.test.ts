// Client-link operator secret (B7-P Task 0, 2026-07-18). The FOXCA anon key is
// not a secret, so the admin-side client_link_* functions now demand a second,
// server-held factor (FOXCA_OPERATOR_SECRET, matched against the sha256 in
// migration 20260718160000). These tests prove the STORE half of the contract:
//   1. every admin rpc (create / revoke / links_for_deal) sends p_operator_secret;
//   2. the client-flow rpc (resolve) never does;
//   3. a missing secret fails LOUD (throw), never a silent empty string.
// The DB half — that the function itself refuses a wrong/absent secret — is
// proven live in the report (as the anon role: 42501 operator secret required).
//
// @/lib/demo is forced to the NON-demo branch so the real rpc path runs.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

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
    demoModeAvailable: () => false,
    isDemoMode: () => false,
    blockInDemo: (op: string) => {
      throw new DemoWriteBlocked(op)
    },
    setDemoCookie: async () => {},
    clearDemoCookie: async () => {},
  }
})

import {
  createClientLink,
  revokeClientLink,
  clientLinksForDeal,
  resolveClientLink,
} from '@/lib/client-links-store'

const SECRET = 'test-operator-secret-value'

// Capture the JSON body of the last rpc POST, keyed by function name.
function mockFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    return {
      ok: true,
      status: 200,
      // An empty array is a valid shape for every store reader (list maps it,
      // resolve reads [0]); the tests inspect the REQUEST body, not this.
      json: async () => [],
      text: async () => '',
      headers: new Headers(),
    } as unknown as Response
  })
}

function fnFrom(spy: ReturnType<typeof mockFetch>, idx = 0): { fn: string; args: any } {
  const call = spy.mock.calls[idx]!
  const url = String(call[0])
  const fn = url.split('/rpc/')[1] ?? url
  const args = JSON.parse(String((call[1] as RequestInit).body))
  return { fn, args }
}

describe('client-links store threads the operator secret (B7-P Task 0)', () => {
  let spy: ReturnType<typeof mockFetch>
  beforeEach(() => {
    process.env.FOXCA_SUPABASE_URL = 'https://foxca.example.co'
    process.env.FOXCA_SUPABASE_KEY = 'anon-key'
    process.env.FOXCA_OPERATOR_SECRET = SECRET
    spy = mockFetch()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('create sends p_operator_secret with the env value', async () => {
    await createClientLink({
      zohoDealId: '7112178000000000001',
      fileRef: 'FOX-TEST',
      tokenHash: 'a'.repeat(64),
      createdBy: 'mfox@foxmortgage.ca',
      expiresAt: new Date().toISOString(),
    })
    const { fn, args } = fnFrom(spy)
    expect(fn).toBe('client_link_create')
    expect(args.p_operator_secret).toBe(SECRET)
  })

  it('revoke sends p_operator_secret', async () => {
    await revokeClientLink('11111111-1111-1111-1111-111111111111', 'mfox@foxmortgage.ca')
    const { fn, args } = fnFrom(spy)
    expect(fn).toBe('client_link_revoke')
    expect(args.p_operator_secret).toBe(SECRET)
  })

  it('links_for_deal sends p_operator_secret', async () => {
    await clientLinksForDeal('7112178000000000001')
    const { fn, args } = fnFrom(spy)
    expect(fn).toBe('client_links_for_deal')
    expect(args.p_operator_secret).toBe(SECRET)
  })

  it('the client-flow resolve NEVER carries the secret', async () => {
    await resolveClientLink('b'.repeat(64))
    const { fn, args } = fnFrom(spy)
    expect(fn).toBe('client_link_resolve')
    expect('p_operator_secret' in args).toBe(false)
  })

  it('a missing FOXCA_OPERATOR_SECRET fails LOUD (throws), never a silent empty secret', async () => {
    delete process.env.FOXCA_OPERATOR_SECRET
    await expect(
      createClientLink({
        zohoDealId: '7112178000000000001',
        fileRef: null,
        tokenHash: 'c'.repeat(64),
        createdBy: 'mfox@foxmortgage.ca',
        expiresAt: new Date().toISOString(),
      }),
    ).rejects.toThrow(/FOXCA_OPERATOR_SECRET is not set/)
    // And it threw BEFORE any network call — no empty secret ever left the box.
    expect(spy).not.toHaveBeenCalled()
  })
})
