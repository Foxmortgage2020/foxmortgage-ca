// The native Lender Notes Generator, the portal half (N-06, 2026-07-29).
//
// fox-underwriting's POST /api/bridge/lender-notes-generate (N-05) is the
// engine that replaced the n8n workflow of the same name. It assembles the
// file, calls the model, and on a REAL run writes onto the Zoho Deal in three
// ordered steps: the previous Lender_Notes are copied to a history Note, then
// Lender_Notes is overwritten, then a log Note records the run. A dry run does
// every fetch and the whole generation and stops before all three.
//
// This module is the ONLY thing in this repo that calls it, and it is SERVER
// ONLY. The bridge secret never reaches the browser.
//
// WHY A BRIDGE CALL AND NOT A GATE. Every other lender-notes action in this
// repo rides lib/gates.ts with a browser-minted Clerk token, because the
// workbench records a human against the decision. This one is a MACHINE path by
// the engine's own design: generation asserts no human identity anywhere and
// audits as 'system' (fox-underwriting guardrail 19, mirrored in this repo's
// "a machine may never write a human's identity" rule). The human is gated on
// THIS side, by the route's notes.crm.write permission. Forwarding a gates
// token would claim an identity the engine deliberately does not record.
//
// ENV. The secret is UW_BRIDGE_SECRET, already present in this repo for the
// room bridge and verified byte-identical to fox-underwriting's BRIDGE_SECRET
// (2026-07-29). The URL prefers an explicit UW_LENDER_NOTES_URL and otherwise
// derives from UW_BRIDGE_URL by swapping the rooms path for this one, so the
// call reaches wherever the room bridge already reaches. An UW_BRIDGE_URL of an
// unrecognised shape is NOT guessed at: the module reports not-configured and
// the card says so plainly.
//
// Logs carry the outcome, the write flags, and the duration. Never the note,
// never a borrower figure, never the secret.

export const LENDER_NOTES_BRIDGE_PATH = '/api/bridge/lender-notes-generate'
const ROOMS_BRIDGE_PATH = '/api/bridge/rooms'

// A generation is a model call over a whole file, so it is slow by nature. The
// route carries a matching maxDuration.
export const LENDER_NOTES_TIMEOUT_MS = 120_000

export type LenderNotesMode = 'DRAFT' | 'FINAL'
export type LenderNotesOutcome =
  | 'generated'
  | 'skipped_recent'
  | 'not_found'
  | 'generation_failed'

export interface LenderNotesWrites {
  history_note: boolean
  lender_notes: boolean
  log_note: boolean
}

// The engine's GenerateResult, as far as this repo reads it. Extra fields the
// engine adds ride through untouched in the JSON; nothing here parses them.
export interface LenderNotesRun {
  ok: boolean
  dryRun: boolean
  outcome: LenderNotesOutcome
  mode: LenderNotesMode
  dealId: string | null
  dealName: string | null
  note: string | null
  diagnostics: { charCount?: number; truncated?: boolean } | null
  model: string | null
  sources: Record<string, number | boolean> | null
  writes: LenderNotesWrites
  notes: string[]
  errors: string[]
  auditId: string | null
}

// Portal-side error kinds. Note that a 401 from the engine is NOT the caller's
// auth problem: the browser session was already gated on this side, so a
// refused bridge secret is a configuration fault and reads as one.
export type LenderNotesErrorKind =
  | 'not-configured'
  | 'credential'
  | 'not-found'
  | 'unavailable'
  | 'engine'
  | 'network'

export const LENDER_NOTES_STATUS_BY_KIND: Record<LenderNotesErrorKind, number> = {
  'not-configured': 503,
  credential: 502,
  'not-found': 404,
  unavailable: 503,
  engine: 502,
  network: 502,
}

export type LenderNotesBridgeResult =
  | { ok: true; run: LenderNotesRun }
  | { ok: false; kind: LenderNotesErrorKind; message: string; run: LenderNotesRun | null }

// Only the three keys below are ever read, so the helpers take the narrow
// shape rather than the whole ProcessEnv (which a test would have to fake).
export type LenderNotesEnv = Record<string, string | undefined>

/**
 * Where the engine lives. Pure and unit-tested: an explicit
 * UW_LENDER_NOTES_URL wins, otherwise the room bridge URL is rewritten to this
 * endpoint. Any other shape returns null rather than a guess.
 */
export function resolveLenderNotesUrl(env: LenderNotesEnv = process.env): string | null {
  const explicit = env.UW_LENDER_NOTES_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')
  const rooms = env.UW_BRIDGE_URL?.trim().replace(/\/+$/, '')
  if (!rooms) return null
  if (rooms.endsWith(ROOMS_BRIDGE_PATH)) {
    return rooms.slice(0, rooms.length - ROOMS_BRIDGE_PATH.length) + LENDER_NOTES_BRIDGE_PATH
  }
  return null
}

