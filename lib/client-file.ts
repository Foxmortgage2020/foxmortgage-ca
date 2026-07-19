// The client's view of their own file (B5, 2026-07-17). Server-only.
//
// This is the only module that assembles what a CLIENT sees. It reads the
// same truth the admin surfaces read — the Zoho display stage, normalized,
// through config/lifecycle.ts — and then speaks it in the client's words via
// the clientJourney layer. It never invents a status and never renders a
// judgment.
//
// WHAT IS DELIBERATELY NOT HERE: no qualification, no rate, no lender name,
// no amount, no internal note, no document contents. A client's status page
// answers "where is my file and what happens next", nothing more. Every
// addition to this module should have to argue for itself.

import { getPartner, getZohoToken } from '@/lib/zoho'
import { AGENT_MEMBER, type TeamMember } from '@/lib/client-team'
import { normalizeDisplayStage } from '@/config/pipeline'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { getAgentIdByEmail, getClientDealBrief, getDealDocumentRequests } from '@/lib/underwriting'
import { buildClientChecklist, type ClientDocChecklist } from '@/lib/client-checklist'
import { resolveClosingDate } from '@/lib/closing-date'
import { torontoTodayYMD } from '@/lib/dates'
import {
  letterIsValid,
  type OfferSnapshot,
  type LetterSnapshot,
  type PublishedScenario,
} from '@/lib/client-presentation'
import {
  publishedScenariosForToken,
  publishedOffersForToken,
  currentLetterForToken,
} from '@/lib/client-presentation-store'
import type { QualificationBaseline } from '@/lib/qualification'
import { publishedQualificationForToken } from '@/lib/qualification-store'
import {
  clientJourneyFor,
  journeyForStage,
  stepShapeFor,
  type ClientJourney,
} from '@/config/lifecycle'

const ZOHO_API = 'https://www.zohoapis.com/crm/v2'

// Exactly the fields the client page needs, and no more. Realtor /
// Seller_s_Realtor / Lawyer are real lookups on Potentials and are queried by
// the partner portals today (lib/partner-types.ts dealMatchFields).
// Transaction_Type drives the step shape; Finmo_Goal is documented but no
// portal code reads it, so it is deliberately not requested here — an
// unconfirmed field would 400 the whole read.
const CLIENT_FILE_FIELDS =
  'Deal_Name,Contact_Name,Stage,Closing_Date,Transaction_Type,Realtor,Seller_s_Realtor,Lawyer'

// The current pre-approval letter as the client should see it: the frozen
// snapshot plus whether the rate hold has passed. An expired-but-not-superseded
// letter is still returned so the page can say so; the render decides.
export interface ClientLetterView {
  snapshot: LetterSnapshot
  rateHoldExpiry: string
  valid: boolean
}

export interface ClientFileView {
  fileRef: string | null
  firstName: string | null
  journey: ClientJourney
  closingDate: string | null
  team: TeamMember[]
  // The Finmo document checklist, or null when there are no active requests (or
  // the workbench cannot be read) — the documents card then shows its guidance
  // text, never an error.
  documents: ClientDocChecklist | null
  // The presentation layer (B8b), each rendered ONLY when Michael has published
  // something. Empty is the norm; the sections simply do not appear.
  scenarios: PublishedScenario[]
  offers: OfferSnapshot[]
  letter: ClientLetterView | null
  // The qualification explorer's frozen baseline (B9), published only when
  // Michael has enabled it. null = the "Can I afford it?" section does not appear.
  qualification: QualificationBaseline | null
}

function lookupId(v: unknown): string | null {
  return v && typeof v === 'object' && typeof (v as any).id === 'string' ? (v as any).id : null
}
function lookupName(v: unknown): string | null {
  if (v && typeof v === 'object' && typeof (v as any).name === 'string') return (v as any).name
  return typeof v === 'string' && v.trim() ? v : null
}

