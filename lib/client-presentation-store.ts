// FOXCA client-presentation store (B8b). Server-only twin of
// lib/client-links-store.ts: talks to the foxmortgage-ca Supabase project
// through the narrow security-definer functions from migration 20260718180000.
// The anon key holds no direct table privileges (RLS on, grants revoked).
//
// DEMO POSTURE (decided, so a later reader does not "fix" it):
//   - ADMIN writes (upsert / create / mint / publish / delete) throw
//     DemoWriteBlocked. ADMIN lists return demo fixtures without a fetch, so a
//     demo deal room shows the authoring cards with synthetic content and the
//     "zero real reads" test holds.
//   - CLIENT reads (…_for_token) are NOT demo-guarded: they are keyed by a
//     link token hash the demo book has no token for, and the client page
//     short-circuits to the demo fixture before any of them run (page.tsx),
//     exactly as with resolveClientLink. Guarding them would make a real
//     published page render empty for anyone in demo mode.
//
// Nothing here supplies a human's identity from a config value: created_by /
// minted_by come from the verified Clerk session at the route.

import { isDemoMode, blockInDemo } from '@/lib/demo'
import type {
  OfferSnapshot,
  LetterSnapshot,
  ScenarioInputs,
  ScenarioFigures,
  ScenarioRow,
  OfferRow,
  LetterRow,
  PublishedScenario,
} from '@/lib/client-presentation'
import {
  demoClientScenarioRows,
  demoClientOfferRows,
  demoClientLetterRows,
} from '@/lib/demo-fixtures'

export type { ScenarioRow, OfferRow, LetterRow, PublishedScenario }

export type PresentationStoreResult<T> =
  | { configured: false }
  | { configured: true; ok: true; data: T }
  | { configured: true; ok: false; error: string }

function foxcaEnv(): { url: string; key: string } | null {
  const url = process.env.FOXCA_SUPABASE_URL
  const key = process.env.FOXCA_SUPABASE_KEY
  if (!url || !key) return null
  return { url: url.replace(/\/+$/, '').replace(/\/rest\/v1$/, ''), key }
}

// The same operator secret client-links uses (B7-P Task 0). Throw-if-unset, so
// a misconfigured deploy fails loud rather than sending an empty secret.
function foxcaOperatorSecret(): string {
  const s = process.env.FOXCA_OPERATOR_SECRET
  if (!s) {
    throw new Error('FOXCA_OPERATOR_SECRET is not set. Add it to .env.local and Vercel (all targets).')
  }
  return s
}

export function presentationStoreConfigured(): boolean {
  return foxcaEnv() !== null
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<PresentationStoreResult<T>> {
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
      // Function + status + duration. Never args: they carry a token hash and a
      // client's figures.
      console.error(`[client-presentation-store] ${fn} HTTP ${res.status} ms=${ms}`)
      const body = (await res.json().catch(() => null)) as { message?: string } | null
      return {
        configured: true,
        ok: false,
        error: body?.message ? String(body.message).slice(0, 200) : `Store query failed (HTTP ${res.status})`,
      }
    }
    const data = (await res.json().catch(() => null)) as T
    console.log(`[client-presentation-store] ${fn} ok ms=${ms}`)
    return { configured: true, ok: true, data }
  } catch {
    console.error(`[client-presentation-store] ${fn} unreachable ms=${Date.now() - started}`)
    return { configured: true, ok: false, error: 'Client presentation store unreachable' }
  }
}

// Row types (ScenarioRow / OfferRow / LetterRow) live in lib/client-presentation.ts
// (upstream of both this store and the demo fixtures) and are re-exported above.

