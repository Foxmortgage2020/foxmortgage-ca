// Gates API client — the ONLY module in this repo that talks to the
// fox-underwriting Gates API (docs/gates-api.md in that repo is the
// contract). Server-side only: called from this repo's route handlers,
// never from the browser. No other module may reference GATES_API_URL or
// mint gates-template tokens.
//
// Rules:
//   1. Every decision carries a person. Each call forwards a fresh Clerk
//      session token minted in the browser with the 'gates' JWT template
//      (60 second lifetime, minted per action in lib/gates-token.ts,
//      never cached). The mint must happen client-side: backend-minted
//      template tokens carry no azp claim and the Gates API refuses them
//      (verified live 2026-07-09).
//   2. Request bodies are enumerated actions plus one bounded note. There
//      is structurally no way to pass amounts or evidence through here.
//   3. Error mapping is part of the UX contract: 409 means already
//      decided, 403 permission, 404 not found or not yours, 422 carries
//      the server validation message, network failures are retryable.
//      Raw error bodies never reach the user.
//   4. Logs carry method, path (with record id), status, and duration.
//      Never tokens, never notes, never payloads.

export type GateErrorKind =
  | 'auth'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'validation'
  | 'unavailable'
  | 'network'

export type GateResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: GateErrorKind; message: string }

// HTTP status this repo's own API routes mirror back to the browser for
// each mapped kind, so the client component can branch on either.
export const STATUS_BY_KIND: Record<GateErrorKind, number> = {
  auth: 401,
  forbidden: 403,
  'not-found': 404,
  conflict: 409,
  validation: 422,
  unavailable: 503,
  network: 502,
}

// Pure response mapping (unit-tested in tests/gates.test.ts). Returns null
// for 2xx. The only server text ever surfaced is the 422 validation
// message; every other kind gets fixed plain-language copy.
export function mapGateResponse(
  status: number,
  body: unknown,
): { kind: GateErrorKind; message: string } | null {
  if (status >= 200 && status < 300) return null
  switch (status) {
    case 401:
      return { kind: 'auth', message: 'Your session was refused. Sign in again and retry.' }
    case 403:
      return { kind: 'forbidden', message: 'You do not have permission for this decision.' }
    case 404:
      return { kind: 'not-found', message: 'Not found or not yours.' }
    case 409:
      return { kind: 'conflict', message: 'Already decided.' }
    case 422: {
      const msg =
        body && typeof body === 'object' && typeof (body as any).error === 'string'
          ? (body as any).error
          : 'The decision did not pass validation.'
      return { kind: 'validation', message: msg }
    }
    case 503:
      return { kind: 'unavailable', message: 'The Gates API is not fully configured right now.' }
    default:
      return { kind: 'unavailable', message: `Unexpected response (HTTP ${status}).` }
  }
}

function gatesBase(): string | null {
  const raw = process.env.GATES_API_URL
  if (!raw) return null
  return raw.replace(/\/+$/, '')
}

export function gatesConfigured(): boolean {
  return gatesBase() !== null
}

async function gateCall<T>(
  path: string,
  body: Record<string, unknown>,
  token: string | null,
): Promise<GateResult<T>> {
  const base = gatesBase()
  if (!base) {
    return { ok: false, kind: 'unavailable', message: 'The Gates API is not connected (GATES_API_URL is not set).' }
  }
  if (!token) {
    return { ok: false, kind: 'auth', message: 'Your session did not produce a decision token. Sign in again and retry.' }
  }
  const started = Date.now()
  let res: Response
  try {
    res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
  } catch {
    console.error(`[gates] POST ${path} NETWORK ms=${Date.now() - started}`)
    return { ok: false, kind: 'network', message: 'Could not reach the Gates API. Check your connection and retry.' }
  }
  const ms = Date.now() - started
  console.log(`[gates] POST ${path} ${res.status} ms=${ms}`)
  let parsed: unknown = null
  try {
    parsed = await res.json()
  } catch {
    // Non-JSON body: mapping falls back to fixed copy.
  }
  const err = mapGateResponse(res.status, parsed)
  if (err) return { ok: false, ...err }
  return { ok: true, data: parsed as T }
}

// Note discipline: send the key only when there is content, trimmed and
// bounded, so the strict schema never sees an unexpected empty value.
function withNote(body: Record<string, unknown>, note?: string): Record<string, unknown> {
  const trimmed = note?.trim()
  if (trimmed) body.note = trimmed.slice(0, 2000)
  return body
}

// ─── The four decision calls (contract: docs/gates-api.md) ─────────────────