/**
 * A true first name from the Contacts module, never a split of a full name.
 * "Full_Name".split(' ')[0] is wrong for multi-word given names and for
 * surname-first orderings, and getting a client's own name wrong on their own
 * page is the cheapest possible way to look careless.
 */
async function firstNameForContact(contactId: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(`${ZOHO_API}/Contacts/${contactId}?fields=First_Name,Last_Name`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const d = (await res.json())?.data?.[0]
    const first = typeof d?.First_Name === 'string' ? d.First_Name.trim() : ''
    return first || null
  } catch {
    return null
  }
}

/** A partner's contact card, or null when the record cannot be read. */
async function teamMemberFor(
  partnerId: string,
  fallbackName: string | null,
  role: 'realtor' | 'lawyer',
  roleLabel: string,
): Promise<TeamMember | null> {
  try {
    const p = await getPartner(partnerId)
    const name = p?.name ?? fallbackName
    if (!name) return null
    return {
      role,
      roleLabel,
      name,
      email: p?.email ?? null,
      phone: p?.mobile ?? p?.phone ?? null,
    }
  } catch {
    // The lookup gave us a name even if the record read failed. A name with
    // no contact actions still tells the client who is on their team.
    return fallbackName ? { role, roleLabel, name: fallbackName, email: null, phone: null } : null
  }
}

// AGENT_MEMBER and TeamMember live in lib/client-team.ts (a leaf) so the
// demo fixtures can hold the agent's card without importing this module and
// creating a cycle through lib/zoho. Re-exported for callers' convenience.
export { AGENT_MEMBER }
export type { TeamMember }

/**
 * Assemble the client's view of one deal. Returns null when the deal cannot
 * be read at all — the caller renders the same not-found page it renders for
 * a bad token, so a dead link and a dead deal look identical from outside.
 */
