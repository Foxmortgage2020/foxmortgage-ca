// FOXCA people + view-as store client (Session 8). Server-only: talks to
// the foxmortgage-ca Supabase project through the narrow security-definer
// functions from migration 20260710210000; the key holds no direct table
// privileges (RLS on, table grants revoked). Admin gating happens in the
// API routes (people.manage / portals.view-as); every mutation carries the
// acting user's email so who-and-when lands on the row.
//
// Nothing deletes: view-as sessions end, provisioning records append,
// offboarding checklists update in place with updated_by stamped.

export type PeopleStoreResult<T> =
  | { configured: false }
  | { configured: true; ok: true; data: T }
  | { configured: true; ok: false; error: string }

function foxcaEnv(): { url: string; key: string } | null {
  const url = process.env.FOXCA_SUPABASE_URL
  const key = process.env.FOXCA_SUPABASE_KEY
  if (!url || !key) return null
  return { url: url.replace(/\/+$/, '').replace(/\/rest\/v1$/, ''), key }
}

export function peopleStoreConfigured(): boolean {
  return foxcaEnv() !== null
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<PeopleStoreResult<T>> {
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
      console.error(`[people-store] ${fn} HTTP ${res.status} ms=${ms}`)
      const body = (await res.json().catch(() => null)) as { message?: string } | null
      return {
        configured: true,
        ok: false,
        error: body?.message ? String(body.message).slice(0, 200) : `Store query failed (HTTP ${res.status})`,
      }
    }
    const data = (await res.json().catch(() => null)) as T
    console.log(`[people-store] ${fn} ok ms=${ms}`)
    return { configured: true, ok: true, data }
  } catch {
    console.error(`[people-store] ${fn} unreachable ms=${Date.now() - started}`)
    return { configured: true, ok: false, error: 'People store unreachable' }
  }
}

// ─── Types (rows exactly as the functions return them) ──────────────────────

export interface ViewAsSession {
  id: string
  viewer_clerk_id: string
  viewer_email: string
  partner_zoho_id: string
  partner_name: string
  portal_role: string
  started_at: string
  ended_at: string | null
}

export interface ProvisioningRecord {
  id: string
  clerk_user_id: string
  email: string
  name: string
  person_type: 'staff' | 'partner' | 'agent'
  roles: string[]
  zoho_partner_id: string | null
  workbench_agent_id: string | null
  setup_remaining: { item: string; note: string }[] | null
  invite_sent: boolean
  provisioned_by: string
  created_at: string
}

export interface OffboardChecklistItem {
  key: string
  label: string
  detail: string
  done: boolean
}

export interface OffboardingRecord {
  id: string
  clerk_user_id: string
  email: string
  name: string
  roles: string[]
  checklist: OffboardChecklistItem[]
  offboarded_by: string
  created_at: string
  updated_at: string
  updated_by: string | null
}

// ─── View-as sessions ────────────────────────────────────────────────────────

export async function viewAsStart(input: {
  viewerClerkId: string
  viewerEmail: string
  partnerZohoId: string
  partnerName: string
  portalRole: string
}): Promise<PeopleStoreResult<string>> {
  return rpc<string>('view_as_start', {
    p_viewer_clerk_id: input.viewerClerkId,
    p_viewer_email: input.viewerEmail,
    p_partner_zoho_id: input.partnerZohoId,
    p_partner_name: input.partnerName,
    p_portal_role: input.portalRole,
  })
}

export async function viewAsEnd(id: string): Promise<PeopleStoreResult<boolean>> {
  return rpc<boolean>('view_as_end', { p_id: id })
}

export async function viewAsList(limit = 100): Promise<PeopleStoreResult<ViewAsSession[]>> {
  return rpc<ViewAsSession[]>('view_as_list', { p_limit: limit })
}

// ─── Provisioning records ────────────────────────────────────────────────────

export async function recordProvisioning(input: {
  actor: string
  clerkUserId: string
  email: string
  name: string
  personType: 'staff' | 'partner' | 'agent'
  roles: string[]
  zohoPartnerId?: string | null
  workbenchAgentId?: string | null
  setupRemaining?: { item: string; note: string }[] | null
  inviteSent: boolean
}): Promise<PeopleStoreResult<string>> {
  return rpc<string>('people_provision_record', {
    p_actor: input.actor,
    p_clerk_user_id: input.clerkUserId,
    p_email: input.email,
    p_name: input.name,
    p_person_type: input.personType,
    p_roles: input.roles,
    p_zoho_partner_id: input.zohoPartnerId ?? null,
    p_workbench_agent_id: input.workbenchAgentId ?? null,
    p_setup_remaining: input.setupRemaining ?? null,
    p_invite_sent: input.inviteSent,
  })
}

export async function listProvisioningRecords(): Promise<PeopleStoreResult<ProvisioningRecord[]>> {
  return rpc<ProvisioningRecord[]>('people_provision_list', {})
}

// ─── Offboarding records ─────────────────────────────────────────────────────

export async function recordOffboarding(input: {
  actor: string
  clerkUserId: string
  email: string
  name: string
  roles: string[]
  checklist: OffboardChecklistItem[]
}): Promise<PeopleStoreResult<string>> {
  return rpc<string>('people_offboard_record', {
    p_actor: input.actor,
    p_clerk_user_id: input.clerkUserId,
    p_email: input.email,
    p_name: input.name,
    p_roles: input.roles,
    p_checklist: input.checklist,
  })
}

export async function listOffboardingRecords(): Promise<PeopleStoreResult<OffboardingRecord[]>> {
  return rpc<OffboardingRecord[]>('people_offboard_list', {})
}

export async function getOffboardingRecord(
  id: string,
): Promise<PeopleStoreResult<OffboardingRecord | null>> {
  const res = await rpc<OffboardingRecord[]>('people_offboard_get', { p_id: id })
  if (!res.configured || !res.ok) return res as PeopleStoreResult<OffboardingRecord | null>
  return { configured: true, ok: true, data: res.data?.[0] ?? null }
}

export async function checkOffboardingItem(input: {
  id: string
  itemKey: string
  done: boolean
  actor: string
}): Promise<PeopleStoreResult<boolean>> {
  return rpc<boolean>('people_offboard_check', {
    p_id: input.id,
    p_item_key: input.itemKey,
    p_done: input.done,
    p_actor: input.actor,
  })
}
