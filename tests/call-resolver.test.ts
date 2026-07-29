// Unassigned-call resolver (CC-03, 2026-07-29).
//
// The claims worth locking on this side: the authority key MATCHES the one the
// Gates API enforces (a mismatch means the UI gates on a permission the server
// does not know, or worse, the reverse), the gates client hits the paths the
// engine actually exposes, and the confirm sends a reviewed identity rather
// than a raw parse.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { PERMISSIONS } from '@/config/authority'
import { ADMIN_NAV } from '@/config/admin-nav'

const UW_REPO = path.resolve(__dirname, '../../fox-underwriting')

describe('the cross-repo authority contract', () => {
  it('grants calls.resolve to admin', () => {
    expect(PERMISSIONS['calls.resolve']).toEqual(['admin'])
  })

  it('MATCHES the key the Gates API enforces server-side', () => {
    // Read, not assumed: CC-02 shipped this key and CC-03's whole first job
    // was mirroring it. If the two ever drift, this fails rather than the UI
    // silently gating on a permission the server does not recognise.
    const remote = readFileSync(path.join(UW_REPO, 'config/authority.ts'), 'utf8')
    const match = remote.match(/'calls\.resolve':\s*\[([^\]]*)\]/)
    expect(match, 'calls.resolve is missing from the Gates API authority matrix').toBeTruthy()
    const remoteRoles = match![1]!.split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean)
    expect(remoteRoles).toEqual(PERMISSIONS['calls.resolve'])
  })

  it('the nav entry is gated on the same key', () => {
    const item = ADMIN_NAV.find(i => i.href === '/portal/admin/calls')
    expect(item).toBeTruthy()
    expect(item!.permission).toBe('calls.resolve')
  })
})

describe('the endpoint contract', () => {
  it('the parse and resolve routes exist in the Gates API at the paths this repo calls', () => {
    const gates = readFileSync(path.resolve(__dirname, '../lib/gates.ts'), 'utf8')
    // What this repo posts to:
    expect(gates).toContain('/api/gates/calls/${callId}/parse')
    expect(gates).toContain('/api/gates/calls/${callId}/resolve')
    // What the engine actually exposes (file-per-route in that repo):
    for (const f of ['parse.ts', 'resolve.ts']) {
      expect(() => readFileSync(path.join(UW_REPO, 'api/gates/calls/[callId]', f), 'utf8')).not.toThrow()
    }
  })

  it('the resolve body carries an identity discriminated by mode, never a raw parse', () => {
    const gates = readFileSync(path.resolve(__dirname, '../lib/gates.ts'), 'utf8')
    expect(gates).toContain("mode: 'existing'")
    expect(gates).toContain("mode: 'create'")
    // The parse response type must NOT be what resolve sends.
    expect(gates).toMatch(/resolveCallIdentity\([\s\S]*?identity: ConfirmedCallIdentity/)
  })

  it('parse is declared as the draft step and resolve as the write', () => {
    const gates = readFileSync(path.resolve(__dirname, '../lib/gates.ts'), 'utf8')
    expect(gates).toMatch(/Draft only[\s\S]*?parseCallIdentity/)
  })
})

describe('the queue read', () => {
  it('filters to the workbench vocabulary for "matching found nobody"', () => {
    const uw = readFileSync(path.resolve(__dirname, '../lib/underwriting.ts'), 'utf8')
    const fn = uw.slice(uw.indexOf('export async function getUnresolvedCalls'))
    expect(fn).toContain("counterparty_type: 'eq.unknown'")
    // Tenancy-scoped from the first query, like every other fetcher here.
    expect(fn).toContain('agent_id: `eq.${agentId}`')
    // The context that makes a caller recognisable comes along.
    expect(fn).toContain('summary')
    expect(fn).toContain('transcript_redacted')
  })

  it('never selects an unmasked number', () => {
    const uw = readFileSync(path.resolve(__dirname, '../lib/underwriting.ts'), 'utf8')
    const fn = uw.slice(uw.indexOf('export async function getUnresolvedCalls'))
    const select = fn.slice(fn.indexOf('select:'), fn.indexOf('agent_id:'))
    expect(select).toContain('counterparty_number_masked')
    expect(select).not.toMatch(/phone_last10|external_number/)
  })
})
