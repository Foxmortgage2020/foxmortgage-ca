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

// Demo mode (Session 9): every decision/provision write below returns a
// rejected DemoWriteBlocked before any Gates API call. The knowledge and
// rates-reference GETs stay real — they are reference material, not
// borrower data — so a demo walkthrough still shows live lender knowledge.
import { isDemoMode, DemoWriteBlocked } from '@/lib/demo'
import { KNOWLEDGE_UPLOAD_KINDS, type KnowledgeUploadKind } from '@/lib/knowledge-claims'

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
  opts?: { surfaceError?: boolean },
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
  if (err) {
    // surfaceError: some endpoints carry an operator-facing message on the
    // generation-diagnostic statuses (lender-notes: 503 "ANTHROPIC_API_KEY is
    // not configured", 502 "the note failed validation: contains an em dash").
    // Pass THOSE through verbatim (no borrower data). Restricted to 502/503 so a
    // raw 500/internal message never reaches the browser; mapGateResponse
    // already surfaces the 422 body.
    if (opts?.surfaceError && (res.status === 502 || res.status === 503) && parsed && typeof (parsed as { error?: unknown }).error === 'string') {
      return { ok: false, kind: err.kind, message: (parsed as { error: string }).error }
    }
    return { ok: false, ...err }
  }
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
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('decideStatement'))
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
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('decideRateSheet'))
  return gateCall(`/api/gates/rate-sheets/${intelItemId}/decision`, withNote({ action }, note), token)
}

// Offer decisions (the offers desk session). POST /api/gates/offers/[offerId]/
// decision, approve | reject, optional note. The workbench owns the offer
// lifecycle; the portal only decides through this path (never writes the
// table). offerId is the lender_offers row uuid.
export type OfferAction = 'approve' | 'reject'
export const OFFER_ACTIONS: readonly OfferAction[] = ['approve', 'reject']

export interface OfferDecisionResponse {
  offerId: string
  action: string
  status?: string
  auditId?: string
}

export function decideOffer(
  offerId: string,
  action: OfferAction,
  token: string | null,
  note?: string,
): Promise<GateResult<OfferDecisionResponse>> {
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('decideOffer'))
  return gateCall(`/api/gates/offers/${offerId}/decision`, withNote({ action }, note), token)
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
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('disposeFlag'))
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
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('scoreShadow'))
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
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('decideCondition'))
  return gateCall(`/api/gates/conditions/${conditionId}/decision`, withNote({ action }, note), token)
}

// ─── Phase B2: commitment conditions become the room's gated checklist ──────
// A commitment upload mints PENDING conditions on the workbench; the LIST gate
// makes them the checklist. Uploading and every decision below carry a person
// (browser-minted token), exactly like the other gates. Nothing here computes
// anything or bypasses the pending stage.

export type CommitmentKind = 'commitment' | 'amendment'
export const COMMITMENT_KINDS: readonly CommitmentKind[] = ['commitment', 'amendment']

export interface CommitmentUploadBody {
  file_name: string
  kind: CommitmentKind
  content_base64: string
}

export interface CommitmentUploadResponse {
  documentId: string
  pages: number
  dupOf: string | null
  extraction: {
    parseable: boolean
    drafted: number
    reason: string | null
    fallback: string | null
  } | null
}

export function uploadCommitment(
  dealId: string,
  body: CommitmentUploadBody,
  token: string | null,
): Promise<GateResult<CommitmentUploadResponse>> {
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('uploadCommitment'))
  return gateCall(
    `/api/gates/commitments/${dealId}/upload`,
    { file_name: body.file_name, kind: body.kind, content_base64: body.content_base64 },
    token,
  )
}

// General borrower-document upload (document-pull session). Stores the file
// (source='upload'), indexes it, and recomputes presence so the matching
// condition moves toward obtained in the same request. Demo-blocked.
export interface DocumentUploadBody {
  file_name: string
  doc_kind: string
  borrower_id?: string | null
  content_base64: string
}
export interface DocumentUploadResponse {
  documentId: string
  pages: number
  dupOf: string | null
  presence: { conditionsConsidered: number; updated: number; byPresence: Record<string, number> } | null
}
export function uploadDealDocument(
  dealId: string,
  body: DocumentUploadBody,
  token: string | null,
): Promise<GateResult<DocumentUploadResponse>> {
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('uploadDealDocument'))
  return gateCall(
    `/api/gates/deals/${dealId}/documents`,
    { file_name: body.file_name, doc_kind: body.doc_kind, borrower_id: body.borrower_id ?? null, content_base64: body.content_base64 },
    token,
  )
}

