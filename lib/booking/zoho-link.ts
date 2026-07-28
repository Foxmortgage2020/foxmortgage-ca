// The Zoho half of a booking. SERVER-ONLY.
//
// WHAT IT DOES, by whether we know who the person is:
//   * TOKENED (they came from a link we sent, so we hold their record ids):
//     write a Note on the Contact and, when there is one, on the Deal. When they
//     ticked the consent box, stamp the Contact's CASL fields.
//   * UNTOKENED (a stranger from the public page): create a Lead, the same way
//     every other public form in this repo does.
//
// PERSIST FIRST, ALWAYS. Every function here runs AFTER the booking row is
// committed, so a Zoho outage can never cost a booking. Nothing throws to a
// caller; every path returns a result and logs.
//
// THE CONSENT RULE, and it is the one thing in this file worth being pedantic
// about: consent is only ever written when the box was ticked. An unticked box
// writes NOTHING. It does not clear a date, it does not set a method to none, it
// does not touch Email_Opt_Out. Someone who consented last year and did not tick
// the box today still has last year's consent, because that is what happened.
// Absence of consent is not withdrawal of consent, and this file never confuses
// the two.

import { getZohoToken } from '@/lib/zoho'
import { isDemoMode } from '@/lib/demo'
import {
  CASL_METHOD_EXPRESS,
  CASL_SOURCE_BOOKING,
  ZOHO_BOOKING_NOTE_PREFIX,
} from '@/config/booking'

const ZOHO_API = 'https://www.zohoapis.com/crm/v2'

/** Modules a booking may attach a note to. */
export type NoteModule = 'Contacts' | 'Potentials' | 'Leads'

// ─── Notes ───────────────────────────────────────────────────────────────────

/**
 * Create a Note on a record.
 *
 * Uses the RELATED-LIST endpoint (POST /{module}/{id}/Notes) rather than POST
 * /Notes with a Parent_Id body. The Notes module is system_hidden on this org
 * and its Parent_Id metadata reports every operation_type false, so binding the
 * parent through the URL is both simpler and the shape the existing read paths
 * already mirror (GET /Potentials/{id}/Notes).
 *
 * The Notes module SILENTLY DROPS custom fields on this org, so Note_Title is
 * the only durable signal. The title prefix therefore matters: the portal's
 * message reads split on prefixes like 'FP Message from ', and a booking note
 * must not land in that bucket.
 */
export async function createZohoNote(input: {
  module: NoteModule
  recordId: string
  title: string
  content: string
}): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  if (isDemoMode()) return { ok: false, error: 'demo mode' }
  let token: string
  try {
    token = await getZohoToken()
  } catch (err) {
    console.error('[booking-zoho] note token error', err)
    return { ok: false, error: 'token' }
  }
  try {
    const res = await fetch(`${ZOHO_API}/${input.module}/${encodeURIComponent(input.recordId)}/Notes`, {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: [{ Note_Title: input.title.slice(0, 120), Note_Content: input.content.slice(0, 32000) }],
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[booking-zoho] note HTTP ${res.status}`, text.slice(0, 200))
      return { ok: false, error: `HTTP ${res.status}` }
    }
    // Zoho can answer 200 with a per-row failure, so the row status is checked
    // rather than trusted.
    const body = (await res.json().catch(() => null)) as any
    const row = body?.data?.[0]
    if (row?.status !== 'success') {
      console.error('[booking-zoho] note row not success', row?.code ?? 'unknown')
      return { ok: false, error: String(row?.code ?? 'row failed') }
    }
    return { ok: true, id: row?.details?.id ?? null }
  } catch (err) {
    console.error('[booking-zoho] note threw', err)
    return { ok: false, error: 'unreachable' }
  }
}

// ─── Consent ─────────────────────────────────────────────────────────────────

/**
 * Stamp express consent on a Contact.
 *
 * ONLY CALLED WHEN THE BOX WAS TICKED. There is deliberately no "false" branch
 * anywhere in this file.
 *
 * `CASL_Consent_Language` stores the exact words the person agreed to, which is
 * the record a regulator would ask for. It is a storage field only, not
 * filterable, so nothing queries on it.
 */
export async function stampCaslConsent(input: {
  contactId: string
  consentedAtIso: string
  consentLanguage: string
}): Promise<{ ok: boolean; error?: string }> {
  if (isDemoMode()) return { ok: false, error: 'demo mode' }
  let token: string
  try {
    token = await getZohoToken()
  } catch (err) {
    console.error('[booking-zoho] consent token error', err)
    return { ok: false, error: 'token' }
  }
  // Zoho datetime wants yyyy-MM-dd'T'HH:mm:ssXXX, so the milliseconds go.
  const caslDate = input.consentedAtIso.replace(/\.\d{3}Z$/, '+00:00').replace(/Z$/, '+00:00')
  try {
    const res = await fetch(`${ZOHO_API}/Contacts`, {
      method: 'PUT',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: [
          {
            id: input.contactId,
            CASL_Consent_Date: caslDate,
            CASL_Consent_Method: CASL_METHOD_EXPRESS,
            CASL_Consent_Source: CASL_SOURCE_BOOKING,
            CASL_Consent_Language: input.consentLanguage.slice(0, 32000),
          },
        ],
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[booking-zoho] consent HTTP ${res.status}`, text.slice(0, 200))
      return { ok: false, error: `HTTP ${res.status}` }
    }
    const body = (await res.json().catch(() => null)) as any
    const row = body?.data?.[0]
    if (row?.status !== 'success') {
      console.error('[booking-zoho] consent row not success', row?.code ?? 'unknown')
      return { ok: false, error: String(row?.code ?? 'row failed') }
    }
    return { ok: true }
  } catch (err) {
    console.error('[booking-zoho] consent threw', err)
    return { ok: false, error: 'unreachable' }
  }
}

