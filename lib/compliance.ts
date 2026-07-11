// FOXCA compliance store client (Session 6). Server-only: talks to the
// foxmortgage-ca Supabase project (skfeivzhqvrefnkqjwtj) with the same
// server-side key the form intake pipeline uses. The whole surface is the
// narrow security-definer functions from migration 20260710120000; the
// key holds no direct table privileges (verified live: a table select
// refuses with 42501). Admin gating happens in the API routes
// (compliance.manage); every mutation carries the acting user's email as
// p_actor so who-and-when lands on the row and in compliance_events.
//
// Records never delete. Credentials retire, complaints change status,
// policies version; compliance_events is the append-only trail.

// Demo mode (Session 9): every compliance READ returns a fictional/empty
// result before any FOXCA RPC (no real complaint, policy, or ack — which
// name real clients and staff — reaches a demo screen), and every WRITE
// rejects with DemoWriteBlocked before any RPC (the FSRA register is never
// mutated in a demo).
import { isDemoMode, DemoWriteBlocked } from '@/lib/demo'
import { demoResult, demoCredentials } from '@/lib/demo-fixtures'

// Empty read result used for the compliance registers in demo mode.
function demoEmpty<T>(): ComplianceResult<T[]> {
  return { configured: true, ok: true, data: [] }
}

export type ComplianceResult<T> =
  | { configured: false }
  | { configured: true; ok: true; data: T }
  | { configured: true; ok: false; error: string }

function foxcaEnv(): { url: string; key: string } | null {
  const url = process.env.FOXCA_SUPABASE_URL
  const key = process.env.FOXCA_SUPABASE_KEY
  if (!url || !key) return null
  return { url: url.replace(/\/+$/, '').replace(/\/rest\/v1$/, ''), key }
}

export function complianceConfigured(): boolean {
  return foxcaEnv() !== null
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<ComplianceResult<T>> {
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
      console.error(`[compliance] ${fn} HTTP ${res.status} ms=${ms}`)
      const body = (await res.json().catch(() => null)) as { message?: string } | null
      return {
        configured: true,
        ok: false,
        error: body?.message ? String(body.message).slice(0, 200) : `Store query failed (HTTP ${res.status})`,
      }
    }
    const data = (await res.json().catch(() => null)) as T
    console.log(`[compliance] ${fn} ok ms=${ms}`)
    return { configured: true, ok: true, data }
  } catch {
    console.error(`[compliance] ${fn} unreachable ms=${Date.now() - started}`)
    return { configured: true, ok: false, error: 'Compliance store unreachable' }
  }
}

// ─── Types (rows exactly as the functions return them) ──────────────────────

export interface ComplianceCredential {
  id: string
  name: string
  holder: string
  expires_on: string | null
  date_confirmed: boolean
  notes: string | null
  status: 'active' | 'retired'
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
  retired_at: string | null
  retired_by: string | null
}

export interface ComplianceComplaint {
  id: string
  received_on: string
  source: string
  summary: string
  status: 'open' | 'investigating' | 'resolved' | 'reported'
  resolution_notes: string | null
  reference: string | null
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
}

export interface CompliancePolicy {
  id: string
  title: string
  body_md: string
  version: number
  effective_on: string | null
  status: 'active' | 'retired'
  created_at: string
  created_by: string
  updated_at: string
  updated_by: string
}

export interface CompliancePolicyVersion {
  id: string
  policy_id: string
  version: number
  title: string
  body_md: string
  effective_on: string | null
  created_at: string
  created_by: string
}

export interface CompliancePolicyAck {
  id: string
  policy_id: string
  version: number
  acked_by: string
  acked_by_clerk_id: string | null
  acked_at: string
}

export interface ComplianceEvent {
  id: string
  record_type: 'credential' | 'complaint' | 'policy'
  record_id: string
  action: string
  detail: Record<string, unknown>
  actor: string
  created_at: string
}

// ─── Credentials ────────────────────────────────────────────────────────────

export function listCredentials(): Promise<ComplianceResult<ComplianceCredential[]>> {
  if (isDemoMode()) return Promise.resolve(demoResult(demoCredentials))
  return rpc('compliance_credentials_list', {})
}

