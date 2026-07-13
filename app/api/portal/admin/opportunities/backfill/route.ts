// POST /api/portal/admin/opportunities/backfill — SCAN for backfill candidates.
// For a small batch of household ids (the client chunks them to stay inside
// Zoho's rate limit and the function timeout), match each to a Zoho contact
// (email > phone > name, short-circuited) and, for that contact's deals, compute
// what the monitoring export could fill into an EMPTY Zoho field. Reads only —
// nothing is written here; the apply route does the confirmed write. Gated by
// opportunities.view; demo returns empty (searchZohoContacts is demo-blind).

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { rawRowsForUpload, recentUploads, smmStoreConfigured } from '@/lib/smm-store'
import { collapseCoBorrowers, parseSmmRow, type SmmParsedRow } from '@/lib/smm'
import {
  attributeDeals,
  decideMatch,
  identityClaimants,
  proposeBackfill,
  WRITABLE_SCALAR_BACKFILL_FIELDS,
  type DealEvidence,
  type ZohoContactLite,
} from '@/lib/smm-match'
import { getZohoDealsByContactId, searchZohoContacts, type AgentZohoDeal } from '@/lib/zoho-admin'

export const dynamic = 'force-dynamic'

function exportFieldsOf(row: SmmParsedRow) {
  return { maturityDate: row.maturityDate, lenderName: row.lenderRaw || null, rate: row.rate }
}

function evidenceOf(d: AgentZohoDeal): DealEvidence {
  return {
    id: d.id,
    street: typeof d.fields.Street === 'string' ? d.fields.Street : null,
    city: typeof d.fields.City === 'string' ? d.fields.City : null,
    amount: d.fields.Amount != null ? Number(d.fields.Amount) : null,
  }
}

function zohoFieldsOf(d: AgentZohoDeal) {
  return {
    Maturity_Date: typeof d.fields.Maturity_Date === 'string' ? d.fields.Maturity_Date : null,
    Lender_Name: null, // lookup — never proposed from a string
    Mortgage_Rate: d.fields.Mortgage_Rate != null ? Number(d.fields.Mortgage_Rate) : null,
  }
}

