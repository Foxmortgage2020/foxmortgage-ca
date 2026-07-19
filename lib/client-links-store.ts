// FOXCA client-portal-links store. Server-only: talks to the foxmortgage-ca
// Supabase project through the narrow security-definer functions from
// migration 20260717150000; the key holds no direct table privileges (RLS on,
// grants revoked). Twin of lib/renewals-store.ts.
//
// DEMO POSTURE, decided deliberately so a later reader does not "fix" it:
//   - The ADMIN side (list / create / revoke) is demo-guarded. Links are
//     per-client PII, the same reasoning as lib/constraints-store.ts.
//   - resolveClientLink is NOT demo-guarded, on purpose. It is keyed by a
//     secret hash that the demo book has no token for, so it cannot leak
//     anything; guarding it would make a real link resolve to a false
//     not-found for anyone who happened to be in demo mode.
//
// Nothing here ever returns a raw token: we never store one. The token exists
// exactly once, in the URL Michael copies, and only its sha256 lives here.

import { isDemoMode, blockInDemo } from '@/lib/demo'
import type { ClientLinkRow } from '@/lib/client-links'

export type ClientLinkStoreResult<T> =
  | { configured: false }
  | { configured: true; ok: true; data: T }
  | { configured: true; ok: false; error: string }

function foxcaEnv(): { url: string; key: string } | null {
  const url = process.env.FOXCA_SUPABASE_URL
  const key = process.env.FOXCA_SUPABASE_KEY
  if (!url || !key) return null
  return { url: url.replace(/\/+$/, '').replace(/\/rest\/v1$/, ''), key }
}

// The operator secret (B7-P Task 0). The FOXCA anon key is not a secret — it is
// shared with public form-intake — so the admin-side client_link_* functions
// (create / revoke / links_for_deal) now demand this second, server-held factor
// (migration 20260718160000). It is passed to those functions and matched
// against the sha256 they carry; it lives ONLY here, server-side, never
// NEXT_PUBLIC. Throw-if-unset (the SESSION_SECRET discipline) so a misconfigured
// deploy fails loud rather than silently sending an empty secret a permissive
// function might one day accept.
function foxcaOperatorSecret(): string {
  const s = process.env.FOXCA_OPERATOR_SECRET
  if (!s) {
    throw new Error('FOXCA_OPERATOR_SECRET is not set. Add it to .env.local and Vercel (all targets).')
  }
  return s
}