// ─── Lender notes (lender-notes wiring session, 2026-07-15) ─────────────────
// Generate a submission-note DRAFT for a deal. The workbench feeds the deal's
// own data through the lender-notes skill, validates the output mechanically,
// and lands a draft; nothing is sent anywhere. The only input is Michael's
// optional advisor context. Demo-blocked (a draft is a real read + write).
// surfaceError is on so the button shows the workbench's exact diagnostic
// ("ANTHROPIC_API_KEY is not configured", "the note failed validation: ...").
export interface LenderNotesGenerateResponse {
  noteId: string
  dealId: string
  fileRef?: string
  status: string
  chars: number
  attempts: number
  generatedText: string
  sources: string[]
  supersededCount?: number
  replacedEditCount?: number
  finmoSnapshot?: 'refreshed' | 'stale_fallback' | 'reused' | 'access_denied' | 'absent'
  snapshotPulledAt?: string | null
  staleSnapshotUsed?: boolean
  /** Style + pinned-figure gates passed but the draft is over the character
   * ceiling — shown labelled for a manual trim (2026-07-16). */
  overCeiling?: boolean
  callsInWindow?: number
  emailsLinked?: number
}

export function generateLenderNotes(
  dealId: string,
  advisorContext: string | null | undefined,
  token: string | null,
  allowStale?: boolean,
): Promise<GateResult<LenderNotesGenerateResponse>> {
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('generateLenderNotes'))
  const body: Record<string, unknown> = {}
  const ctx = advisorContext?.trim()
  if (ctx) body.advisor_context = ctx.slice(0, 4000)
  // Step 1.2: the explicit second click to generate from the existing snapshot
  // when the fresh Finmo pull failed. Default off (a pull failure fails loud).
  if (allowStale) body.allow_stale_snapshot = true
  return gateCall(`/api/deals/${dealId}/lender-notes`, body, token, { surfaceError: true })
}

// ─── The submission substrate (finmo-substrate session, 2026-07-15) ─────────

export interface FinmoSnapshotPullResponse {
  dealId: string
  status: number
  accessDenied: boolean
  snapshotId: string | null
  pulledAt: string | null
  supersededCount: number
  accessDeniedMessage?: string
}
export function pullFinmoSnapshot(dealId: string, token: string | null): Promise<GateResult<FinmoSnapshotPullResponse>> {
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('pullFinmoSnapshot'))
  return gateCall(`/api/gates/deals/${dealId}/finmo-snapshot`, {}, token, { surfaceError: true })
}

export type SubmissionAction =
  | 'set_target_lender' | 'clear_target_lender'
  | 'set_insured_status' | 'clear_insured_status'
  | 'set_rate_override' | 'clear_rate_override'
export interface SubmissionSetResponse {
  dealId: string
  action: SubmissionAction
  targetLender: string | null
  insuredStatus: string | null
  rateOverride: number | null
}
export function setSubmissionField(
  dealId: string,
  action: SubmissionAction,
  value: string | number | null,
  note: string | null,
  token: string | null,
): Promise<GateResult<SubmissionSetResponse>> {
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('setSubmissionField'))
  const body: Record<string, unknown> = { action }
  if (value !== null && value !== undefined) body.value = value
  if (note && note.trim()) body.note = note.trim().slice(0, 2000)
  return gateCall(`/api/gates/deals/${dealId}/submission`, body, token, { surfaceError: true })
}

export interface LenderNoteEditResponse {
  noteId: string
  dealId: string
  chars: number
  status: string
  supersededCount: number
}
export function saveLenderNoteEdit(dealId: string, text: string, token: string | null): Promise<GateResult<LenderNoteEditResponse>> {
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('saveLenderNoteEdit'))
  return gateCall(`/api/deals/${dealId}/lender-notes-edit`, { text }, token, { surfaceError: true })
}

