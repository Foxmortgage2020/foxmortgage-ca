// Persist-first intake pipeline for the public forms and the partner
// referral form (hotfix, July 2026). The pipeline order is fixed:
//
//   1. captureSubmission() writes the raw payload to form_submissions in
//      the foxmortgage-ca Supabase project (skfeivzhqvrefnkqjwtj). This is
//      the guaranteed capture and the inbound-lead audit trail.
//   2. The route creates the structured Zoho record and stamps the outcome
//      on the row via markSubmission() (zoho_created / zoho_failed).
//   3. notifyMichael() emails the submission. Email failures are logged and
//      never fatal, because the row already guarantees capture.
//   4. The route returns success ONLY when the submission is durably held
//      somewhere (the row, or the Zoho record if the store was down).
//      Never again a 200 on a dropped submission.
//
// Store access uses FOXCA_SUPABASE_KEY (publishable key, server-only, never
// NEXT_PUBLIC) with row-level security that allows insert plus the four
// status columns on update, and no reads. Swapping the env var to the
// project's secret key later needs no code change.

import { randomUUID } from 'crypto'
import { Resend } from 'resend'

export type FormSource = 'contact' | 'investor-inquiry' | 'partner-referral'

export interface CaptureInput {
  source: FormSource
  rawPayload: unknown
  submitterName?: string | null
  submitterEmail?: string | null
  clerkUserId?: string | null
  partnerZohoId?: string | null
  partnerRole?: string | null
}

export type CaptureResult =
  | { stored: true; id: string }
  | { stored: false; id: string; error: string }

function storeEnv(): { url: string; key: string } | null {
  const url = process.env.FOXCA_SUPABASE_URL
  const key = process.env.FOXCA_SUPABASE_KEY
  if (!url || !key) return null
  return { url: url.replace(/\/+$/, '').replace(/\/rest\/v1$/, ''), key }
}

// Step 1: write the raw submission. The id is generated here so later
// status updates never need to read the row back (the store role has no
// general select access by design).
export async function captureSubmission(input: CaptureInput): Promise<CaptureResult> {
  const id = randomUUID()
  const env = storeEnv()
  if (!env) {
    console.error('[form-intake] store not configured (FOXCA_SUPABASE_URL / FOXCA_SUPABASE_KEY)')
    return { stored: false, id, error: 'submission store not configured' }
  }
  try {
    const res = await fetch(`${env.url}/rest/v1/form_submissions`, {
      method: 'POST',
      headers: {
        apikey: env.key,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        id,
        source: input.source,
        raw_payload: input.rawPayload ?? {},
        submitter_name: input.submitterName ?? null,
        submitter_email: input.submitterEmail ?? null,
        clerk_user_id: input.clerkUserId ?? null,
        partner_zoho_id: input.partnerZohoId ?? null,
        partner_role: input.partnerRole ?? null,
      }),
      cache: 'no-store',
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('[form-intake] insert failed', res.status, text.slice(0, 200))
      return { stored: false, id, error: `store insert failed (HTTP ${res.status})` }
    }
    return { stored: true, id }
  } catch (err) {
    console.error('[form-intake] store unreachable', err)
    return { stored: false, id, error: 'submission store unreachable' }
  }
}

// Step 2/3 bookkeeping: stamp the processing outcome. Goes through the
// security-definer function mark_form_submission because the app role is
// insert-only on the table (a direct RLS + column-grant PATCH silently
// matched zero rows). Best-effort; the raw row already exists, so a failed
// stamp is logged and swallowed.
export async function markSubmission(
  id: string,
  patch: {
    processing_status?: 'zoho_created' | 'zoho_failed'
    zoho_record_id?: string
    error_detail?: string
    resend_message_id?: string
  },
): Promise<void> {
  const env = storeEnv()
  if (!env) return
  try {
    const res = await fetch(`${env.url}/rest/v1/rpc/mark_form_submission`, {
      method: 'POST',
      headers: {
        apikey: env.key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_id: id,
        p_status: patch.processing_status ?? null,
        p_zoho_record_id: patch.zoho_record_id ?? null,
        p_error_detail: patch.error_detail ?? null,
        p_resend_message_id: patch.resend_message_id ?? null,
      }),
      cache: 'no-store',
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('[form-intake] mark failed', id, res.status, text.slice(0, 150))
    }
  } catch (err) {
    console.error('[form-intake] mark unreachable', id, err)
  }
}

// Step 3: email Michael. Returns the Resend message id for the audit row,
// or null on failure. Never throws.
export async function notifyMichael(input: { subject: string; text: string }): Promise<string | null> {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { data, error } = await resend.emails.send({
      from: 'Fox Mortgage <noreply@app.foxmortgage.ca>',
      to: 'mfox@foxmortgage.ca',
      subject: input.subject,
      text: input.text,
    })
    if (error) {
      console.error('[form-intake] notify failed', error)
      return null
    }
    return data?.id ?? null
  } catch (err) {
    console.error('[form-intake] notify threw', err)
    return null
  }
}

// One-line audit trail for the notification email: where the submission
// actually lives right now. In a double failure (store down AND Zoho down)
// the email itself is the only record, and it says so.
export function captureStatusLine(
  zohoId: string | null,
  zohoError: string | null,
  capture: CaptureResult,
): string {
  if (zohoId) return `created (id ${zohoId})`
  const zohoPart = `NOT created (${zohoError ?? 'unknown error'})`
  return capture.stored
    ? `${zohoPart}; the submission is stored with id ${capture.id}`
    : `${zohoPart}; the submission store also failed (${capture.error}), so this email is the only record`
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Trimmed, length-capped string from an unknown payload value.
export function str(v: unknown, max = 500): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}
