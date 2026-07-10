// Health checks for /portal/admin/status. Read-only against every system.
// Each check returns an explicit configured/ok shape so the page can render
// honest "not configured" panels instead of fake green.

import {
  BOOKKEEPING_NIGHTLY_WORKFLOW_ID,
  KNOWN_N8N_WORKFLOWS,
} from '@/config/n8n-workflows'
import { listDryRunEntries, type DryRunEntry } from '@/lib/bookkeeping-dry-run-store'

// ─── n8n ────────────────────────────────────────────────────────────────────

function n8nEnv(): { base: string; key: string } | null {
  const url = process.env.N8N_API_URL
  const key = process.env.N8N_API_KEY
  if (!url || !key) return null
  return { base: url.replace(/\/$/, ''), key }
}

export function n8nConfigured(): boolean {
  return n8nEnv() !== null
}

export interface WorkflowStatusRow {
  id: string
  name: string
  area: string
  active: boolean | null
  lastExecStatus: string | null
  lastExecAt: string | null
  error: string | null
}

async function fetchWorkflowRow(
  base: string,
  key: string,
  id: string,
  label: string,
  area: string,
): Promise<WorkflowStatusRow> {
  const headers = { 'X-N8N-API-KEY': key }
  try {
    const [wfRes, exRes] = await Promise.all([
      fetch(`${base}/api/v1/workflows/${id}`, { headers, cache: 'no-store' }),
      fetch(`${base}/api/v1/executions?workflowId=${id}&limit=1`, {
        headers,
        cache: 'no-store',
      }),
    ])
    if (!wfRes.ok) {
      return {
        id,
        name: label,
        area,
        active: null,
        lastExecStatus: null,
        lastExecAt: null,
        error: `HTTP ${wfRes.status}`,
      }
    }
    const wf = await wfRes.json()
    let lastExecStatus: string | null = null
    let lastExecAt: string | null = null
    if (exRes.ok) {
      const ex = await exRes.json()
      const e0 = (ex?.data ?? [])[0]
      if (e0) {
        lastExecStatus = e0.status ?? null
        lastExecAt = e0.startedAt ?? null
      }
    }
    return {
      id,
      name: wf.name ?? label,
      area,
      active: Boolean(wf.active),
      lastExecStatus,
      lastExecAt,
      error: null,
    }
  } catch {
    return {
      id,
      name: label,
      area,
      active: null,
      lastExecStatus: null,
      lastExecAt: null,
      error: 'unreachable',
    }
  }
}

export type N8nStatus =
  | { configured: false }
  | { configured: true; rows: WorkflowStatusRow[] }

export async function getN8nStatus(): Promise<N8nStatus> {
  const env = n8nEnv()
  if (!env) return { configured: false }
  const rows = await Promise.all(
    KNOWN_N8N_WORKFLOWS.map(w => fetchWorkflowRow(env.base, env.key, w.id, w.label, w.area)),
  )
  return { configured: true, rows }
}

// ─── Bookkeeping pipeline ───────────────────────────────────────────────────

export interface BookkeepingStatus {
  // Live WRITE_TO_QBO read from the nightly workflow's config node when the
  // n8n API is configured; null when it is not reachable.
  writeToQbo: boolean | null
  realmId: string | null
  workflowActive: boolean | null
  lastExecStatus: string | null
  lastExecAt: string | null
  n8nConfigured: boolean
  error: string | null
  // In-memory dry-run log (resets on deploy or idle instance recycle).
  dryRunEntries: DryRunEntry[]
}

export async function getBookkeepingStatus(): Promise<BookkeepingStatus> {
  const dryRunEntries = listDryRunEntries(5)
  const env = n8nEnv()
  if (!env) {
    return {
      writeToQbo: null,
      realmId: null,
      workflowActive: null,
      lastExecStatus: null,
      lastExecAt: null,
      n8nConfigured: false,
      error: null,
      dryRunEntries,
    }
  }
  try {
    const headers = { 'X-N8N-API-KEY': env.key }
    const [wfRes, exRes] = await Promise.all([
      fetch(`${env.base}/api/v1/workflows/${BOOKKEEPING_NIGHTLY_WORKFLOW_ID}`, {
        headers,
        cache: 'no-store',
      }),
      fetch(
        `${env.base}/api/v1/executions?workflowId=${BOOKKEEPING_NIGHTLY_WORKFLOW_ID}&limit=1`,
        { headers, cache: 'no-store' },
      ),
    ])
    if (!wfRes.ok) {
      return {
        writeToQbo: null,
        realmId: null,
        workflowActive: null,
        lastExecStatus: null,
        lastExecAt: null,
        n8nConfigured: true,
        error: `n8n workflow read failed (HTTP ${wfRes.status})`,
        dryRunEntries,
      }
    }
    const wf = await wfRes.json()
    // The Workflow Config node is a Set node; support both parameter shapes
    // (assignments for current n8n, values.string for legacy exports).
    let writeToQbo: boolean | null = null
    let realmId: string | null = null
    const cfgNode = (wf.nodes ?? []).find((n: any) => /workflow config/i.test(n.name ?? ''))
    if (cfgNode) {
      const assigns: any[] =
        cfgNode.parameters?.assignments?.assignments ??
        cfgNode.parameters?.values?.string ??
        []
      for (const a of assigns) {
        if (a.name === 'WRITE_TO_QBO') writeToQbo = String(a.value) === 'true'
        if (a.name === 'QBO_REALM_ID') realmId = String(a.value)
      }
    }
    let lastExecStatus: string | null = null
    let lastExecAt: string | null = null
    if (exRes.ok) {
      const ex = await exRes.json()
      const e0 = (ex?.data ?? [])[0]
      if (e0) {
        lastExecStatus = e0.status ?? null
        lastExecAt = e0.startedAt ?? null
      }
    }
    return {
      writeToQbo,
      realmId,
      workflowActive: Boolean(wf.active),
      lastExecStatus,
      lastExecAt,
      n8nConfigured: true,
      error: null,
      dryRunEntries,
    }
  } catch {
    return {
      writeToQbo: null,
      realmId: null,
      workflowActive: null,
      lastExecStatus: null,
      lastExecAt: null,
      n8nConfigured: true,
      error: 'n8n unreachable',
      dryRunEntries,
    }
  }
}