// The LIST gate: approve makes the extracted set the checklist (and supersedes
// a prior document's set); reject discards it. Keyed on the source document.
export type CommitmentListAction = 'approve' | 'reject'
export const COMMITMENT_LIST_ACTIONS: readonly CommitmentListAction[] = ['approve', 'reject']

export interface CommitmentListDecisionResponse {
  documentId: string
  action: string
  approved?: number
  rejected?: number
  superseded?: number
  auditId?: string
}

export function decideCommitmentList(
  documentId: string,
  action: CommitmentListAction,
  token: string | null,
  note?: string,
): Promise<GateResult<CommitmentListDecisionResponse>> {
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('decideCommitmentList'))
  return gateCall(
    `/api/gates/commitment-conditions/${documentId}/decision`,
    withNote({ action }, note),
    token,
  )
}

// Edit-then-approve ONE drafted condition (before the list is approved, or a
// single correction). Only the edited fields ride; provenance is untouchable.
export interface ConditionApproveBody {
  edited_text?: string
  edited_owner?: string
  edited_doc_kind?: string
  edited_borrower_id?: string
  // Michael's requirement target for a value-bearing condition (income /
  // appraisal / CCB). The document-vs-requirement analysis compares against it.
  edited_requirement_amount?: number
  note?: string
}

export interface ConditionApproveResponse {
  conditionId: string
  action: string
  gateStatus?: string
  auditId?: string
}

export function approveCondition(
  conditionId: string,
  body: ConditionApproveBody,
  token: string | null,
): Promise<GateResult<ConditionApproveResponse>> {
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('approveCondition'))
  const payload: Record<string, unknown> = {}
  const text = body.edited_text?.trim()
  if (text) payload.edited_text = text
  const owner = body.edited_owner?.trim()
  if (owner) payload.edited_owner = owner
  const docKind = body.edited_doc_kind?.trim()
  if (docKind) payload.edited_doc_kind = docKind
  const borrowerId = body.edited_borrower_id?.trim()
  if (borrowerId) payload.edited_borrower_id = borrowerId
  if (typeof body.edited_requirement_amount === 'number') payload.edited_requirement_amount = body.edited_requirement_amount
  return gateCall(`/api/gates/conditions/${conditionId}/approve`, withNote(payload, body.note), token)
}

// Human-only presence -> verified (records the actor). presence is the
// machine axis capped at obtained; verified is a person's tap.
export interface ConditionVerifyResponse {
  conditionId: string
  presence?: string
  verifiedAt?: string
  auditId?: string
  /** Additive (workbench cleanup, 2026-07-16): when the verified condition
   * carried an analysed value, the id of the provenanced evidence row the
   * verify promoted it to; null when nothing was promoted (the audit detail
   * carries the skip reason). */
  evidenceId?: string | null
}

export function verifyCondition(
  conditionId: string,
  token: string | null,
  note?: string,
): Promise<GateResult<ConditionVerifyResponse>> {
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('verifyCondition'))
  return gateCall(`/api/gates/conditions/${conditionId}/verify`, withNote({}, note), token)
}

// Recompute document presence on room open. Idempotent, read-only to Finmo;
// every internal role that sees a room may trigger it (conditions.recompute).
export interface RecomputePresenceResponse {
  dealId: string
  recomputed?: number
  changed?: number
  auditId?: string
}

export function recomputePresence(
  dealId: string,
  token: string | null,
): Promise<GateResult<RecomputePresenceResponse>> {
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('recomputePresence'))
  return gateCall(`/api/gates/deals/${dealId}/recompute-presence`, {}, token)
}

// ─── The documents desk (B6.4) ──────────────────────────────────────────────
// The idempotent "Check Finmo now" nudge (migration 0049, Task 8): forces a pull
// now, syncs the request inventory (marking deleted requests withdrawn),
// recomputes presence, and re-runs both analyses. Read-only to Finmo, a machine
// refresh a viewer triggers (conditions.recompute), not a human decision.
export interface CheckFinmoResponse {
  dealId?: string
  pulledAt?: string
  requests?: number
  withdrawn?: number
  reviewed?: number
  changed?: number
  auditId?: string
}

export function checkFinmoNow(dealId: string, token: string | null): Promise<GateResult<CheckFinmoResponse>> {
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('checkFinmoNow'))
  return gateCall(`/api/gates/deals/${dealId}/check-finmo`, {}, token)
}

