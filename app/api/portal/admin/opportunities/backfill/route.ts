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
  decideMatch,
  proposeBackfill,
  WRITABLE_SCALAR_BACKFILL_FIELDS,
  type ZohoContactLite,
} from '@/lib/smm-match'
import { getZohoDealsByContactId, searchZohoContacts } from '@/lib/zoho-admin'

export const dynamic = 'force-dynamic'

function exportFieldsOf(row: SmmParsedRow) {
  return { maturityDate: row.maturityDate, lenderName: row.lenderRaw || null, rate: row.rate }
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
      // Match, short-circuited by confidence.
      const emailHits: ZohoContactLite[] = p.email ? await searchZohoContacts(p.email, 'email') : []
      let phoneHits: ZohoContactLite[] = []
      let nameHits: ZohoContactLite[] = []
      if (emailHits.length !== 1) {
        phoneHits = p.phone ? await searchZohoContacts(p.phone, 'phone') : []
        if (phoneHits.length !== 1) {
          nameHits = name ? await searchZohoContacts(name, 'word') : []
        }
      }
      const match = decideMatch({ email: emailHits, phone: phoneHits, name: nameHits })
      const exp = exportFieldsOf(p)

      if (match.bucket !== 'matched' || !match.contactId) {
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
      const dealViews = deals.map(d => {
        const zoho = {
          Maturity_Date: typeof d.fields.Maturity_Date === 'string' ? d.fields.Maturity_Date : null,
          Lender_Name: null, // lookup — never proposed from a string
          Mortgage_Rate: d.fields.Mortgage_Rate != null ? Number(d.fields.Mortgage_Rate) : null,
        }
        const proposal = proposeBackfill(zoho, exp, writable)
        return {
          dealId: d.id,
          dealName: typeof d.fields.Deal_Name === 'string' ? d.fields.Deal_Name : d.id,
          stage: typeof d.fields.Stage === 'string' ? d.fields.Stage : null,
          current: { Maturity_Date: zoho.Maturity_Date, Mortgage_Rate: zoho.Mortgage_Rate },
          fills: proposal.fills,
          conflicts: proposal.conflicts,
        }
      })
      results.push({
        householdId: hid,
        name,
        status: 'matched' as const,
        matchedBy: match.matchedBy,
        contact: { id: match.contactId },
        deals: dealViews,
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