export async function POST(req: Request) {
  const gate = await apiPermission('opportunities.view')
  if (!gate.ok) return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  if (!smmStoreConfigured()) return NextResponse.json({ ok: false, message: 'Store not configured.' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as { uploadId?: string; householdIds?: string[] }
  const householdIds = Array.isArray(body.householdIds) ? body.householdIds.slice(0, 12) : []
  if (householdIds.length === 0) {
    return NextResponse.json({ ok: false, message: 'No household ids to scan.' }, { status: 422 })
  }

  // Resolve the upload and its rows.
  let uploadId = body.uploadId ?? null
  if (!uploadId) {
    const uploadsR = await recentUploads(5)
    const uploads = uploadsR.configured && uploadsR.ok ? uploadsR.data : []
    uploadId = (uploads.find(u => !u.superseded) ?? uploads[0])?.id ?? null
  }
  if (!uploadId) return NextResponse.json({ ok: false, message: 'No upload found.' }, { status: 404 })
  const rowsR = await rawRowsForUpload(uploadId)
  if (!rowsR.configured || !rowsR.ok) {
    return NextResponse.json({ ok: false, message: 'Could not read the upload.' }, { status: 502 })
  }
  const { mortgages } = collapseCoBorrowers(rowsR.data.map(parseSmmRow))
  const byId = new Map(mortgages.map(m => [m.primary.householdId, m]))
  const writable = new Set(WRITABLE_SCALAR_BACKFILL_FIELDS)

  const results = []
  for (const hid of householdIds) {
    const m = byId.get(hid)
    if (!m) {
      results.push({ householdId: hid, status: 'not_in_upload' as const })
      continue
    }
    const p = m.primary
    const name = `${p.firstName} ${p.lastName}`.trim()
    try {
      // Match, short-circuited by confidence. The claimant count rides along:
      // an identity signal shared by more than one export mortgage can never
      // yield a unique (contact, mortgage) match on its own.
      const emailHits: ZohoContactLite[] = p.email ? await searchZohoContacts(p.email, 'email') : []
      let phoneHits: ZohoContactLite[] = []
      let nameHits: ZohoContactLite[] = []
      if (emailHits.length !== 1) {
        phoneHits = p.phone ? await searchZohoContacts(p.phone, 'phone') : []
        if (phoneHits.length !== 1) {
          nameHits = name ? await searchZohoContacts(name, 'word') : []
        }
      }
      const claimants = identityClaimants(m, mortgages)
      const match = decideMatch({ email: emailHits, phone: phoneHits, name: nameHits }, claimants.length)
      const exp = exportFieldsOf(p)

      if ((match.bucket !== 'matched' && match.bucket !== 'shared_identity') || !match.contactId) {
        results.push({
          householdId: hid,
          name,
          status: match.bucket, // 'ambiguous' | 'unmatched'
          candidates: match.candidates.map(c => ({ id: c.id, fullName: c.fullName })),
          export: exp,
        })
        continue
      }

      const deals = await getZohoDealsByContactId(match.contactId)
      const dealView = (d: AgentZohoDeal) => {
        const zoho = zohoFieldsOf(d)
        const proposal = proposeBackfill(zoho, exp, writable)
        return {
          dealId: d.id,
          dealName: typeof d.fields.Deal_Name === 'string' ? d.fields.Deal_Name : d.id,
          stage: typeof d.fields.Stage === 'string' ? d.fields.Stage : null,
          current: { Maturity_Date: zoho.Maturity_Date, Mortgage_Rate: zoho.Mortgage_Rate },
          fills: proposal.fills,
          conflicts: proposal.conflicts,
        }
      }

      if (match.bucket === 'shared_identity') {
        // The contact is claimed by several export mortgages. Attribute its
        // deals by property address then amount; propose ONLY into deals this
        // mortgage uniquely claims. A contested deal (claimed by several or by
        // none) is never proposed into — it goes to the manual-match card.
        const attribution = attributeDeals(claimants, deals.map(evidenceOf))
        const mine = deals.filter(d => attribution.get(d.id) === p.householdId)
        const contested = deals.filter(d => attribution.get(d.id) === null)

        if (mine.length === 0) {
          results.push({
            householdId: hid,
            name,
            status: 'needs_manual_match' as const,
            matchedBy: match.matchedBy,
            contact: { id: match.contactId },
            claimants: claimants.map(c => ({
              householdId: c.primary.householdId,
              name: `${c.primary.firstName} ${c.primary.lastName}`.trim(),
              address: c.primary.address || null,
              amount: c.primary.amount,
              maturityDate: c.primary.maturityDate,
              rate: c.primary.rate,
            })),
            candidateDeals: contested.map(d => {
              const ev = evidenceOf(d)
              const zoho = zohoFieldsOf(d)
              return {
                dealId: d.id,
                dealName: typeof d.fields.Deal_Name === 'string' ? d.fields.Deal_Name : d.id,
                stage: typeof d.fields.Stage === 'string' ? d.fields.Stage : null,
                street: ev.street,
                city: ev.city,
                amount: ev.amount,
                current: { Maturity_Date: zoho.Maturity_Date, Mortgage_Rate: zoho.Mortgage_Rate },
              }
            }),
            export: exp,
          })
          continue
        }

        results.push({
          householdId: hid,
          name,
          status: 'matched' as const,
          matchedBy: match.matchedBy,
          sharedIdentity: true,
          withheldContested: contested.length,
          contact: { id: match.contactId },
          deals: mine.map(dealView),
          export: exp,
        })
        continue
      }

      results.push({
        householdId: hid,
        name,
        status: 'matched' as const,
        matchedBy: match.matchedBy,
        contact: { id: match.contactId },
        deals: deals.map(dealView),
        export: exp,
      })
    } catch (err) {
      results.push({
        householdId: hid,
        name,
        status: 'error' as const,
        message: err instanceof Error ? err.message : 'lookup failed',
      })
    }
  }

  return NextResponse.json({ ok: true, uploadId, results })
}