// Michael's HUMAN review of a Finmo document request (migration 0049, Task 6):
// approve, or send back with a >=5-char reason. Records HIS review in the
// workbench (document_request_decisions) with his verified Clerk identity; the
// gate refuses a machine actor before any write. It does NOT touch Finmo.
export type DocumentRequestAction = 'approve' | 'send_back'
export const DOCUMENT_REQUEST_ACTIONS: readonly DocumentRequestAction[] = ['approve', 'send_back']

export interface DocumentRequestDecisionResponse {
  finmoRequestId?: string
  dealId?: string
  verdict?: string
  decidedByEmail?: string
  decidedAt?: string
  auditId?: string
}

export function decideDocumentRequest(
  finmoRequestId: string,
  action: DocumentRequestAction,
  token: string | null,
  note?: string,
): Promise<GateResult<DocumentRequestDecisionResponse>> {
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('decideDocumentRequest'))
  return gateCall(`/api/gates/document-requests/${finmoRequestId}/decision`, withNote({ action }, note), token)
}

// ─── Manual condition control (2026-07-14) ──────────────────────────────────
// Extraction is a draft Michael corrects, never an oracle. Add / edit /
// re-assign / remove a condition by hand — each POST-only, each carrying a
// person (browser-minted token), each demo-blocked, each writing one audit
// entry on the workbench. Nothing computes anything; nothing is hard-deleted
// (remove supersedes with a reason).

export const MANUAL_OWNER_OPTIONS = ['broker', 'solicitor', 'borrower', 'underwriting', 'product_mechanics'] as const
export type ManualOwner = (typeof MANUAL_OWNER_OPTIONS)[number]

export interface ManualConditionAddBody {
  text: string
  owner: ManualOwner
  doc_kind?: string | null
  borrower_id?: string | null
  due_date?: string | null
  load_bearing?: boolean
  // Michael's requirement target for a value-bearing condition (income /
  // appraisal / CCB); omitted -> parsed from the text where reliable.
  requirement_amount?: number | null
  note?: string
}
export interface ManualConditionEditBody {
  text?: string
  owner?: ManualOwner
  doc_kind?: string | null
  borrower_id?: string | null
  due_date?: string | null
  load_bearing?: boolean
  requirement_amount?: number | null
  note?: string
}
export interface ManualConditionResponse {
  conditionId?: string
  dealId?: string
  editedFields?: string[]
  from?: string
  to?: string
  auditId?: string
}

export function addManualCondition(
  dealId: string,
  body: ManualConditionAddBody,
  token: string | null,
): Promise<GateResult<ManualConditionResponse>> {
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('addManualCondition'))
  return gateCall(`/api/gates/deals/${dealId}/conditions`, { ...body }, token)
}

export function editCondition(
  conditionId: string,
  body: ManualConditionEditBody,
  token: string | null,
): Promise<GateResult<ManualConditionResponse>> {
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('editCondition'))
  return gateCall(`/api/gates/conditions/${conditionId}/edit`, { ...body }, token)
}

export function reassignConditionOwner(
  conditionId: string,
  owner: ManualOwner,
  token: string | null,
  note?: string,
): Promise<GateResult<ManualConditionResponse>> {
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('reassignConditionOwner'))
  return gateCall(`/api/gates/conditions/${conditionId}/reassign`, withNote({ owner }, note), token)
}

export function removeCondition(
  conditionId: string,
  reason: string,
  token: string | null,
): Promise<GateResult<ManualConditionResponse>> {
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('removeCondition'))
  return gateCall(`/api/gates/conditions/${conditionId}/remove`, { reason }, token)
}

// ─── Knowledge pipeline (upload, claim decisions, document URL) ─────────────
// Uploading a lender document mints PENDING claims only — nothing becomes
// citable knowledge until a claim decision approves it. The upload body is
// the strict documented shape; gateCall logs method/path/status only, so
// document bytes never reach a log line.

// The kind vocabulary lives in lib/knowledge-claims.ts (isomorphic) so the
// client upload form can render the select without pulling this server-only
// module into the browser bundle; re-exported here for the route handlers.
export { KNOWLEDGE_UPLOAD_KINDS }
export type { KnowledgeUploadKind }

export interface KnowledgeUploadBody {
  lender_slug: string
  file_name: string
  kind: KnowledgeUploadKind
  content_base64: string
}