// ─── Contact read, for server-side prefill ───────────────────────────────────

export interface PrefillContact {
  name: string
  email: string
  phone: string
}

/**
 * Read the contact behind a prefill token, SERVER-SIDE.
 *
 * This is what lets the booking form arrive filled in without any personal data
 * ever riding the URL: the link carries an opaque record id, and the name, email,
 * and number are fetched here and rendered straight into the page.
 */
export async function getContactForPrefill(contactId: string): Promise<PrefillContact | null> {
  if (isDemoMode()) return null
  let token: string
  try {
    token = await getZohoToken()
  } catch {
    return null
  }
  try {
    const res = await fetch(
      `${ZOHO_API}/Contacts/${encodeURIComponent(contactId)}?fields=First_Name,Last_Name,Full_Name,Email,Phone,Mobile`,
      { headers: { Authorization: `Zoho-oauthtoken ${token}` } },
    )
    if (!res.ok || res.status === 204) return null
    const body = (await res.json().catch(() => null)) as any
    const row = body?.data?.[0]
    if (!row) return null
    const name =
      String(row.Full_Name ?? '').trim() ||
      [row.First_Name, row.Last_Name].filter(Boolean).join(' ').trim()
    return {
      name,
      email: String(row.Email ?? '').trim(),
      phone: String(row.Phone ?? row.Mobile ?? '').trim(),
    }
  } catch (err) {
    console.error('[booking-zoho] prefill read threw', err)
    return null
  }
}

// ─── Leads, for the stranger case ────────────────────────────────────────────

