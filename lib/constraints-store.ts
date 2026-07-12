// FOXCA client-constraints store. Server-only: the narrow security-definer
// functions from migration 20260712160000; the key holds no table privileges
// (RLS on, grants revoked). Twin of lib/smm-store.ts. Reads return empty in demo
// (constraints are per-client PII), writes are refused in demo. Nothing deletes;
// a constraint retires. Logs function + status only, never row payloads.

import { isDemoMode } from '@/lib/demo'
import type { Constraint, ConstraintType } from '@/lib/constraints'

export type StoreResult<T> =
  | { configured: false }
  | { configured: true; ok: true; data: T }
  | { configured: true; ok: false; error: string }

function env(): { url: string; key: string } | null {
  const url = process.env.FOXCA_SUPABASE_URL
  const key = process.env.FOXCA_SUPABASE_KEY
  if (!url || !key) return null
  return { url: url.replace(/\/+$/, '').replace(/\/rest\/v1$/, ''), key }
}

export function constraintsStoreConfigured(): boolean {
  return env() !== null
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<StoreResult<T>> {
  const e = env()
  if (!e) return { configured: false }
  const started = Date.now()
  try {
    const res = await fetch(`${e.url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: e.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      cache: 'no-store',
    })
    const ms = Date.now() - started
    if (!res.ok) {
      console.error(`[constraints-store] ${fn} HTTP ${res.status} ms=${ms}`)
      const body = (await res.json().catch(() => null)) as { message?: string } | null
      return { configured: true, ok: false, error: body?.message ? String(body.message).slice(0, 160) : `Store query failed (HTTP ${res.status})` }
    }
    const data = (await res.json().catch(() => null)) as T
    console.log(`[constraints-store] ${fn} ok ms=${ms}`)
    return { configured: true, ok: true, data }
  } catch {
    console.error(`[constraints-store] ${fn} unreachable ms=${Date.now() - started}`)
    return { configured: true, ok: false, error: 'Constraints store unreachable' }
  }
}

function mapConstraint(r: any): Constraint {
  return {
    id: r.id,
    clientKey: r.client_key,
    lenderSlug: r.lender_slug,
    lenderLabel: r.lender_label ?? null,
    type: r.constraint_type as ConstraintType,
    reason: r.reason,
    actingEmail: r.acting_email,
    createdAt: r.created_at,
    retiredAt: r.retired_at ?? null,
    retiredBy: r.retired_by ?? null,
  }
}

export async function constraintsFor(clientKey: string): Promise<StoreResult<Constraint[]>> {
  if (isDemoMode()) return { configured: true, ok: true, data: [] }
  const res = await rpc<any[]>('client_constraints_for', { p_client: clientKey })
  if (!res.configured || !res.ok) return res as StoreResult<Constraint[]>
  return { configured: true, ok: true, data: (Array.isArray(res.data) ? res.data : []).map(mapConstraint) }
}

export async function addConstraint(input: {
  clientKey: string
  lenderSlug: string
  lenderLabel: string | null
  type: ConstraintType
  reason: string
  actingEmail: string
}): Promise<StoreResult<string>> {
  if (isDemoMode()) return { configured: true, ok: false, error: 'Demo mode is read-only.' }
  return rpc<string>('client_constraint_add', {
    p_client: input.clientKey,
    p_lender: input.lenderSlug,
    p_label: input.lenderLabel,
    p_type: input.type,
    p_reason: input.reason,
    p_email: input.actingEmail,
  })
}

export async function retireConstraint(id: string, actingEmail: string): Promise<StoreResult<null>> {
  if (isDemoMode()) return { configured: true, ok: false, error: 'Demo mode is read-only.' }
  return rpc<null>('client_constraint_retire', { p_id: id, p_email: actingEmail })
}

export interface PinConfirmation {
  id: string
  clientKey: string
  quoteId: string
  lenderSlug: string | null
  requirement: string
  requirementText: string | null
  actingEmail: string
  createdAt: string
}

export async function pinConfirmationsFor(clientKey: string): Promise<StoreResult<PinConfirmation[]>> {
  if (isDemoMode()) return { configured: true, ok: true, data: [] }
  const res = await rpc<any[]>('pin_confirmations_for', { p_client: clientKey })
  if (!res.configured || !res.ok) return res as StoreResult<PinConfirmation[]>
  return {
    configured: true,
    ok: true,
    data: (Array.isArray(res.data) ? res.data : []).map(r => ({
      id: r.id,
      clientKey: r.client_key,
      quoteId: r.quote_id,
      lenderSlug: r.lender_slug ?? null,
      requirement: r.requirement,
      requirementText: r.requirement_text ?? null,
      actingEmail: r.acting_email,
      createdAt: r.created_at,
    })),
  }
}

export async function addPinConfirmation(input: {
  clientKey: string
  quoteId: string
  lenderSlug: string | null
  requirement: string
  requirementText: string | null
  actingEmail: string
}): Promise<StoreResult<string>> {
  if (isDemoMode()) return { configured: true, ok: false, error: 'Demo mode is read-only.' }
  return rpc<string>('pin_confirmation_add', {
    p_client: input.clientKey,
    p_quote: input.quoteId,
    p_lender: input.lenderSlug,
    p_requirement: input.requirement,
    p_requirement_text: input.requirementText,
    p_email: input.actingEmail,
  })
}