// ─── Form intake capture (foxmortgage-ca Supabase project) ──────────────────
// Counts come through the STABLE security-definer function
// form_submission_stats() (migration 20260709230000): the app's anon key is
// deliberately insert-only on form_submissions, so a table SELECT would
// silently return nothing. Counts and a timestamp only, never row content.

export interface FormIntakeStatus {
  configured: boolean
  reachable: boolean
  total7d: number | null
  // Unacknowledged zoho_failed rows: this is what drives the light. A
  // fresh failure always ambers; an acknowledged one stops nagging.
  zohoFailed: number | null
  zohoFailedTotal: number | null
  latestAt: string | null
  error: string | null
}

export interface FormIntakeFailureRow {
  id: string
  createdAt: string
  source: string
  errorDetail: string | null
}

function foxcaEnv(): { base: string; key: string } | null {
  const url = process.env.FOXCA_SUPABASE_URL
  const key = process.env.FOXCA_SUPABASE_KEY
  if (!url || !key) return null
  return { base: url.replace(/\/+$/, ''), key }
}

export async function getFormIntakeStatus(): Promise<FormIntakeStatus> {
  const env = foxcaEnv()
  const none: FormIntakeStatus = {
    configured: false,
    reachable: false,
    total7d: null,
    zohoFailed: null,
    zohoFailedTotal: null,
    latestAt: null,
    error: null,
  }
  if (!env) return none
  try {
    const res = await fetch(`${env.base}/rest/v1/rpc/form_submission_stats`, {
      headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) {
      return { ...none, configured: true, reachable: true, error: `stats query failed (HTTP ${res.status})` }
    }
    const rows = (await res.json()) as any[]
    const r = Array.isArray(rows) ? rows[0] : null
    const num = (v: unknown) => (v === undefined || v === null ? null : Number(v))
    return {
      configured: true,
      reachable: true,
      total7d: num(r?.total_7d),
      zohoFailed: num(r?.zoho_failed),
      zohoFailedTotal: num(r?.zoho_failed_total),
      latestAt: r?.latest_at ?? null,
      error: null,
    }
  } catch {
    return { ...none, configured: true, reachable: false, error: 'unreachable' }
  }
}

// Unacknowledged failures for the panel's triage list (counts, timestamps,
// source, and the Zoho error only; never submitter content).
export async function getFormIntakeFailures(): Promise<FormIntakeFailureRow[]> {
  const env = foxcaEnv()
  if (!env) return []
  try {
    const res = await fetch(`${env.base}/rest/v1/rpc/form_submission_failures`, {
      headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return []
    const rows = (await res.json()) as any[]
    return rows.map(r => ({
      id: r.id,
      createdAt: r.created_at,
      source: r.source,
      errorDetail: r.error_detail ?? null,
    }))
  } catch {
    return []
  }
}

export async function acknowledgeFormSubmission(id: string, by: string): Promise<boolean> {
  const env = foxcaEnv()
  if (!env) return false
  try {
    const res = await fetch(`${env.base}/rest/v1/rpc/acknowledge_form_submission`, {
      method: 'POST',
      headers: {
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_id: id, p_by: by }),
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) {
      console.error(`[form-intake] acknowledge HTTP ${res.status}`)
      return false
    }
    const out = await res.json().catch(() => null)
    return out === true
  } catch {
    console.error('[form-intake] acknowledge unreachable')
    return false
  }
}

// Pure light derivation (unit-tested): unacknowledged failures amber the
// panel; acknowledged-only history stays green.
export type FormIntakeLight = 'ok' | 'warn' | 'fail' | 'off'

export function formIntakeLight(s: {
  configured: boolean
  reachable: boolean
  error: string | null
  zohoFailed: number | null
}): FormIntakeLight {
  if (!s.configured) return 'off'
  if (!s.reachable) return 'fail'
  if (s.error) return 'warn'
  if (s.zohoFailed === null) return 'warn'
  return s.zohoFailed > 0 ? 'warn' : 'ok'
}

// ─── Deploy info ────────────────────────────────────────────────────────────

export interface DeployInfo {
  sha: string | null
  ref: string | null
  message: string | null
  env: string | null
  buildTime: string | null
  region: string | null
}

export function getDeployInfo(): DeployInfo {
  return {
    sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    ref: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    message: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
    env: process.env.VERCEL_ENV ?? (process.env.NODE_ENV === 'production' ? 'production' : 'development'),
    buildTime: process.env.BUILD_TIME ?? null,
    region: process.env.VERCEL_REGION ?? null,
  }
}
