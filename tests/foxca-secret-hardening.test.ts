// FOXCA-wide operator-secret hardening (2026-07-18). Every admin-side FOXCA
// security-definer function now demands FOXCA_OPERATOR_SECRET (migration
// 20260718190000). These tests prove the STORE half of the contract per family:
//   1. every hardened rpc call sends p_operator_secret (source coverage — the
//      one place a missed call would silently ship an un-hardened feature);
//   2. the exempt user-scoped reads NEVER send it;
//   3. at runtime, a representative from each family sends the env value, and a
//      missing FOXCA_OPERATOR_SECRET fails LOUD (throws) before any network call.
// The DB half — the function itself refuses a wrong/absent secret (42501) — is
// proven live in docs/foxca-hardening-2026-07-18.md as the anon role.
//
// @/lib/demo is forced NON-demo so the real rpc path runs.

import { readFileSync } from 'node:fs'
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

// ── Source coverage: every hardened call carries the secret; opens do not ────

const SPEC: { path: string; harden: string[]; open: string[] }[] = [
  {
    path: 'lib/compliance.ts',
    harden: ['compliance_credentials_list', 'compliance_credential_save', 'compliance_credential_retire', 'compliance_complaints_list', 'compliance_complaint_create', 'compliance_complaint_set_status', 'compliance_policies_list', 'compliance_policy_versions_list', 'compliance_policy_acks_list', 'compliance_policy_create', 'compliance_policy_update', 'compliance_policy_ack', 'compliance_events_list'],
    open: [],
  },
  {
    path: 'lib/notifications-store.ts',
    harden: ['notification_upsert', 'notification_mark_read', 'notification_mark_all_read', 'notification_pref_set'],
    open: ['notifications_list_for_user', 'notification_prefs_get'],
  },
  {
    path: 'lib/people-store.ts',
    harden: ['people_provision_record', 'people_provision_list', 'people_offboard_record', 'people_offboard_check', 'people_offboard_get', 'people_offboard_list', 'view_as_start', 'view_as_end', 'view_as_list'],
    open: [],
  },
  {
    path: 'lib/renewals-store.ts',
    harden: ['renewal_event_record', 'renewal_events_for_deal', 'renewal_events_recent'],
    open: [],
  },
  {
    path: 'lib/saved-scenarios-store.ts',
    harden: ['saved_scenario_create', 'saved_scenario_retire'],
    open: ['saved_scenarios_list_for_user'],
  },
  {
    path: 'lib/smm-store.ts',
    harden: ['smm_upload_create', 'smm_upload_finalize', 'smm_rows_insert', 'smm_rows_for_upload', 'smm_uploads_recent', 'smm_opportunity_status_set', 'smm_opportunity_status_latest', 'smm_override_set', 'smm_override_retire', 'smm_overrides_active', 'smm_backfill_record', 'savings_analysis_record', 'savings_analysis_record_batch'],
    open: [],
  },
  {
    path: 'lib/constraints-store.ts',
    harden: ['client_constraint_add', 'client_constraint_retire', 'client_constraints_for', 'pin_confirmation_add', 'pin_confirmations_for'],
    open: [],
  },
  {
    path: 'lib/agent/store.ts',
    harden: ['agent_conversation_create', 'agent_conversations_list', 'agent_conversation_get', 'agent_conversation_set_status', 'agent_message_append', 'agent_messages_list', 'agent_card_create', 'agent_cards_list', 'agent_card_get', 'agent_card_decide'],
    open: [],
  },
  {
    path: 'lib/status.ts',
    harden: ['form_submission_stats', 'form_submission_failures', 'acknowledge_form_submission'],
    open: [],
  },
  {
    path: 'lib/client-links-store.ts',
    harden: ['client_link_event_record'],
    open: ['client_link_resolve', 'client_link_touch'],
  },
]

// Extract the balanced { … } object that follows the fn occurrence (the rpc
// args object, or the fetch options object for the direct-fetch calls in
// status.ts — p_operator_secret nests inside its body either way). A fixed
// window bled into neighbouring functions; balanced braces do not.
function callChunk(src: string, fn: string): string | null {
  const m = src.match(new RegExp(`'${fn}'|/rpc/${fn}\``))
  if (!m || m.index === undefined) return null
  const open = src.indexOf('{', m.index)
  if (open === -1) return null
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) return src.slice(open, i + 1)
    }
  }
  return src.slice(open)
}

