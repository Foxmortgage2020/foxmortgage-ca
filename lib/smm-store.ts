// FOXCA Strategic Mortgage Monitoring store client. Server-only: talks to the
// foxmortgage-ca Supabase project through the narrow security-definer functions
// from migration 20260712120000; the key holds no direct table privileges (RLS
// on, grants revoked). Twin of lib/renewals-store.ts. Persist-first: raw rows
// are inserted before parsing; nothing deletes.

import { isDemoMode } from '@/lib/demo'

export type SmmStoreResult<T> =
  | { configured: false }
  | { configured: true; ok: true; data: T }
  | { configured: true; ok: false; error: string }

// Demo mode carries no monitored-client fixtures (unlike the workbench), and the
// export is real borrower PII, so every READ returns empty in demo — the board,
// the Home rail, and the backfill scan then show no real names, matching the
// demo contract (NO real borrower data on ANY page). Writes are refused at the
// route level; this is the read-side belt and suspenders.
function demoEmpty<T>(empty: T): SmmStoreResult<T> {
  return { configured: true, ok: true, data: empty }
}

// Writes are refused in demo at the store, not only at the routes.
function demoWriteRefused<T>(): SmmStoreResult<T> {
  return { configured: true, ok: false, error: 'Demo mode is read-only.' }
}

function foxcaEnv(): { url: string; key: string } | null {
  const url = process.env.FOXCA_SUPABASE_URL
  const key = process.env.FOXCA_SUPABASE_KEY
  if (!url || !key) return null
  return { url: url.replace(/\/+$/, '').replace(/\/rest\/v1$/, ''), key }
}

export function smmStoreConfigured(): boolean {
  return foxcaEnv() !== null
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<SmmStoreResult<T>> {
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
      // Never log row payloads (they carry client PII); function + status only.
      console.error(`[smm-store] ${fn} HTTP ${res.status} ms=${ms}`)
      const body = (await res.json().catch(() => null)) as { message?: string } | null
      return { configured: true, ok: false, error: body?.message ? String(body.message).slice(0, 160) : `Store query failed (HTTP ${res.status})` }
    }
    const data = (await res.json().catch(() => null)) as T
    console.log(`[smm-store] ${fn} ok ms=${ms}`)
    return { configured: true, ok: true, data }
  } catch {
    console.error(`[smm-store] ${fn} unreachable ms=${Date.now() - started}`)
    return { configured: true, ok: false, error: 'SMM store unreachable' }
  }
}

export interface SmmUpload {
  id: string
  filename: string | null
  uploadedBy: string
  uploadedAt: string
  rawRowCount: number
  parsedRowCount: number | null
  mortgageCount: number | null
  collapsedCount: number | null
  status: string
  notes: Record<string, unknown>
  superseded: boolean
}

function mapUpload(r: any): SmmUpload {
  return {
    id: r.id,
    filename: r.filename ?? null,
    uploadedBy: r.uploaded_by,
    uploadedAt: r.uploaded_at,
    rawRowCount: r.raw_row_count ?? 0,
    parsedRowCount: r.parsed_row_count ?? null,
    mortgageCount: r.mortgage_count ?? null,
    collapsedCount: r.collapsed_count ?? null,
    status: r.status,
    notes: r.notes ?? {},
    superseded: r.superseded === true,
  }
}

export async function createUpload(filename: string, uploadedBy: string): Promise<SmmStoreResult<string>> {
  if (isDemoMode()) return demoWriteRefused<string>()
  return rpc<string>('smm_upload_create', { p_filename: filename, p_uploaded_by: uploadedBy })
}

export async function insertRawRows(uploadId: string, rows: Record<string, string>[]): Promise<SmmStoreResult<number>> {
  return rpc<number>('smm_rows_insert', { p_upload_id: uploadId, p_rows: rows })
}

export async function finalizeUpload(
  uploadId: string,
  parsed: number,
  mortgages: number,
  collapsed: number,
  notes: Record<string, unknown>,
): Promise<SmmStoreResult<null>> {
  return rpc<null>('smm_upload_finalize', {
    p_upload_id: uploadId,
    p_parsed: parsed,
    p_mortgages: mortgages,
    p_collapsed: collapsed,
    p_notes: notes,
  })
}