export type StatementAction = 'approve' | 'hold' | 'reject'
export const STATEMENT_ACTIONS: readonly StatementAction[] = ['approve', 'hold', 'reject']

export interface StatementDecisionResponse {
  documentId: string
  action: string
  reviewId?: string
  dealId?: string
  approved?: number
  held?: number
  rejected?: number
  heldReasons?: { fieldId: string; fieldName: string; reason: string }[]
  auditId?: string
  fileRef?: string
}

export function decideStatement(
  documentId: string,
  action: StatementAction,
  token: string | null,
  note?: string,
): Promise<GateResult<StatementDecisionResponse>> {
  return gateCall(`/api/gates/statements/${documentId}/decision`, withNote({ action }, note), token)
}

export type RateSheetAction = 'approve' | 'reject'
export const RATE_SHEET_ACTIONS: readonly RateSheetAction[] = ['approve', 'reject']

export interface RateSheetDecisionResponse {
  intelItemId: string
  action: string
  reviewId?: string
  lender?: string
  sheetDate?: string
  approved?: number
  held?: number
  rejected?: number
  superseded?: number
  heldReasons?: { quoteId: string; reason: string }[]
  auditId?: string
}

export function decideRateSheet(
  intelItemId: string,
  action: RateSheetAction,
  token: string | null,
  note?: string,
): Promise<GateResult<RateSheetDecisionResponse>> {
  return gateCall(`/api/gates/rate-sheets/${intelItemId}/decision`, withNote({ action }, note), token)
}

export type FlagDisposition = 'accepted' | 'corrected' | 'escalated'
export const FLAG_DISPOSITIONS: readonly FlagDisposition[] = ['accepted', 'corrected', 'escalated']

export interface FlagDispositionResponse {
  flagId: string
  kind?: string
  disposition: string
  resolvedAt?: string
  dealId?: string
  auditId?: string
}

export function disposeFlag(
  flagId: string,
  disposition: FlagDisposition,
  token: string | null,
  note?: string,
): Promise<GateResult<FlagDispositionResponse>> {
  return gateCall(`/api/gates/flags/${flagId}/disposition`, withNote({ disposition }, note), token)
}

export type ShadowDimension = 'checklist' | 'income' | 'ratios' | 'shortlist'
export const SHADOW_DIMENSIONS: readonly ShadowDimension[] = [
  'checklist',
  'income',
  'ratios',
  'shortlist',
]

export interface ShadowScoreResponse {
  dealId: string
  fileRef?: string
  dimension: string
  agreement: boolean
  rulingRef?: string | null
  auditId?: string
}

export function scoreShadow(
  dealId: string,
  dimension: ShadowDimension,
  agree: boolean,
  token: string | null,
  note?: string,
): Promise<GateResult<ShadowScoreResponse>> {
  return gateCall(`/api/gates/shadow/${dealId}/score`, withNote({ dimension, agree }, note), token)
}

export type ConditionAction = 'satisfied' | 'moot' | 'waived'
export const CONDITION_ACTIONS: readonly ConditionAction[] = ['satisfied', 'moot', 'waived']

// Waived and moot remove an obligation without evidence, so the contract
// requires a 5+ character note for both (moot records as status waived
// with the action preserved in the audit detail).
export const CONDITION_NOTE_REQUIRED: readonly ConditionAction[] = ['moot', 'waived']

export interface ConditionDecisionResponse {
  conditionId: string
  condNumber?: number | string | null
  action: string
  statusFrom?: string
  statusTo?: string
  dealId?: string
  fileRef?: string
  dealTerminal?: boolean
  auditId?: string
}

export function decideCondition(
  conditionId: string,
  action: ConditionAction,
  token: string | null,
  note?: string,
): Promise<GateResult<ConditionDecisionResponse>> {
  return gateCall(`/api/gates/conditions/${conditionId}/decision`, withNote({ action }, note), token)
}

// ─── Knowledge endpoints (read-only, behind knowledge.view) ─────────────────
// Same auth posture as the gates: a browser-minted token rides in. GET
// only; the knowledge base is git-versioned repo files served verbatim.