export function clientLinksStoreConfigured(): boolean {
  return foxcaEnv() !== null
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<ClientLinkStoreResult<T>> {
  const env = foxcaEnv()
  if (!env) return { configured: false }
  const started = Date.now()
  try {
    const res = await fetch(`${env.url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: env.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      cache: 'no-store',
    })
    const ms = Date.now() - started
    if (!res.ok) {
      // Function name, status, duration. Never args: they carry a token hash
      // and a client's file ref.
      console.error(`[client-links-store] ${fn} HTTP ${res.status} ms=${ms}`)
      const body = (await res.json().catch(() => null)) as { message?: string } | null
      return {
        configured: true,
        ok: false,
        error: body?.message ? String(body.message).slice(0, 200) : `Store query failed (HTTP ${res.status})`,
      }
    }
    const data = (await res.json().catch(() => null)) as T
    console.log(`[client-links-store] ${fn} ok ms=${ms}`)
    return { configured: true, ok: true, data }
  } catch {
    console.error(`[client-links-store] ${fn} unreachable ms=${Date.now() - started}`)
    return { configured: true, ok: false, error: 'Client links store unreachable' }
  }
}

export interface ClientLinkSummary {
  id: string
  zohoDealId: string
  fileRef: string | null
  createdBy: string
  createdAt: string
  expiresAt: string
  revokedAt: string | null
  lastViewedAt: string | null
}

function mapSummary(r: any): ClientLinkSummary {
  return {
    id: String(r.id),
    zohoDealId: String(r.zoho_deal_id),
    fileRef: r.file_ref ?? null,
    createdBy: String(r.created_by ?? ''),
    createdAt: String(r.created_at),
    expiresAt: String(r.expires_at),
    revokedAt: r.revoked_at ?? null,
    lastViewedAt: r.last_viewed_at ?? null,
  }
}

export interface ResolvedLink {
  id: string
  zohoDealId: string
  fileRef: string | null
  expiresAt: string
}

/**
 * Token hash → the deal it opens, or null. Returns null for expired and
 * revoked links too (the function filters them), so the caller cannot tell
 * those apart from "never existed" — the client route must never be an
 * oracle about which tokens were once real.
 *
 * NOT demo-guarded, deliberately (see the header).
 */
export async function resolveClientLink(
  tokenHash: string,
): Promise<ClientLinkStoreResult<ResolvedLink | null>> {
  const res = await rpc<any[]>('client_link_resolve', { p_token_hash: tokenHash })
  if (!res.configured || !res.ok) return res as ClientLinkStoreResult<ResolvedLink | null>
  const row = Array.isArray(res.data) ? res.data[0] : null
  if (!row) return { configured: true, ok: true, data: null }
  return {
    configured: true,
    ok: true,
    data: {
      id: String(row.id),
      zohoDealId: String(row.zoho_deal_id),
      fileRef: row.file_ref ?? null,
      expiresAt: String(row.expires_at),
    },
  }
}

/** Best effort: a failed stamp never costs the client their page. */
export async function touchClientLink(id: string): Promise<void> {
  await rpc<null>('client_link_touch', { p_id: id }).catch(() => undefined)
}

export async function createClientLink(input: {
  zohoDealId: string
  fileRef: string | null
  tokenHash: string
  createdBy: string
  expiresAt: string
}): Promise<ClientLinkStoreResult<string>> {
  if (isDemoMode()) blockInDemo('client-link.create')
  const res = await rpc<string>('client_link_create', {
    p_zoho_deal_id: input.zohoDealId,
    p_file_ref: input.fileRef,
    p_token_hash: input.tokenHash,
    p_created_by: input.createdBy,
    p_expires_at: input.expiresAt,
    p_operator_secret: foxcaOperatorSecret(),
  })
  return res
}

export async function revokeClientLink(
  id: string,
  revokedBy: string,
): Promise<ClientLinkStoreResult<string | null>> {
  if (isDemoMode()) blockInDemo('client-link.revoke')
  return rpc<string | null>('client_link_revoke', {
    p_id: id,
    p_revoked_by: revokedBy,
    p_operator_secret: foxcaOperatorSecret(),
  })
}

export async function clientLinksForDeal(
  zohoDealId: string,
): Promise<ClientLinkStoreResult<ClientLinkSummary[]>> {
  if (isDemoMode()) return { configured: true, ok: true, data: [] }
  const res = await rpc<any[]>('client_links_for_deal', {
    p_zoho_deal_id: zohoDealId,
    p_operator_secret: foxcaOperatorSecret(),
  })
  if (!res.configured || !res.ok) return res as ClientLinkStoreResult<ClientLinkSummary[]>
  return { configured: true, ok: true, data: (res.data ?? []).map(mapSummary) }
}

/** The audit trail. Never breaks the caller: record failures are swallowed. */
export async function recordClientLinkEvent(input: {
  linkId: string | null
  zohoDealId: string
  fileRef: string | null
  action: 'created' | 'revoked'
  actingEmail: string
  result?: string
}): Promise<void> {
  if (isDemoMode()) return
  await rpc<string>('client_link_event_record', {
    p_link_id: input.linkId,
    p_zoho_deal_id: input.zohoDealId,
    p_file_ref: input.fileRef,
    p_action: input.action,
    p_acting_email: input.actingEmail,
    p_result: input.result ?? 'ok',
    // Hardened FOXCA-wide 2026-07-18: closes the B7-P residual (anon could forge audit rows).
    p_operator_secret: foxcaOperatorSecret(),
  }).catch(() => undefined)
}

export type { ClientLinkRow }