export async function getClientFileView(
  zohoDealId: string,
  tokenHash: string,
): Promise<ClientFileView | null> {
  const token = await getZohoToken()
  const res = await fetch(`${ZOHO_API}/Potentials/${zohoDealId}?fields=${CLIENT_FILE_FIELDS}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    cache: 'no-store',
  })
  if (res.status === 204 || res.status === 404) return null
  if (!res.ok) {
    console.error(`[client-file] Potentials read HTTP ${res.status}`)
    return null
  }
  const d = (await res.json())?.data?.[0]
  if (!d) return null

  // The same normalization every other read-in point runs: Zoho can return an
  // actual-space stage verbatim, and the client must never see that leak
  // through as a phase we do not recognise.
  const rawStage = typeof d.Stage === 'string' ? d.Stage : null
  const stage = rawStage ? normalizeDisplayStage(rawStage) : null

  const journey = journeyForStage({
    stage,
    shape: stepShapeFor(typeof d.Transaction_Type === 'string' ? d.Transaction_Type : null, null),
    space: 'display',
  })

  if (!journey.mapped && rawStage) {
    // Loud on our side, calm on theirs: the page shows the generic
    // "we're working on your file" state and nothing is wrong for the client.
    console.error(
      `[client-file] stage maps to no phase, client saw the generic state: stage=${JSON.stringify(rawStage)} deal=${zohoDealId}`,
    )
  }

  const contactId = lookupId(d.Contact_Name)
  const firstName = contactId ? await firstNameForContact(contactId, token) : null

  const team: TeamMember[] = [AGENT_MEMBER]
  // A realtor is on a purchase; a lawyer on nearly everything at the end.
  // Absent roles simply do not render — never an empty label.
  const realtorId = lookupId(d.Realtor) ?? lookupId(d.Seller_s_Realtor)
  const realtorName = lookupName(d.Realtor) ?? lookupName(d.Seller_s_Realtor)
  if (realtorId) {
    const m = await teamMemberFor(realtorId, realtorName, 'realtor', 'Your realtor')
    if (m) team.push(m)
  }
  const lawyerId = lookupId(d.Lawyer)
  if (lawyerId) {
    const m = await teamMemberFor(lawyerId, lookupName(d.Lawyer), 'lawyer', 'Your lawyer')
    if (m) team.push(m)
  }

  // The closing date and the document checklist live in the workbench (Finmo
  // truth). This is a bonus, never a blocker: any failure leaves the Zoho
  // closing date (often empty on a refinance) and the guidance-only documents
  // card. The demo client page never reaches this — page.tsx serves the demo
  // fixture before getClientFileView runs — so there are no real reads in demo.
  const zohoClosing = typeof d.Closing_Date === 'string' ? d.Closing_Date : null
  // The one closing-date rule (lib/closing-date.ts): workbench first, Zoho
  // fallback. Same helper the admin list, board, and deal-room header use.
  let closingDate = resolveClosingDate(null, zohoClosing)
  let documents: ClientDocChecklist | null = null
  try {
    const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
    const agentId = agentRes.configured && agentRes.ok ? agentRes.data : null
    if (agentId) {
      const briefRes = await getClientDealBrief(agentId, zohoDealId)
      const brief = briefRes.configured && briefRes.ok ? briefRes.data : null
      if (brief) {
        closingDate = resolveClosingDate(brief.closingDate, zohoClosing)
        const reqRes = await getDealDocumentRequests(agentId, brief.dealId)
        if (reqRes.configured && reqRes.ok) documents = buildClientChecklist(reqRes.data)
      }
    }
  } catch (err) {
    console.error(`[client-file] workbench read failed, showing Zoho closing + guidance docs: ${String(err)}`)
  }

  // The presentation layer (B8b) + the qualification baseline (B9): published
  // scenarios, offers, the current letter, and the affordability baseline, read
  // from FOXCA by the LINK TOKEN HASH (not the deal id, so the public anon key
  // cannot enumerate). Each is a bonus, never a blocker — a failure or an
  // unconfigured store leaves the section absent, never an error.
  const { scenarios, offers, letter, qualification } = await readPresentation(tokenHash)

  return {
    fileRef: fileRefOf(d.Deal_Name),
    firstName,
    journey: clientJourneyFor(journey),
    closingDate,
    team,
    documents,
    scenarios,
    offers,
    letter,
    qualification,
  }
}

async function readPresentation(tokenHash: string): Promise<{
  scenarios: PublishedScenario[]
  offers: OfferSnapshot[]
  letter: ClientLetterView | null
  qualification: QualificationBaseline | null
}> {
  const today = torontoTodayYMD()
  try {
    const [sc, of, lt, qu] = await Promise.all([
      publishedScenariosForToken(tokenHash),
      publishedOffersForToken(tokenHash),
      currentLetterForToken(tokenHash),
      publishedQualificationForToken(tokenHash),
    ])
    const scenarios = sc.configured && sc.ok ? sc.data : []
    const offers = of.configured && of.ok ? of.data : []
    const current = lt.configured && lt.ok ? lt.data : null
    const qualification = qu.configured && qu.ok ? qu.data : null
    const letter: ClientLetterView | null = current
      ? {
          snapshot: current.snapshot,
          rateHoldExpiry: current.rateHoldExpiry,
          valid: letterIsValid(current.snapshot, today),
        }
      : null
    return { scenarios, offers, letter, qualification }
  } catch (err) {
    console.error(`[client-file] presentation read failed, showing status only: ${String(err)}`)
    return { scenarios: [], offers: [], letter: null, qualification: null }
  }
}

/** The file reference out of the deal name, when the name follows the book convention. */
export function fileRefOf(dealName: unknown): string | null {
  if (typeof dealName !== 'string') return null
  const m = /^([A-Z]{2,6}-F?\d{4,})/i.exec(dealName.trim())
  return m ? m[1].toUpperCase() : null
}
