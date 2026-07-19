// FOXCA saved-scenarios store client (Rates v3, Part 5). Server-only: talks
// to the foxmortgage-ca Supabase project through the narrow security-definer
// functions from migration 20260711000000; the key holds no direct table
// privileges (RLS on, table grants revoked). Twin of lib/notifications-store.ts.
// Per-user, keyed by the Clerk user id. Nothing hard-deletes: a scenario
// retires.

import { foxcaOperatorSecret } from '@/lib/foxca-secret'

export type SavedScenarioStoreResult<T> =
  | { configured: false }
  | { configured: true; ok: true; data: T }
  | { configured: true; ok: false; error: string }

function foxcaEnv(): { url: string; key: string } | null {
  const url = process.env.FOXCA_SUPABASE_URL
  const key = process.env.FOXCA_SUPABASE_KEY
  if (!url || !key) return null
  return { url: url.replace(/\/+$/, '').replace(/\/rest\/v1$/, ''), key }
}

export function savedScenariosStoreConfigured(): boolean {
  return foxcaEnv() !== null
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<SavedScenarioStoreResult<T>> {
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
      // Function name and status only; error bodies may quote inputs.
      console.error(`[saved-scenarios-store] ${fn} HTTP ${res.status} ms=${ms}`)
      const body = (await res.json().catch(() => null)) as { message?: string } | null
      return {
        configured: true,
        ok: false,
        error: body?.message
          ? String(body.message).slice(0, 200)
          : `Store query failed (HTTP ${res.status})`,
      }
    }
    const data = (await res.json().catch(() => null)) as T
    console.log(`[saved-scenarios-store] ${fn} ok ms=${ms}`)
    return { configured: true, ok: true, data }
  } catch {
    console.error(`[saved-scenarios-store] ${fn} unreachable ms=${Date.now() - started}`)
    return { configured: true, ok: false, error: 'Saved scenarios store unreachable' }
  }
}

export interface SavedScenarioRow {
  id: string
  name: string
  params: string
  fromFile: string | null
  createdAt: string
}

export async function createSavedScenario(
  clerkUserId: string,
  name: string,
  params: string,
  fromFile: string | null,
): Promise<SavedScenarioStoreResult<string>> {
  return rpc<string>('saved_scenario_create', {
    p_clerk_user_id: clerkUserId,
    p_name: name,
    p_params: params,
    p_from_file: fromFile,
    p_operator_secret: foxcaOperatorSecret(),
  })
}

export async function listSavedScenarios(
  clerkUserId: string,
): Promise<SavedScenarioStoreResult<SavedScenarioRow[]>> {
  const res = await rpc<any[]>('saved_scenarios_list_for_user', { p_clerk_user_id: clerkUserId })
  if (!res.configured || !res.ok) return res as SavedScenarioStoreResult<SavedScenarioRow[]>
  const rows = Array.isArray(res.data) ? res.data : []
  return {
    configured: true,
    ok: true,
    data: rows.map(r => ({
      id: r.id,
      name: r.name,
      params: r.params,
      fromFile: r.from_file ?? null,
      createdAt: r.created_at,
    })),
  }
}

export async function retireSavedScenario(
  id: string,
  clerkUserId: string,
): Promise<SavedScenarioStoreResult<boolean>> {
  return rpc<boolean>('saved_scenario_retire', { p_id: id, p_clerk_user_id: clerkUserId, p_operator_secret: foxcaOperatorSecret() })
}