export interface KnowledgeUploadResponse {
  documentId: string
  pages: number
  dupOf: string | null
  extraction: {
    outcome: string
    drafted: number
    confirmations: number
    conflicts: number
    byTopic: Record<string, number>
  } | null
}

export function uploadKnowledgeDocument(
  body: KnowledgeUploadBody,
  token: string | null,
): Promise<GateResult<KnowledgeUploadResponse>> {
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('uploadKnowledgeDocument'))
  return gateCall('/api/gates/knowledge/upload', {
    lender_slug: body.lender_slug,
    file_name: body.file_name,
    kind: body.kind,
    content_base64: body.content_base64,
  }, token)
}

export type KnowledgeClaimAction = 'approve' | 'reject'
export const KNOWLEDGE_CLAIM_ACTIONS: readonly KnowledgeClaimAction[] = ['approve', 'reject']

// as_of_date is REQUIRED by the gate to approve a claim whose stored
// as_of_date is null (a dateless claim is not citable); edited_text and
// edited_value ride only when Michael actually changed something.
export interface KnowledgeClaimDecisionBody {
  action: KnowledgeClaimAction
  note?: string
  edited_value?: unknown
  edited_text?: string
  as_of_date?: string
}

export interface KnowledgeClaimDecisionResponse {
  claimId: string
  action: string
  status?: string
  auditId?: string
}

export function decideKnowledgeClaim(
  claimId: string,
  body: KnowledgeClaimDecisionBody,
  token: string | null,
): Promise<GateResult<KnowledgeClaimDecisionResponse>> {
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('decideKnowledgeClaim'))
  const payload: Record<string, unknown> = { action: body.action }
  if (body.edited_value !== undefined) payload.edited_value = body.edited_value
  const editedText = body.edited_text?.trim()
  if (editedText) payload.edited_text = editedText
  const asOf = body.as_of_date?.trim()
  if (asOf) payload.as_of_date = asOf
  return gateCall(`/api/gates/knowledge-claims/${claimId}/decision`, withNote(payload, body.note), token)
}

export type KnowledgeDocAction = 'approve' | 'reject'
export const KNOWLEDGE_DOC_ACTIONS: readonly KnowledgeDocAction[] = ['approve', 'reject']

export interface KnowledgeDocDecisionBody {
  action: KnowledgeDocAction
  note?: string
}

// Batch decision over one document's pending claims. Claims with a null
// as_of are held out of a batch approve and returned as heldForAsOf, each
// resolved individually with a supplied date.
export interface KnowledgeDocDecisionResponse {
  documentId: string
  action: string
  approved?: number
  rejected?: number
  heldForAsOf?: unknown
  auditId?: string
}

export function decideKnowledgeDoc(
  documentId: string,
  body: KnowledgeDocDecisionBody,
  token: string | null,
): Promise<GateResult<KnowledgeDocDecisionResponse>> {
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('decideKnowledgeDoc'))
  return gateCall(`/api/gates/knowledge-docs/${documentId}/decision`, withNote({ action: body.action }, body.note), token)
}

// Short-lived signed URL to open a knowledge source document (60 seconds;
// mint per click, never store). Read side, knowledge.view token — lender
// reference material, so it stays real in demo like the other knowledge
// GETs.
export interface KnowledgeDocumentUrl {
  url: string
  expires_in: number
}

export function getKnowledgeDocumentUrl(
  documentId: string,
  token: string | null,
): Promise<GateResult<KnowledgeDocumentUrl>> {
  return gateGet(`/api/knowledge/document-url/${encodeURIComponent(documentId)}`, token)
}

// Short-lived signed URL to open a DEAL document (analysis session,
// 2026-07-15) — a condition's analysis citation links to the source it read.
// 60 seconds; mint per click, never store. Tenancy-scoped in the workbench.
// Unlike the knowledge citation (lender reference), a deal document is client
// PII, so this new surface is demo-blocked: zero reads of a real deal document
// in demo mode.
export function getDealDocumentUrl(
  documentId: string,
  token: string | null,
): Promise<GateResult<KnowledgeDocumentUrl>> {
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('getDealDocumentUrl'))
  return gateGet(`/api/gates/documents/${encodeURIComponent(documentId)}/url`, token)
}

