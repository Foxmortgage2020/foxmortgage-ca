// Lender-notes button logic, isomorphic and pure (no 'use client', no next/*,
// no Clerk) so it is unit-testable in the node vitest environment and shared by
// the client card. The card owns the DOM; this owns the decision of what to
// call and what a demo click produces.
//
// The lender note follows the SKILL's style rules, not the client-facing copy
// rules: semicolons are permitted (the skill offers them as a dash alternative)
// and the no-dash rule is absolute. This canned demo note obeys the skill.

export const LENDER_NOTES_CEILING = 3750

// A fully-fictional demo note (no real client, no real figures). It is what a
// demo click produces — zero real reads, zero writes. It obeys the skill's
// mechanical rules so the demo looks exactly like a real draft.
export const DEMO_LENDER_NOTE = `Hello Demo Lender Team,

Please find attached an application for the purchase of 12 Sample Street, London, ON at $720,000 with $144,000 down (20.00%) and a $576,000 mortgage on a 5-yr Fixed, 25-year amortization. Well-supported file with a conservative 80.00% LTV, qualified on salaried T4 income with GDS 29.40% and TDS 34.10%.

DEAL SNAPSHOT

CLOSING: Aug 15, 2026
PURCHASE: $720,000
DOWN PAYMENT: $144,000 (20.00%)
MORTGAGE: $576,000
LTV: 80.00%
PRODUCT: 5-yr Fixed
GDS / TDS: 29.40% / 34.10%

INCOME (Qualifying on the primary applicant)

Primary applicant is salaried at a regional employer since 2019; qualifying on T4 income. Ratios remain comfortable at 29.40 and 34.10.

DOWN PAYMENT

Total: $144,000 from the applicant's own savings; 90-day history to follow.

SUBJECT PROPERTY

12 Sample Street, London, ON. Marketable location, firm APS executed. Requesting AVM given the favourable file profile.

Well-supported file with conservative ratios and a clean structure. Please advise on any additional documentation needed.

Thanks!
Michael Fox, BRX Mortgage`

export interface GenerateResult {
  ok: boolean
  note?: string
  message?: string
  demo?: boolean
  finmoSnapshot?: string
  callsInWindow?: number
  emailsLinked?: number
  replacedEditCount?: number
  /** The fresh Finmo pull failed and an older snapshot is available: the card
   * offers an explicit second click to generate from it (Step 1.2). */
  staleFallbackAvailable?: boolean
  /** The draft is style + figure valid but over the character ceiling; shown
   * labelled for a manual trim, with its count (2026-07-16). */
  overCeiling?: boolean
  chars?: number
}

// The workbench states this marker in a Finmo-pull-failure message; the card
// uses it to offer the explicit stale-snapshot second click.
const STALE_FALLBACK_MARKER = 'stale-snapshot fallback'

/**
 * Decide what a Generate click does and run it. In demo mode it returns the
 * canned note WITHOUT minting a token or touching the network (proven by test).
 * Otherwise it mints a fresh gates token, POSTs to the portal proxy, and reads
 * the draft out of the GateResult envelope (json.data.generatedText).
 */