export function saveCredential(input: {
  id: string | null
  name: string
  holder: string
  expiresOn: string | null
  dateConfirmed: boolean
  notes: string | null
  actor: string
}): Promise<ComplianceResult<string>> {
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('saveCredential'))
  return rpc('compliance_credential_save', {
    p_id: input.id,
    p_name: input.name,
    p_holder: input.holder,
    p_expires_on: input.expiresOn,
    p_date_confirmed: input.dateConfirmed,
    p_notes: input.notes,
    p_actor: input.actor,
  })
}

export function retireCredential(id: string, note: string | null, actor: string): Promise<ComplianceResult<boolean>> {
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('retireCredential'))
  return rpc('compliance_credential_retire', { p_id: id, p_note: note, p_actor: actor })
}

// ─── Complaints and incidents ───────────────────────────────────────────────

export function listComplaints(): Promise<ComplianceResult<ComplianceComplaint[]>> {
  if (isDemoMode()) return Promise.resolve(demoEmpty<ComplianceComplaint>())
  return rpc('compliance_complaints_list', {})
}

export function createComplaint(input: {
  receivedOn: string
  source: string
  summary: string
  reference: string | null
  actor: string
}): Promise<ComplianceResult<string>> {
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('createComplaint'))
  return rpc('compliance_complaint_create', {
    p_received_on: input.receivedOn,
    p_source: input.source,
    p_summary: input.summary,
    p_reference: input.reference,
    p_actor: input.actor,
  })
}

export function setComplaintStatus(
  id: string,
  status: string,
  note: string | null,
  actor: string,
): Promise<ComplianceResult<boolean>> {
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('setComplaintStatus'))
  return rpc('compliance_complaint_set_status', { p_id: id, p_status: status, p_note: note, p_actor: actor })
}

// ─── Policies and acknowledgments ───────────────────────────────────────────

export function listPolicies(): Promise<ComplianceResult<CompliancePolicy[]>> {
  if (isDemoMode()) return Promise.resolve(demoEmpty<CompliancePolicy>())
  return rpc('compliance_policies_list', {})
}

export function listPolicyVersions(policyId: string): Promise<ComplianceResult<CompliancePolicyVersion[]>> {
  if (isDemoMode()) return Promise.resolve(demoEmpty<CompliancePolicyVersion>())
  return rpc('compliance_policy_versions_list', { p_policy_id: policyId })
}

export function listPolicyAcks(): Promise<ComplianceResult<CompliancePolicyAck[]>> {
  if (isDemoMode()) return Promise.resolve(demoEmpty<CompliancePolicyAck>())
  return rpc('compliance_policy_acks_list', {})
}

export function createPolicy(input: {
  title: string
  bodyMd: string
  effectiveOn: string | null
  actor: string
}): Promise<ComplianceResult<string>> {
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('createPolicy'))
  return rpc('compliance_policy_create', {
    p_title: input.title,
    p_body_md: input.bodyMd,
    p_effective_on: input.effectiveOn,
    p_actor: input.actor,
  })
}

export function updatePolicy(input: {
  id: string
  title: string
  bodyMd: string
  effectiveOn: string | null
  status: 'active' | 'retired'
  actor: string
}): Promise<ComplianceResult<number>> {
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('updatePolicy'))
  return rpc('compliance_policy_update', {
    p_id: input.id,
    p_title: input.title,
    p_body_md: input.bodyMd,
    p_effective_on: input.effectiveOn,
    p_status: input.status,
    p_actor: input.actor,
  })
}

export function ackPolicy(
  policyId: string,
  version: number,
  actor: string,
  clerkId: string | null,
): Promise<ComplianceResult<boolean>> {
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('ackPolicy'))
  return rpc('compliance_policy_ack', {
    p_policy_id: policyId,
    p_version: version,
    p_actor: actor,
    p_clerk_id: clerkId,
  })
}

// ─── Events (per-record history) ────────────────────────────────────────────

export function listEvents(
  recordType: 'credential' | 'complaint' | 'policy',
  recordId: string,
): Promise<ComplianceResult<ComplianceEvent[]>> {
  if (isDemoMode()) return Promise.resolve(demoEmpty<ComplianceEvent>())
  return rpc('compliance_events_list', { p_record_type: recordType, p_record_id: recordId })
}