// ─── Agent provisioning (Session 8; fox-underwriting micro-session 4) ──────
// POST /api/gates/agents creates the workbench half of a new agent behind
// the agents.provision key. The body schema is strict (an extra key is a
// 422 — structurally no credential can pass through), so only the four
// documented fields are ever sent. setup_remaining is the honest
// checklist the wizard renders verbatim: everything a working agent
// needs that the row alone does not give.

export interface AgentSetupRemainingItem {
  item: string
  note: string
}

export interface AgentProvisionResponse {
  agentId: string
  name: string
  email: string
  fsraLicence: string
  officePhone: string | null
  setup_remaining: AgentSetupRemainingItem[]
  auditId: string
}

export function provisionWorkbenchAgent(
  input: { name: string; email: string; fsraLicence: string; officePhone?: string },
  token: string | null,
): Promise<GateResult<AgentProvisionResponse>> {
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('provisionWorkbenchAgent'))
  const body: Record<string, unknown> = {
    name: input.name,
    email: input.email,
    fsra_licence: input.fsraLicence,
  }
  const phone = input.officePhone?.trim()
  if (phone) body.office_phone = phone
  return gateCall('/api/gates/agents', body, token)
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
  // Provincial availability (fox-underwriting provincial-availability session,
  // 2026-07-12). `provinces` is an array of 2-letter codes, "national", or
  // "unknown". Authoritative over the config/lender-provinces.ts server mirror.
  provinces?: string[] | 'national' | 'unknown'
  provinces_source?: string | null
  provinces_as_of?: string | null
  // Per-lender program definitions and channel access, when the registry
  // serves them (not yet populated as of 2026-07-12).
  programs?: Record<string, { description: string | null; source: string | null; as_of: string; documented: boolean }>
  channel_access?: { status: 'held' | 'not_held'; as_of: string; note: string }
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

// ─── Renewal drip (2026-07-16) ───────────────────────────────────────────────
// The approval desk's write actions. CONTRACT with the workbench gates API
// (renewal.decide, admin): approve SENDS (mode-gated on the workbench — ships
// off), edit saves a superseding human_edited draft, skip cancels one touch,
// exclude exits the sequence, autosend flips one tier (ships off). Every one
// demo-blocked.

export interface RenewalApproveResponse {
  touchId: string
  sentTo?: string
  messageId?: string
  mode?: 'test' | 'live'
}
export interface RenewalEditResponse {
  touchId: string
  draftId: string
}
export interface RenewalSkipResponse {
  touchId: string
}
export interface RenewalExcludeResponse {
  sequenceId: string
}
export interface RenewalAutosendResponse {
  skeletonId: string
  enabled: boolean
}

export function approveRenewalTouch(
  touchId: string,
  token: string | null,
  note?: string,
): Promise<GateResult<RenewalApproveResponse>> {
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('approveRenewalTouch'))
  return gateCall(`/api/gates/renewal/touches/${touchId}/approve`, withNote({}, note), token)
}

export function editRenewalTouchDraft(
  touchId: string,
  body: { subject?: string; body: string; note?: string },
  token: string | null,
): Promise<GateResult<RenewalEditResponse>> {
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('editRenewalTouchDraft'))
  return gateCall(`/api/gates/renewal/touches/${touchId}/edit`, body, token)
}

export function skipRenewalTouch(
  touchId: string,
  reason: string,
  token: string | null,
): Promise<GateResult<RenewalSkipResponse>> {
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('skipRenewalTouch'))
  return gateCall(`/api/gates/renewal/touches/${touchId}/skip`, { reason }, token)
}

export function excludeRenewalSequence(
  sequenceId: string,
  reason: string,
  token: string | null,
): Promise<GateResult<RenewalExcludeResponse>> {
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('excludeRenewalSequence'))
  return gateCall(`/api/gates/renewal/sequences/${sequenceId}/exclude`, { reason }, token)
}

export function setRenewalAutosend(
  tier: string,
  enabled: boolean,
  token: string | null,
): Promise<GateResult<RenewalAutosendResponse>> {
  if (isDemoMode()) return Promise.reject(new DemoWriteBlocked('setRenewalAutosend'))
  return gateCall('/api/gates/renewal/autosend', { tier, enabled }, token)
}