export async function runLenderNotesGeneration(args: {
  dealId: string
  advisorContext: string
  demo: boolean
  mintToken: () => Promise<string | null>
  gatesTokenHeader: string
  fetchImpl?: typeof fetch
  /** Step 1.2: the explicit second click after a fresh-pull failure. */
  allowStale?: boolean
}): Promise<GenerateResult> {
  if (args.demo) {
    return { ok: true, note: DEMO_LENDER_NOTE, demo: true }
  }
  const doFetch = args.fetchImpl ?? fetch
  const token = await args.mintToken()
  let res: Response
  try {
    res = await doFetch(`/api/portal/admin/gates/deals/${args.dealId}/lender-notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { [args.gatesTokenHeader]: token } : {}) },
      body: JSON.stringify({ advisor_context: args.advisorContext.trim() || undefined, allow_stale_snapshot: args.allowStale || undefined }),
    })
  } catch {
    return { ok: false, message: 'Could not reach the server. Check your connection and retry.' }
  }
  const json = await res.json().catch(() => null)
  if (json?.ok && json.data?.generatedText) {
    return {
      ok: true, note: String(json.data.generatedText),
      finmoSnapshot: json.data.finmoSnapshot, callsInWindow: json.data.callsInWindow,
      emailsLinked: json.data.emailsLinked, replacedEditCount: json.data.replacedEditCount,
      // Only carried when over the ceiling — a normal note keeps the existing shape.
      ...(json.data.overCeiling === true ? { overCeiling: true, chars: json.data.chars } : {}),
    }
  }
  const message = json?.message ?? `Generation failed (HTTP ${res.status}).`
  // A fresh-pull failure fails loud; if an older snapshot exists, offer the
  // explicit second click rather than silently using stale data.
  return { ok: false, message, staleFallbackAvailable: typeof message === 'string' && message.includes(STALE_FALLBACK_MARKER) }
}

// ─── The readiness strip actions (finmo-substrate session) ──────────────────
// Each mints a fresh gates token and POSTs to the portal proxy; each is a
// no-op zero-network success in demo mode (proven by test). The card refreshes
// the server view after an ok.

export interface ActionResult { ok: boolean; message?: string; demo?: boolean }

async function postAction(
  path: string,
  body: unknown,
  args: { demo: boolean; mintToken: () => Promise<string | null>; gatesTokenHeader: string; fetchImpl?: typeof fetch },
  demoMessage: string,
): Promise<ActionResult> {
  if (args.demo) return { ok: true, demo: true, message: demoMessage }
  const doFetch = args.fetchImpl ?? fetch
  const token = await args.mintToken()
  let res: Response
  try {
    res = await doFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { [args.gatesTokenHeader]: token } : {}) },
      body: JSON.stringify(body),
    })
  } catch {
    return { ok: false, message: 'Could not reach the server. Check your connection and retry.' }
  }
  const json = await res.json().catch(() => null)
  if (json?.ok) return { ok: true }
  return { ok: false, message: json?.message ?? `Action failed (HTTP ${res.status}).` }
}

export function runFinmoPull(args: { dealId: string; demo: boolean; mintToken: () => Promise<string | null>; gatesTokenHeader: string; fetchImpl?: typeof fetch }): Promise<ActionResult> {
  return postAction(`/api/portal/admin/gates/deals/${args.dealId}/finmo-snapshot`, {}, args, 'Demo: pretend-pulled the Finmo application.')
}

export type SubmissionActionName =
  | 'set_target_lender' | 'clear_target_lender'
  | 'set_insured_status' | 'clear_insured_status'
  | 'set_rate_override' | 'clear_rate_override'

export function runSubmissionSet(args: {
  dealId: string; action: SubmissionActionName; value?: string | number | null; note?: string | null;
  demo: boolean; mintToken: () => Promise<string | null>; gatesTokenHeader: string; fetchImpl?: typeof fetch
}): Promise<ActionResult> {
  const body: Record<string, unknown> = { action: args.action }
  if (args.value !== null && args.value !== undefined && args.value !== '') body.value = args.value
  if (args.note && args.note.trim()) body.note = args.note.trim()
  return postAction(`/api/portal/admin/gates/deals/${args.dealId}/submission`, body, args, 'Demo: pretend-set the field.')
}

export function runNoteEdit(args: { dealId: string; text: string; demo: boolean; mintToken: () => Promise<string | null>; gatesTokenHeader: string; fetchImpl?: typeof fetch }): Promise<ActionResult> {
  return postAction(`/api/portal/admin/gates/deals/${args.dealId}/lender-notes/edit`, { text: args.text }, args, 'Demo: pretend-saved the edit.')
}