describe('FOXCA hardening — source coverage', () => {
  it('every hardened store call threads p_operator_secret, and every exempt read does not', () => {
    const fails: string[] = []
    for (const { path, harden, open } of SPEC) {
      const src = readFileSync(path, 'utf8')
      if (harden.length && !/foxca-secret|foxcaOperatorSecret/.test(src)) fails.push(`${path}: no foxcaOperatorSecret`)
      for (const fn of harden) {
        const ch = callChunk(src, fn)
        if (!ch) fails.push(`${path}: ${fn} call not found`)
        else if (!ch.includes('p_operator_secret')) fails.push(`${path}: ${fn} MISSING p_operator_secret`)
      }
      for (const fn of open) {
        const ch = callChunk(src, fn)
        if (ch && ch.includes('p_operator_secret')) fails.push(`${path}: open ${fn} wrongly carries the secret`)
      }
    }
    expect(fails, fails.join('\n')).toEqual([])
  })
})

// ── Runtime: a representative per family sends the secret; unset fails loud ───

const SECRET = 'test-foxca-operator-secret'

function mockFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => [],
    text: async () => '',
    headers: new Headers(),
  } as unknown as Response))
}
function lastBody(spy: ReturnType<typeof mockFetch>): { fn: string; args: any } {
  const call = spy.mock.calls[0]!
  const fn = String(call[0]).split('/rpc/')[1] ?? String(call[0])
  return { fn, args: JSON.parse(String((call[1] as RequestInit).body)) }
}

describe('FOXCA hardening — runtime, per family', () => {
  let spy: ReturnType<typeof mockFetch>
  beforeEach(() => {
    process.env.FOXCA_SUPABASE_URL = 'https://foxca.example.co'
    process.env.FOXCA_SUPABASE_KEY = 'anon-key'
    process.env.FOXCA_OPERATOR_SECRET = SECRET
    spy = mockFetch()
  })
  afterEach(() => vi.restoreAllMocks())

  it('notifications: a hardened write sends the secret; a user-scoped read does not', async () => {
    const { markAllRead, getPrefs } = await import('@/lib/notifications-store')
    await markAllRead('user-1')
    expect(lastBody(spy)).toMatchObject({ fn: 'notification_mark_all_read', args: { p_operator_secret: SECRET } })
    vi.restoreAllMocks()
    spy = mockFetch()
    await getPrefs('user-1')
    expect(lastBody(spy).fn).toBe('notification_prefs_get')
    expect('p_operator_secret' in lastBody(spy).args).toBe(false)
  })

  it('people/view-as, renewals, smm, constraints each send the secret', async () => {
    const { viewAsList } = await import('@/lib/people-store')
    await viewAsList(50)
    expect(lastBody(spy).args.p_operator_secret).toBe(SECRET)

    vi.restoreAllMocks(); spy = mockFetch()
    const { recentRenewalEvents } = await import('@/lib/renewals-store')
    await recentRenewalEvents(50)
    expect(lastBody(spy).args.p_operator_secret).toBe(SECRET)

    vi.restoreAllMocks(); spy = mockFetch()
    const { recentUploads } = await import('@/lib/smm-store')
    await recentUploads(10)
    expect(lastBody(spy).args.p_operator_secret).toBe(SECRET)

    vi.restoreAllMocks(); spy = mockFetch()
    const { constraintsFor } = await import('@/lib/constraints-store')
    await constraintsFor('client-1')
    expect(lastBody(spy).args.p_operator_secret).toBe(SECRET)
  })

  it('saved-scenarios: the user-scoped list stays open (no secret)', async () => {
    const { listSavedScenarios } = await import('@/lib/saved-scenarios-store')
    await listSavedScenarios('user-1')
    expect(lastBody(spy).fn).toBe('saved_scenarios_list_for_user')
    expect('p_operator_secret' in lastBody(spy).args).toBe(false)
  })

  it('a missing FOXCA_OPERATOR_SECRET fails LOUD before any network call', async () => {
    delete process.env.FOXCA_OPERATOR_SECRET
    const { recentUploads } = await import('@/lib/smm-store')
    await expect(recentUploads(10)).rejects.toThrow(/FOXCA_OPERATOR_SECRET is not set/)
    expect(spy).not.toHaveBeenCalled()
  })
})
