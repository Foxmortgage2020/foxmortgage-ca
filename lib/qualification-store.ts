// FOXCA qualification-baseline store (B9). Server-only twin of
// lib/client-presentation-store.ts: talks to the foxmortgage-ca Supabase project
// through the narrow security-definer functions from migration 20260718200000.
// The anon key holds no direct table privileges (RLS on, grants revoked); the
// operator secret is the second factor at every admin write.
//
// DEMO POSTURE (decided, so a later reader does not "fix" it), identical to the
// presentation store:
//   - ADMIN writes (upsert / publish / delete) throw DemoWriteBlocked.
//   - The ADMIN list returns a demo fixture without a fetch, so a demo deal room
//     shows the baseline card with synthetic content and "zero real reads" holds.
//   - The CLIENT read (…_for_token) is NOT demo-guarded: it is keyed by a link
//     token hash the demo book has no token for, and the client page
//     short-circuits to the demo fixture before it runs (page.tsx). Guarding it
//     would make a real published page render empty for anyone in demo mode.
//
// Nothing here supplies a human's identity from a config value: created_by comes
// from the verified Clerk session at the route.

import { isDemoMode, blockInDemo } from '@/lib/demo'
import { foxcaOperatorSecret } from '@/lib/foxca-secret'
import type {
  QualificationBaseline,
  QualificationSources,
  QualificationBaselineRow,
} from '@/lib/qualification'
import { demoQualificationRows } from '@/lib/demo-fixtures'

export type { QualificationBaselineRow }

export type QualificationStoreResult<T> =
  | { configured: false }
  | { configured: true; ok: true; data: T }
  | { configured: true; ok: false; error: string }

function foxcaEnv(): { url: string; key: string } | null {
  const url = process.env.FOXCA_SUPABASE_URL
  const key = process.env.FOXCA_SUPABASE_KEY
  if (!url || !key) return null
  return { url: url.replace(/\/+$/, '').replace(/\/rest\/v1$/, ''), key }
}

export function qualificationStoreConfigured(): boolean {
  return foxcaEnv() !== null
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<QualificationStoreResult<T>> {
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
      // Function + status + duration only. Never args: they carry a token hash
      // and a client's income.
      console.error(`[qualification-store] ${fn} HTTP ${res.status} ms=${ms}`)
      const body = (await res.json().catch(() => null)) as { message?: string } | null
      return {
        configured: true,
        ok: false,
        error: body?.message ? String(body.message).slice(0, 200) : `Store query failed (HTTP ${res.status})`,
      }
    }
    const data = (await res.json().catch(() => null)) as T
    console.log(`[qualification-store] ${fn} ok ms=${ms}`)
    return { configured: true, ok: true, data }
  } catch {
    console.error(`[qualification-store] ${fn} unreachable ms=${Date.now() - started}`)
    return { configured: true, ok: false, error: 'Qualification store unreachable' }
  }
}

const mapRow = (r: any): QualificationBaselineRow => ({
  id: String(r.id),
  zohoDealId: String(r.zoho_deal_id),
  fileRef: r.file_ref ?? null,
  baseline: r.baseline as QualificationBaseline,
  sources: (r.sources ?? {}) as QualificationSources,
  baselineHash: String(r.baseline_hash),
  calcVersion: Number(r.calc_version),
  published: r.published === true,
  createdBy: String(r.created_by ?? ''),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at ?? r.created_at),
})

// ── Admin ─────────────────────────────────────────────────────────────────────

export async function upsertQualificationBaseline(input: {
  id: string | null
  zohoDealId: string
  fileRef: string | null
  baseline: QualificationBaseline
  sources: QualificationSources
  baselineHash: string
  calcVersion: number
  createdBy: string
}): Promise<QualificationStoreResult<string>> {
  if (isDemoMode()) blockInDemo('client-qualification.upsert')
  return rpc<string>('client_qualification_upsert', {
    p_id: input.id,
    p_zoho_deal_id: input.zohoDealId,
    p_file_ref: input.fileRef,
    p_baseline: input.baseline,
    p_sources: input.sources,
    p_baseline_hash: input.baselineHash,
    p_calc_version: input.calcVersion,
    p_created_by: input.createdBy,
    p_operator_secret: foxcaOperatorSecret(),
  })
}

export async function setQualificationPublished(id: string, published: boolean): Promise<QualificationStoreResult<string | null>> {
  if (isDemoMode()) blockInDemo('client-qualification.publish')
  return rpc<string | null>('client_qualification_set_published', {
    p_id: id,
    p_published: published,
    p_operator_secret: foxcaOperatorSecret(),
  })
}

export async function deleteQualificationBaseline(id: string): Promise<QualificationStoreResult<string | null>> {
  if (isDemoMode()) blockInDemo('client-qualification.delete')
  return rpc<string | null>('client_qualification_delete', { p_id: id, p_operator_secret: foxcaOperatorSecret() })
}

export async function qualificationForDeal(zohoDealId: string): Promise<QualificationStoreResult<QualificationBaselineRow[]>> {
  if (isDemoMode()) return { configured: true, ok: true, data: demoQualificationRows(zohoDealId) }
  const res = await rpc<any[]>('client_qualification_for_deal', {
    p_zoho_deal_id: zohoDealId,
    p_operator_secret: foxcaOperatorSecret(),
  })
  if (!res.configured || !res.ok) return res as QualificationStoreResult<QualificationBaselineRow[]>
  return { configured: true, ok: true, data: (res.data ?? []).map(mapRow) }
}

// ── Client read (token-hash keyed; NOT demo-guarded — see the header) ─────────

export async function publishedQualificationForToken(
  tokenHash: string,
): Promise<QualificationStoreResult<QualificationBaseline | null>> {
  const res = await rpc<any[]>('client_qualification_for_token', { p_token_hash: tokenHash })
  if (!res.configured || !res.ok) return res as QualificationStoreResult<QualificationBaseline | null>
  const row = Array.isArray(res.data) ? res.data[0] : null
  if (!row) return { configured: true, ok: true, data: null }
  return { configured: true, ok: true, data: row.baseline as QualificationBaseline }
}
