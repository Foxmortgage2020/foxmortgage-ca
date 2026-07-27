// Replay for form submissions whose downstream Zoho write failed (B0,
// 2026-07-27).
//
// The capture row is the durable record: a zoho_failed row means the lead is
// safe but never reached the CRM, so it is invisible to the practice until
// someone re-runs it. Before this there was no way to re-run it except by
// hand. The known open item on ZOHO_REFRESH_TOKEN rotation is exactly the
// event that would turn every submission into a zoho_failed row at once, so
// this is the recovery path for that outage.
//
// Server-only. Reads through the operator-secret security-definer function
// (the FOXCA hardening posture), rebuilds the Zoho record from the stored
// payload, and stamps the outcome through the same mark_form_submission()
// the live routes use. Append-only in spirit: nothing is ever deleted, and a
// row that fails again simply stays failed with a fresh error.

import { createZohoLead } from '@/lib/zoho'
import { foxcaOperatorSecret } from '@/lib/foxca-secret'
import { markSubmission, str, type FormSource } from '@/lib/form-intake'

export interface ReplayCandidate {
  id: string
  createdAt: string
  source: string
  rawPayload: Record<string, unknown>
  submitterName: string | null
  submitterEmail: string | null
  partnerZohoId: string | null
  partnerRole: string | null
  errorDetail: string | null
}

export interface ReplayOutcome {
  id: string
  source: string
  ok: boolean
  zohoId?: string
  error?: string
  skipped?: string
}

export interface ReplayReport {
  configured: boolean
  attempted: number
  succeeded: number
  failed: number
  skipped: number
  outcomes: ReplayOutcome[]
  error?: string
}

function foxcaEnv(): { base: string; key: string } | null {
  const url = process.env.FOXCA_SUPABASE_URL
  const key = process.env.FOXCA_SUPABASE_KEY
  if (!url || !key) return null
  return { base: url.replace(/\/+$/, '').replace(/\/rest\/v1$/, ''), key }
}

export async function listReplayCandidates(): Promise<ReplayCandidate[] | null> {
  const env = foxcaEnv()
  if (!env) return null
  const res = await fetch(`${env.base}/rest/v1/rpc/form_submission_replay_candidates`, {
    method: 'POST',
    headers: {
      apikey: env.key,
      Authorization: `Bearer ${env.key}`,
      'Content-Type': 'application/json',
    },
    // POST, not GET: the operator secret must never ride a URL query string.
    body: JSON.stringify({ p_operator_secret: foxcaOperatorSecret() }),
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`replay candidates query failed (HTTP ${res.status}) ${text.slice(0, 160)}`)
  }
  const rows = (await res.json()) as any[]
  return (Array.isArray(rows) ? rows : []).map(r => ({
    id: r.id,
    createdAt: r.created_at,
    source: r.source,
    rawPayload: (r.raw_payload ?? {}) as Record<string, unknown>,
    submitterName: r.submitter_name ?? null,
    submitterEmail: r.submitter_email ?? null,
    partnerZohoId: r.partner_zoho_id ?? null,
    partnerRole: r.partner_role ?? null,
    errorDetail: r.error_detail ?? null,
  }))
}