async function gateGet<T>(path: string, token: string | null): Promise<GateResult<T>> {
  const base = gatesBase()
  if (!base) {
    return { ok: false, kind: 'unavailable', message: 'The Gates API is not connected (GATES_API_URL is not set).' }
  }
  if (!token) {
    return { ok: false, kind: 'auth', message: 'Your session did not produce a token. Sign in again and retry.' }
  }
  const started = Date.now()
  let res: Response
  try {
    res = await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
  } catch {
    console.error(`[gates] GET ${path} NETWORK ms=${Date.now() - started}`)
    return { ok: false, kind: 'network', message: 'Could not reach the Gates API. Check your connection and retry.' }
  }
  console.log(`[gates] GET ${path} ${res.status} ms=${Date.now() - started}`)
  let parsed: unknown = null
  try {
    parsed = await res.json()
  } catch {
    // Non-JSON body: mapping falls back to fixed copy.
  }
  const err = mapGateResponse(res.status, parsed)
  if (err) return { ok: false, ...err }
  return { ok: true, data: parsed as T }
}

export interface KnowledgeLenderSummary {
  slug: string
  name: string
  as_of: string | null
  has_profile: boolean
  draft: boolean
}

export function getKnowledgeLenders(token: string | null): Promise<GateResult<{ lenders: KnowledgeLenderSummary[] }>> {
  return gateGet('/api/knowledge/lenders', token)
}

export interface KnowledgeLenderDetail {
  slug: string
  name: string
  as_of: string | null
  draft: boolean
  markdown: string
  profile: Record<string, unknown> | null
}

export function getKnowledgeLender(slug: string, token: string | null): Promise<GateResult<KnowledgeLenderDetail>> {
  return gateGet(`/api/knowledge/lenders/${encodeURIComponent(slug)}`, token)
}

export interface KnowledgeOffer {
  lender: string
  lender_name: string
  expiry: string
  days_left: number
  offer: {
    id?: string
    description?: string
    predicates?: unknown
    rates_or_amounts?: unknown
    expiry?: string
    provenance?: unknown
    eligibility?: unknown
    offer_rates?: unknown
  }
}

export function getKnowledgeOffers(token: string | null): Promise<GateResult<{ as_of: string; offers: KnowledgeOffer[] }>> {
  return gateGet('/api/knowledge/offers', token)
}

// The rates-reference layer (variable-rates session, 2026-07-10): prime
// with as-of and source, per-lender overrides, per-lender payment
// mechanism notes, quote-slug coverage. Zod-validated at serve time by
// the workbench; the portal computes effective rates against it at
// display time and labels every computed figure with the prime as-of.
// The shape is typed in lib/scenario.ts (RatesReference) so client
// components can share it without importing this server-only module.
export function getRatesReference(token: string | null): Promise<GateResult<Record<string, unknown>>> {
  return gateGet('/api/knowledge/rates-reference', token)
}

// ─── Health (Status page) ───────────────────────────────────────────────────

export interface GatesHealth {
  configured: boolean
  reachable: boolean
  ok: boolean
  authConfigured: boolean | null
  dbConfigured: boolean | null
  dbReachable: boolean | null
  // Count of lender knowledge files the deployed bundle can read. Zero
  // means the knowledge files failed to ride the deploy: amber the panel.
  knowledgeBundled: number | null
  commit: string | null
  env: string | null
  error: string | null
}

export async function getGatesHealth(): Promise<GatesHealth> {
  const base = gatesBase()
  const none: GatesHealth = {
    configured: false,
    reachable: false,
    ok: false,
    authConfigured: null,
    dbConfigured: null,
    dbReachable: null,
    knowledgeBundled: null,
    commit: null,
    env: null,
    error: null,
  }
  if (!base) return none
  const started = Date.now()
  try {
    const res = await fetch(`${base}/api/gates/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    })
    console.log(`[gates] GET /api/gates/health ${res.status} ms=${Date.now() - started}`)
    if (!res.ok) {
      return { ...none, configured: true, reachable: true, error: `HTTP ${res.status}` }
    }
    const d = (await res.json()) as any
    return {
      configured: true,
      reachable: true,
      ok: Boolean(d.ok),
      authConfigured: typeof d.auth_configured === 'boolean' ? d.auth_configured : null,
      dbConfigured: typeof d.db_configured === 'boolean' ? d.db_configured : null,
      dbReachable: typeof d.db_reachable === 'boolean' ? d.db_reachable : null,
      knowledgeBundled: typeof d.knowledge_bundled === 'number' ? d.knowledge_bundled : null,
      commit: typeof d.commit === 'string' ? d.commit : null,
      env: typeof d.env === 'string' ? d.env : null,
      error: null,
    }
  } catch {
    console.error(`[gates] GET /api/gates/health NETWORK ms=${Date.now() - started}`)
    return { ...none, configured: true, reachable: false, error: 'unreachable' }
  }
}