export async function createBookingLead(input: {
  name: string
  email: string
  phone: string
  summary: string
}): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  if (isDemoMode()) return { ok: false, error: 'demo mode' }
  let token: string
  try {
    token = await getZohoToken()
  } catch {
    return { ok: false, error: 'token' }
  }
  // Zoho Leads require a last name. A single-word name becomes the last name so
  // the record is never rejected for a missing field.
  const parts = input.name.trim().split(/\s+/)
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || 'Unknown'
  const firstName = parts.length > 1 ? parts[0] : undefined
  try {
    const res = await fetch(`${ZOHO_API}/Leads`, {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: [
          {
            Last_Name: lastName,
            ...(firstName ? { First_Name: firstName } : {}),
            Email: input.email,
            ...(input.phone ? { Phone: input.phone } : {}),
            Lead_Source: 'Website',
            Description: input.summary.slice(0, 32000),
          },
        ],
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[booking-zoho] lead HTTP ${res.status}`, text.slice(0, 200))
      return { ok: false, error: `HTTP ${res.status}` }
    }
    const body = (await res.json().catch(() => null)) as any
    const row = body?.data?.[0]
    if (row?.status !== 'success') return { ok: false, error: String(row?.code ?? 'row failed') }
    return { ok: true, id: row?.details?.id ?? null }
  } catch (err) {
    console.error('[booking-zoho] lead threw', err)
    return { ok: false, error: 'unreachable' }
  }
}

// ─── The orchestration ───────────────────────────────────────────────────────

export interface BookingZohoInput {
  kind: 'booked' | 'rescheduled' | 'cancelled'
  zohoContactId: string | null
  dealId: string | null
  clientName: string
  clientEmail: string
  clientPhoneDisplay: string
  eventName: string
  whenText: string
  notes: string | null
  smsConsent: boolean
  consentedAt: string | null
  /** The exact wording the person agreed to, stored as the consent record. */
  consentLanguage: string
}

export interface BookingZohoOutcome {
  detail: string
  contactNoteId: string | null
  dealNoteId: string | null
  leadId: string | null
  consentStamped: boolean
}

/** Note bodies read like a person wrote them, because Michael reads them. */
function noteContent(input: BookingZohoInput): string {
  const verb =
    input.kind === 'cancelled' ? 'cancelled' : input.kind === 'rescheduled' ? 'moved to' : 'booked for'
  const lines = [
    `${input.eventName} ${verb} ${input.whenText}.`,
    `Phone: ${input.clientPhoneDisplay}`,
    `Email: ${input.clientEmail}`,
  ]
  if (input.notes) lines.push('', 'What they wrote:', input.notes)
  if (input.smsConsent && input.consentedAt) {
    lines.push('', `Express consent to contact given at booking on ${input.consentedAt}.`)
  }
  lines.push('', 'Booked through the Fox Mortgage booking page.')
  return lines.join('\n')
}

export async function linkBookingToZoho(input: BookingZohoInput): Promise<BookingZohoOutcome> {
  const out: BookingZohoOutcome = {
    detail: '',
    contactNoteId: null,
    dealNoteId: null,
    leadId: null,
    consentStamped: false,
  }
  const parts: string[] = []

  if (isDemoMode()) {
    return { ...out, detail: 'demo mode, nothing written' }
  }

  const title = `${ZOHO_BOOKING_NOTE_PREFIX}${input.eventName}`

  if (input.zohoContactId) {
    const note = await createZohoNote({
      module: 'Contacts',
      recordId: input.zohoContactId,
      title,
      content: noteContent(input),
    })
    if (note.ok) {
      out.contactNoteId = note.id
      parts.push('contact note ok')
    } else {
      parts.push(`contact note failed (${note.error})`)
    }

    // Consent, only ever on a tick.
    if (input.smsConsent) {
      const stamp = await stampCaslConsent({
        contactId: input.zohoContactId,
        consentedAtIso: input.consentedAt ?? new Date().toISOString(),
        consentLanguage: input.consentLanguage,
      })
      out.consentStamped = stamp.ok
      parts.push(stamp.ok ? 'consent stamped' : `consent failed (${stamp.error})`)
    } else {
      parts.push('no consent given, nothing written')
    }
  }

  if (input.dealId) {
    const note = await createZohoNote({
      module: 'Potentials',
      recordId: input.dealId,
      title,
      content: noteContent(input),
    })
    if (note.ok) {
      out.dealNoteId = note.id
      parts.push('deal note ok')
    } else {
      parts.push(`deal note failed (${note.error})`)
    }
  }

  // A stranger. Only on the first booking, never on a cancel, and never when we
  // already know who they are.
  if (!input.zohoContactId && !input.dealId && input.kind === 'booked') {
    const lead = await createBookingLead({
      name: input.clientName,
      email: input.clientEmail,
      phone: input.clientPhoneDisplay,
      summary: noteContent(input),
    })
    if (lead.ok) {
      out.leadId = lead.id
      parts.push('lead created')
    } else {
      parts.push(`lead failed (${lead.error})`)
    }
  }

  out.detail = parts.join('; ') || 'nothing to link'
  return out
}