const mapScenario = (r: any): ScenarioRow => ({
  id: String(r.id),
  zohoDealId: String(r.zoho_deal_id),
  fileRef: r.file_ref ?? null,
  label: String(r.label),
  inputs: r.inputs as ScenarioInputs,
  figures: r.figures as ScenarioFigures,
  inputsHash: String(r.inputs_hash),
  calcVersion: Number(r.calc_version),
  published: r.published === true,
  createdBy: String(r.created_by ?? ''),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at ?? r.created_at),
})
const mapOffer = (r: any): OfferRow => ({
  id: String(r.id),
  zohoDealId: String(r.zoho_deal_id),
  fileRef: r.file_ref ?? null,
  quoteId: String(r.quote_id),
  snapshot: r.snapshot as OfferSnapshot,
  published: r.published === true,
  createdBy: String(r.created_by ?? ''),
  createdAt: String(r.created_at),
})
const mapLetter = (r: any): LetterRow => ({
  id: String(r.id),
  zohoDealId: String(r.zoho_deal_id),
  fileRef: r.file_ref ?? null,
  snapshot: r.snapshot as LetterSnapshot,
  rateHoldExpiry: String(r.rate_hold_expiry),
  supersededAt: r.superseded_at ?? null,
  createdBy: String(r.created_by ?? ''),
  createdAt: String(r.created_at),
})

// ── Admin: scenarios ─────────────────────────────────────────────────────────

export async function upsertScenario(input: {
  id: string | null
  zohoDealId: string
  fileRef: string | null
  label: string
  inputs: ScenarioInputs
  figures: ScenarioFigures
  inputsHash: string
  calcVersion: number
  createdBy: string
}): Promise<PresentationStoreResult<string>> {
  if (isDemoMode()) blockInDemo('client-scenario.upsert')
  return rpc<string>('client_scenario_upsert', {
    p_id: input.id,
    p_zoho_deal_id: input.zohoDealId,
    p_file_ref: input.fileRef,
    p_label: input.label,
    p_inputs: input.inputs,
    p_figures: input.figures,
    p_inputs_hash: input.inputsHash,
    p_calc_version: input.calcVersion,
    p_created_by: input.createdBy,
    p_operator_secret: foxcaOperatorSecret(),
  })
}

export async function setScenarioPublished(id: string, published: boolean): Promise<PresentationStoreResult<string | null>> {
  if (isDemoMode()) blockInDemo('client-scenario.publish')
  return rpc<string | null>('client_scenario_set_published', {
    p_id: id,
    p_published: published,
    p_operator_secret: foxcaOperatorSecret(),
  })
}

export async function deleteScenario(id: string): Promise<PresentationStoreResult<string | null>> {
  if (isDemoMode()) blockInDemo('client-scenario.delete')
  return rpc<string | null>('client_scenario_delete', { p_id: id, p_operator_secret: foxcaOperatorSecret() })
}

export async function scenariosForDeal(zohoDealId: string): Promise<PresentationStoreResult<ScenarioRow[]>> {
  if (isDemoMode()) return { configured: true, ok: true, data: demoClientScenarioRows(zohoDealId) }
  const res = await rpc<any[]>('client_scenarios_for_deal', {
    p_zoho_deal_id: zohoDealId,
    p_operator_secret: foxcaOperatorSecret(),
  })
  if (!res.configured || !res.ok) return res as PresentationStoreResult<ScenarioRow[]>
  return { configured: true, ok: true, data: (res.data ?? []).map(mapScenario) }
}

// ── Admin: offers ────────────────────────────────────────────────────────────

export async function createOffer(input: {
  zohoDealId: string
  fileRef: string | null
  quoteId: string
  snapshot: OfferSnapshot
  createdBy: string
}): Promise<PresentationStoreResult<string>> {
  if (isDemoMode()) blockInDemo('client-offer.create')
  return rpc<string>('client_offer_create', {
    p_zoho_deal_id: input.zohoDealId,
    p_file_ref: input.fileRef,
    p_quote_id: input.quoteId,
    p_snapshot: input.snapshot,
    p_created_by: input.createdBy,
    p_operator_secret: foxcaOperatorSecret(),
  })
}

export async function setOfferPublished(id: string, published: boolean): Promise<PresentationStoreResult<string | null>> {
  if (isDemoMode()) blockInDemo('client-offer.publish')
  return rpc<string | null>('client_offer_set_published', {
    p_id: id,
    p_published: published,
    p_operator_secret: foxcaOperatorSecret(),
  })
}

export async function deleteOffer(id: string): Promise<PresentationStoreResult<string | null>> {
  if (isDemoMode()) blockInDemo('client-offer.delete')
  return rpc<string | null>('client_offer_delete', { p_id: id, p_operator_secret: foxcaOperatorSecret() })
}

