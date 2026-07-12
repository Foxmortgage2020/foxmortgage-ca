// FOXCA renewal-events store client. Server-only: talks to the foxmortgage-ca
// Supabase project through the narrow security-definer functions from
// migration 20260712000000; the key holds no direct table privileges (RLS on,
// grants revoked). Twin of lib/notifications-store.ts. Records who/when for
// every renewal status action; nothing deletes.

export type RenewalStoreResult<T> =
  | { configured: false }
  | { configured: true; ok: true; data: T }
  | { configured: true; ok: false; error: string }

function foxcaEnv(): { url: string; key: string } | null {
  const url = process.env.FOXCA_SUPABASE_URL
  const key = process.env.FOXCA_SUPABASE_KEY
  if (!url || !key) return null
  return { url: url.replace(/\/+$/, '').replace(/\/rest\/v1$/, ''), key }
}

export function renewalsStoreConfigured(): boolean {
  return foxcaEnv() !== null
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<RenewalStoreResult<T>> {
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
      console.error(`[renewals-store] ${fn} HTTP ${res.status} ms=${ms}`)
      const body = (await res.json().catch(() => null)) as { message?: string } | null
      return {
        configured: true,
        ok: false,
        error: body?.message ? String(body.message).slice(0, 200) : `Store query failed (HTTP ${res.status})`,
      }
    }
    const data = (await res.json().catch(() => null)) as T
    console.log(`[renewals-store] ${fn} ok ms=${ms}`)
    return { configured: true, ok: true, data }
  } catch {
    console.error(`[renewals-store] ${fn} unreachable ms=${Date.now() - started}`)
    return { configured: true, ok: false, error: 'Renewals store unreachable' }
  }
}

export interface RenewalEvent {
  id: string
  dealId: string
  dealName: string | null
  action: string
  actingEmail: string
  fields: Record<string, unknown>
  prevStatus: string | null
  result: string
  createdAt: string
}

export async function recordRenewalEvent(input: {
  dealId: string
  dealName: string | null
  action: string
  actingEmail: string
  fields: Record<string, unknown>
  prevStatus: string | null
  result: string
}): Promise<RenewalStoreResult<string>> {
  return rpc<string>('renewal_event_record', {
    p_deal_id: input.dealId,
    p_deal_name: input.dealName,
    p_action: input.action,
    p_acting_email: input.actingEmail,
    p_fields: input.fields,
    p_prev_status: input.prevStatus,
    p_result: input.result,
  })
}

function mapRow(r: any): RenewalEvent {
  return {
    id: r.id,
    dealId: r.deal_id,
    dealName: r.deal_name ?? null,
    action: r.action,
    actingEmail: r.acting_email,
    fields: r.fields ?? {},
    prevStatus: r.prev_status ?? null,
    result: r.result,
    createdAt: r.created_at,
  }
}

export async function renewalEventsForDeal(dealId: string): Promise<RenewalStoreResult<RenewalEvent[]>> {
  const res = await rpc<any[]>('renewal_events_for_deal', { p_deal_id: dealId })
  if (!res.configured || !res.ok) return res as RenewalStoreResult<RenewalEvent[]>
  return { configured: true, ok: true, data: (Array.isArray(res.data) ? res.data : []).map(mapRow) }
}

export async function recentRenewalEvents(limit = 50): Promise<RenewalStoreResult<RenewalEvent[]>> {
  const res = await rpc<any[]>('renewal_events_recent', { p_limit: limit })
  if (!res.configured || !res.ok) return res as RenewalStoreResult<RenewalEvent[]>
  return { configured: true, ok: true, data: (Array.isArray(res.data) ? res.data : []).map(mapRow) }
}