export function lenderNotesBridgeConfigured(env: LenderNotesEnv = process.env): boolean {
  return Boolean(resolveLenderNotesUrl(env) && env.UW_BRIDGE_SECRET)
}

export interface LenderNotesRequest {
  /** Either identifier is enough. Both are read server-side from the workbench
   *  deal row, never accepted from the browser. */
  zohoDealId: string | null
  finmoApplicationId: string | null
  mode?: LenderNotesMode
  /** Regenerate inside the engine's 10 minute recency window. */
  force?: boolean
  dryRun: boolean
}

function isRun(v: unknown): v is LenderNotesRun {
  return Boolean(v && typeof v === 'object' && 'outcome' in (v as Record<string, unknown>))
}

function engineMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const e = (body as Record<string, unknown>).error
  return typeof e === 'string' && e.trim() ? e.trim() : null
}

/**
 * Run the generator. A dry run proves the whole chain without touching Zoho;
 * a real run performs the three writes and reports exactly which landed.
 */
export async function runLenderNotesOnCrm(
  req: LenderNotesRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<LenderNotesBridgeResult> {
  const url = resolveLenderNotesUrl()
  const secret = process.env.UW_BRIDGE_SECRET
  if (!url || !secret) {
    return {
      ok: false,
      kind: 'not-configured',
      message:
        'The lender notes generator is not connected. Set UW_LENDER_NOTES_URL (or UW_BRIDGE_URL) and UW_BRIDGE_SECRET on this deployment.',
      run: null,
    }
  }
  if (!req.zohoDealId && !req.finmoApplicationId) {
    return {
      ok: false,
      kind: 'not-found',
      message: 'This deal room carries no Zoho file and no Finmo application, so the generator has nothing to write to.',
      run: null,
    }
  }

  const body: Record<string, unknown> = { mode: req.mode ?? 'DRAFT' }
  if (req.zohoDealId) body.zoho_deal_id = req.zohoDealId
  if (req.finmoApplicationId) body.finmo_application_id = req.finmoApplicationId
  if (req.force) body.force = true
  if (req.dryRun) body.dry_run = true

  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LENDER_NOTES_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bridge-secret': secret },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    })
  } catch {
    clearTimeout(timer)
    console.error(`[lender-notes] POST bridge NETWORK dry=${req.dryRun} ms=${Date.now() - started}`)
    return {
      ok: false,
      kind: 'network',
      message: 'Could not reach the lender notes generator. It may still be running. Check the Zoho file before retrying.',
      run: null,
    }
  }
  clearTimeout(timer)
  const ms = Date.now() - started

  let parsed: unknown = null
  try {
    parsed = await res.json()
  } catch {
    // Non-JSON body: the fixed copy below carries the status.
  }

  if (isRun(parsed)) {
    const run = parsed
    console.log(
      `[lender-notes] POST bridge ${res.status} dry=${run.dryRun} outcome=${run.outcome}` +
        ` writes=${run.writes.history_note ? 'h' : '-'}${run.writes.lender_notes ? 'n' : '-'}${run.writes.log_note ? 'l' : '-'}` +
        ` errors=${run.errors.length} ms=${ms}`,
    )
    if (run.ok) return { ok: true, run }
    return {
      ok: false,
      kind: run.outcome === 'not_found' ? 'not-found' : 'engine',
      message: run.errors[0] ?? 'The generator did not complete. Nothing was written.',
      run,
    }
  }

  console.error(`[lender-notes] POST bridge ${res.status} dry=${req.dryRun} ms=${ms}`)
  const detail = engineMessage(parsed)
  if (res.status === 401) {
    return {
      ok: false,
      kind: 'credential',
      message: 'The workbench refused the portal bridge credential. UW_BRIDGE_SECRET and the workbench BRIDGE_SECRET no longer match.',
      run: null,
    }
  }
  if (res.status === 503) {
    // The engine names its own missing dependency (Zoho, the model key, the
    // database). That text is operator-facing and carries no borrower data.
    return { ok: false, kind: 'unavailable', message: detail ?? 'The generator is not configured on the workbench.', run: null }
  }
  if (res.status === 422) {
    return { ok: false, kind: 'not-found', message: detail ?? 'The generator could not identify the deal.', run: null }
  }
  return { ok: false, kind: 'engine', message: detail ?? `The generator answered ${res.status}. Nothing is confirmed written.`, run: null }
}