export async function offersForDeal(zohoDealId: string): Promise<PresentationStoreResult<OfferRow[]>> {
  if (isDemoMode()) return { configured: true, ok: true, data: demoClientOfferRows(zohoDealId) }
  const res = await rpc<any[]>('client_offers_for_deal', {
    p_zoho_deal_id: zohoDealId,
    p_operator_secret: foxcaOperatorSecret(),
  })
  if (!res.configured || !res.ok) return res as PresentationStoreResult<OfferRow[]>
  return { configured: true, ok: true, data: (res.data ?? []).map(mapOffer) }
}

// ── Admin: letters ───────────────────────────────────────────────────────────

export async function mintLetter(input: {
  zohoDealId: string
  fileRef: string | null
  snapshot: LetterSnapshot
  rateHoldExpiry: string
  createdBy: string
}): Promise<PresentationStoreResult<string>> {
  if (isDemoMode()) blockInDemo('client-letter.mint')
  return rpc<string>('client_letter_mint', {
    p_zoho_deal_id: input.zohoDealId,
    p_file_ref: input.fileRef,
    p_snapshot: input.snapshot,
    p_rate_hold_expiry: input.rateHoldExpiry,
    p_created_by: input.createdBy,
    p_operator_secret: foxcaOperatorSecret(),
  })
}

export async function supersedeLetter(id: string): Promise<PresentationStoreResult<string | null>> {
  if (isDemoMode()) blockInDemo('client-letter.supersede')
  return rpc<string | null>('client_letter_supersede', { p_id: id, p_operator_secret: foxcaOperatorSecret() })
}

export async function lettersForDeal(zohoDealId: string): Promise<PresentationStoreResult<LetterRow[]>> {
  if (isDemoMode()) return { configured: true, ok: true, data: demoClientLetterRows(zohoDealId) }
  const res = await rpc<any[]>('client_letters_for_deal', {
    p_zoho_deal_id: zohoDealId,
    p_operator_secret: foxcaOperatorSecret(),
  })
  if (!res.configured || !res.ok) return res as PresentationStoreResult<LetterRow[]>
  return { configured: true, ok: true, data: (res.data ?? []).map(mapLetter) }
}

// ── Client reads (token-hash keyed; NOT demo-guarded — see the header) ────────

export async function publishedScenariosForToken(
  tokenHash: string,
): Promise<PresentationStoreResult<PublishedScenario[]>> {
  const res = await rpc<any[]>('client_scenarios_for_token', { p_token_hash: tokenHash })
  if (!res.configured || !res.ok) return res as PresentationStoreResult<PublishedScenario[]>
  return {
    configured: true,
    ok: true,
    data: (res.data ?? []).map(r => ({
      label: String(r.label),
      inputs: r.inputs as ScenarioInputs,
      figures: r.figures as ScenarioFigures,
    })),
  }
}

export async function publishedOffersForToken(
  tokenHash: string,
): Promise<PresentationStoreResult<OfferSnapshot[]>> {
  const res = await rpc<any[]>('client_offers_for_token', { p_token_hash: tokenHash })
  if (!res.configured || !res.ok) return res as PresentationStoreResult<OfferSnapshot[]>
  return { configured: true, ok: true, data: (res.data ?? []).map(r => r.snapshot as OfferSnapshot) }
}

export interface CurrentLetter {
  snapshot: LetterSnapshot
  rateHoldExpiry: string
}
export async function currentLetterForToken(
  tokenHash: string,
): Promise<PresentationStoreResult<CurrentLetter | null>> {
  const res = await rpc<any[]>('client_letter_for_token', { p_token_hash: tokenHash })
  if (!res.configured || !res.ok) return res as PresentationStoreResult<CurrentLetter | null>
  const row = Array.isArray(res.data) ? res.data[0] : null
  if (!row) return { configured: true, ok: true, data: null }
  return {
    configured: true,
    ok: true,
    data: { snapshot: row.snapshot as LetterSnapshot, rateHoldExpiry: String(row.rate_hold_expiry) },
  }
}