export async function recentUploads(limit = 24): Promise<SmmStoreResult<SmmUpload[]>> {
  if (isDemoMode()) return demoEmpty<SmmUpload[]>([])
  const res = await rpc<any[]>('smm_uploads_recent', { p_limit: limit })
  if (!res.configured || !res.ok) return res as SmmStoreResult<SmmUpload[]>
  return { configured: true, ok: true, data: (Array.isArray(res.data) ? res.data : []).map(mapUpload) }
}

export async function rawRowsForUpload(uploadId: string): Promise<SmmStoreResult<Record<string, string>[]>> {
  if (isDemoMode()) return demoEmpty<Record<string, string>[]>([])
  const res = await rpc<any[]>('smm_rows_for_upload', { p_upload_id: uploadId })
  if (!res.configured || !res.ok) return res as SmmStoreResult<Record<string, string>[]>
  return { configured: true, ok: true, data: (Array.isArray(res.data) ? res.data : []).map(r => r.raw as Record<string, string>) }
}

export async function setOpportunityStatus(
  householdId: string,
  uploadId: string | null,
  status: string,
  actingEmail: string,
  note: string | null,
): Promise<SmmStoreResult<string>> {
  if (isDemoMode()) return demoWriteRefused<string>()
  return rpc<string>('smm_opportunity_status_set', {
    p_household: householdId,
    p_upload: uploadId,
    p_status: status,
    p_email: actingEmail,
    p_note: note,
  })
}

// ─── Backfill audit (migration 20260712140000) ─────────────────────────────
// Every confirmed Zoho write from the monitoring export is recorded: who,
// which record, exactly which fields, and the result. Fields are enumerated
// server-side, so what is stored here is the same enumerated payload that was
// written — never client-supplied field names.
export async function recordBackfillEvent(input: {
  householdId: string | null
  module: string
  recordId: string
  fields: Record<string, unknown>
  actingEmail: string
  result: string
}): Promise<SmmStoreResult<string>> {
  if (isDemoMode()) return demoWriteRefused<string>()
  return rpc<string>('smm_backfill_record', {
    p_household: input.householdId,
    p_module: input.module,
    p_record_id: input.recordId,
    p_fields: input.fields,
    p_email: input.actingEmail,
    p_result: input.result,
  })
}

// ─── Savings-analysis log (migration 20260713150000) ────────────────────────
// Append-only reproducibility record: every savings determination that reaches
// a deliverable surface lands here with its calc version, inputs hash, and the
// figures rendered. No update or delete path exists anywhere. Demo writes
// nothing (asserted in tests/savings-log.test.ts).
export async function recordSavingsAnalysis(
  entry: Record<string, unknown>,
  dedupe: boolean,
): Promise<SmmStoreResult<string | null>> {
  if (isDemoMode()) return demoWriteRefused<string | null>()
  return rpc<string | null>('savings_analysis_record', { p_entry: entry, p_dedupe: dedupe })
}

export async function recordSavingsAnalysisBatch(entries: Record<string, unknown>[]): Promise<SmmStoreResult<number>> {
  if (isDemoMode()) return demoWriteRefused<number>()
  if (entries.length === 0) return { configured: true, ok: true, data: 0 }
  return rpc<number>('savings_analysis_record_batch', { p_entries: entries })
}

export interface OpportunityStatusRow {
  householdId: string
  status: string
  actingEmail: string
  note: string | null
  createdAt: string
}

export async function latestOpportunityStatuses(): Promise<SmmStoreResult<OpportunityStatusRow[]>> {
  if (isDemoMode()) return demoEmpty<OpportunityStatusRow[]>([])
  const res = await rpc<any[]>('smm_opportunity_status_latest', {})
  if (!res.configured || !res.ok) return res as SmmStoreResult<OpportunityStatusRow[]>
  return {
    configured: true,
    ok: true,
    data: (Array.isArray(res.data) ? res.data : []).map(r => ({
      householdId: r.household_id,
      status: r.status,
      actingEmail: r.acting_email,
      note: r.note ?? null,
      createdAt: r.created_at,
    })),
  }
}