// Rebuild the Zoho Lead the original route would have created. This mirrors
// the three route mappings rather than importing them: the routes build their
// payload inline mid-request, and reaching into three working production
// paths to extract a shared mapper is a larger change than this recovery tool
// justifies. Keep this in step if a route's Zoho mapping ever changes.
export function zohoLeadFromSubmission(c: ReplayCandidate): Record<string, unknown> | null {
  const p = c.rawPayload
  switch (c.source as FormSource) {
    case 'contact': {
      const name = str(p.name, 200) || c.submitterName || ''
      const email = str(p.email, 320) || c.submitterEmail || ''
      const phone = str(p.phone, 50)
      if (!name || !email) return null
      return {
        Last_Name: name,
        Email: email,
        ...(phone ? { Phone: phone } : {}),
        Lead_Source: 'Website',
        Description: `Interest: ${str(p.interest, 100) || 'General Inquiry'}\n\n${str(p.message, 5000) || '(no message)'}`,
      }
    }
    case 'investor-inquiry': {
      const firstName = str(p.firstName, 100)
      const lastName = str(p.lastName, 100)
      const email = str(p.email, 320) || c.submitterEmail || ''
      const phone = str(p.phone, 50)
      if (!firstName || !lastName || !email) return null
      return {
        First_Name: firstName,
        Last_Name: lastName,
        Email: email,
        ...(phone ? { Phone: phone } : {}),
        Lead_Source: 'Private Lending Page',
        Description: `Capital: ${str(p.capital, 100) || 'Not specified'}
Position: ${str(p.position, 200) || 'Not specified'}
Vehicle: ${str(p.vehicle, 100) || 'Not specified'}

${str(p.message, 5000) || '(no message)'}`,
      }
    }
    case 'partner-referral': {
      const clientName = str(p.clientName, 200)
      const clientEmail = str(p.clientEmail, 320) || c.submitterEmail || ''
      const clientPhone = str(p.clientPhone, 50)
      if (!clientName || !clientEmail) return null
      // Attribution comes off the ROW, not the payload. Without a partner id
      // the referral would land unattributed, so refuse rather than guess.
      if (!c.partnerZohoId) return null
      return {
        Last_Name: clientName,
        Email: clientEmail,
        ...(clientPhone ? { Phone: clientPhone } : {}),
        Lead_Source: 'Partner Referral',
        Description: `[PARTNER REFERRAL]
Referred by: ${c.submitterName || '(name not recorded)'} (${c.partnerRole || 'unknown role'})
Partner Zoho ID: ${c.partnerZohoId}
Replayed from submission ${c.id}

Property Type: ${str(p.propertyType, 100) || 'Not specified'}
Estimated Price: ${str(p.estimatedPrice, 100) || 'Not specified'}
Closing Date: ${str(p.closingDate, 100) || 'Not specified'}
Mortgage Type: ${str(p.mortgageType, 100) || 'Not specified'}
Notes: ${str(p.notes, 5000) || 'None'}`,
      }
    }
    default:
      // 'smm-interest' never writes to Zoho, so it can never be a failed
      // candidate. Anything unrecognised is skipped rather than guessed at.
      return null
  }
}

export async function replayFailedSubmissions(): Promise<ReplayReport> {
  const empty: ReplayReport = {
    configured: false,
    attempted: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    outcomes: [],
  }
  let candidates: ReplayCandidate[] | null
  try {
    candidates = await listReplayCandidates()
  } catch (err) {
    return {
      ...empty,
      configured: true,
      error: err instanceof Error ? err.message : 'replay candidates unreadable',
    }
  }
  if (candidates === null) return empty

  const outcomes: ReplayOutcome[] = []
  for (const c of candidates) {
    const lead = zohoLeadFromSubmission(c)
    if (!lead) {
      outcomes.push({
        id: c.id,
        source: c.source,
        ok: false,
        skipped: 'not enough recorded detail to rebuild the record safely',
      })
      continue
    }
    try {
      const res = await createZohoLead(lead as any)
      const zohoId = (res as any)?.data?.[0]?.details?.id ?? null
      if (!zohoId) throw new Error('Zoho returned no record id')
      await markSubmission(c.id, { processing_status: 'zoho_created', zoho_record_id: zohoId })
      outcomes.push({ id: c.id, source: c.source, ok: true, zohoId })
    } catch (err) {
      const message = err instanceof Error ? err.message.slice(0, 500) : 'Zoho create failed'
      // Stays failed, with the newest reason. Nothing is lost either way.
      await markSubmission(c.id, {
        processing_status: 'zoho_failed',
        error_detail: `replay: ${message}`,
      })
      outcomes.push({ id: c.id, source: c.source, ok: false, error: message })
    }
  }

  return {
    configured: true,
    attempted: outcomes.length,
    succeeded: outcomes.filter(o => o.ok).length,
    failed: outcomes.filter(o => !o.ok && !o.skipped).length,
    skipped: outcomes.filter(o => o.skipped).length,
    outcomes,
  }
}
