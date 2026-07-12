// POST /api/portal/admin/opportunities/backfill/apply — the ONLY backfill write
// path. The client sends which household, which deal, and which field KEYS
// Michael approved — never values. The server re-reads the authoritative export
// row from the persisted upload AND the live Zoho deal, recomputes the proposal
// (empty-field fills only; conflicts are never written), keeps only the approved
// keys, and writes exactly those through the single Zoho write function. Every
// write records who, which record, and which fields to the FOXCA backfill audit.
// Gated by opportunities.manage; refused in demo.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { isDemoMode } from '@/lib/demo'
import { rawRowsForUpload, recordBackfillEvent, smmStoreConfigured } from '@/lib/smm-store'
import { collapseCoBorrowers, parseSmmRow } from '@/lib/smm'
import { decideMatch, proposeBackfill, WRITABLE_SCALAR_BACKFILL_FIELDS, type ZohoContactLite } from '@/lib/smm-match'
import { getZohoDealById, getZohoDealsByContactId, searchZohoContacts, updateZohoRecordFields } from '@/lib/zoho-admin'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await apiPermission('opportunities.manage')
  if (!gate.ok) return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  if (isDemoMode()) return NextResponse.json({ ok: false, message: 'Demo mode is read-only.' }, { status: 403 })
  if (!smmStoreConfigured()) return NextResponse.json({ ok: false, message: 'Store not configured.' }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as {
    uploadId?: string
    householdId?: string
    dealId?: string
    fields?: string[]
  }
  const { uploadId, householdId, dealId } = body
  const approved = new Set((Array.isArray(body.fields) ? body.fields : []).filter(f => WRITABLE_SCALAR_BACKFILL_FIELDS.includes(f)))
  if (!uploadId || !householdId || !dealId || approved.size === 0) {
    return NextResponse.json({ ok: false, message: 'A household, a deal, and at least one writable field are required.' }, { status: 422 })
  }

  // Authoritative export values from the persisted upload.
  const rowsR = await rawRowsForUpload(uploadId)
  if (!rowsR.configured || !rowsR.ok) return NextResponse.json({ ok: false, message: 'Could not read the upload.' }, { status: 502 })
  const { mortgages } = collapseCoBorrowers(rowsR.data.map(parseSmmRow))
  const mortgage = mortgages.find(m => m.primary.householdId === householdId)
  if (!mortgage) return NextResponse.json({ ok: false, message: 'Household not found in this upload.' }, { status: 404 })
  const p = mortgage.primary
  const exp = { maturityDate: p.maturityDate, lenderName: p.lenderRaw || null, rate: p.rate }

  // Re-establish the household→contact→deal binding SERVER-SIDE: the client's
  // dealId is not trusted on its own. Re-match the household to its Zoho contact
  // (email > phone > name) and confirm the dealId is one of THAT contact's
  // deals, so household A's export values can never be written into an unrelated
  // deal B. This repeats the scan's match; a mismatch refuses the write.
  let contactDealIds: string[] = []
  try {
    const emailHits: ZohoContactLite[] = p.email ? await searchZohoContacts(p.email, 'email') : []
    let phoneHits: ZohoContactLite[] = []
    let nameHits: ZohoContactLite[] = []
    if (emailHits.length !== 1) {
      phoneHits = p.phone ? await searchZohoContacts(p.phone, 'phone') : []
      if (phoneHits.length !== 1) {
        const nm = `${p.firstName} ${p.lastName}`.trim()
        nameHits = nm ? await searchZohoContacts(nm, 'word') : []
      }
    }
    const match = decideMatch({ email: emailHits, phone: phoneHits, name: nameHits })
    if (match.bucket !== 'matched' || !match.contactId) {
      return NextResponse.json(
        { ok: false, message: 'This household no longer resolves to a single Zoho contact. Re-scan before writing.' },
        { status: 409 },
      )
    }
    const deals = await getZohoDealsByContactId(match.contactId)
    contactDealIds = deals.map(d => d.id)
  } catch (err) {
    return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : 'Zoho match failed.' }, { status: 502 })
  }
  if (!contactDealIds.includes(dealId)) {
    return NextResponse.json(
      { ok: false, message: 'That deal does not belong to this household. Re-scan before writing.' },
      { status: 409 },
    )
  }

  // Live Zoho read: only fill fields still empty at write time.
  let deal
  try {
    deal = await getZohoDealById(dealId)
  } catch (err) {
    return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : 'Zoho read failed.' }, { status: 502 })
  }
  if (!deal) return NextResponse.json({ ok: false, message: 'Deal not found.' }, { status: 404 })
  const zoho = {
    Maturity_Date: typeof deal.fields.Maturity_Date === 'string' ? deal.fields.Maturity_Date : null,
    Lender_Name: null,
    Mortgage_Rate: deal.fields.Mortgage_Rate != null ? Number(deal.fields.Mortgage_Rate) : null,
  }

  // Recompute — the server, not the client, decides the values.
  const { fills } = proposeBackfill(zoho, exp, new Set(WRITABLE_SCALAR_BACKFILL_FIELDS))
  const toWrite = fills.filter(f => approved.has(f.field))
  if (toWrite.length === 0) {
    return NextResponse.json(
      { ok: false, message: 'Nothing to write — those fields are already filled or now conflict. Refresh and re-scan.' },
      { status: 409 },
    )
  }

  const payload: Record<string, unknown> = {}
  for (const f of toWrite) payload[f.field] = f.value

  try {
    await updateZohoRecordFields('Potentials', dealId, payload)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Zoho write failed'
    await recordBackfillEvent({
      householdId,
      module: 'Potentials',
      recordId: dealId,
      fields: payload,
      actingEmail: gate.user.email,
      result: `failed: ${message}`.slice(0, 180),
    }).catch(() => {})
    return NextResponse.json({ ok: false, message: `The write did not land: ${message}.` }, { status: 502 })
  }

  const recorded = await recordBackfillEvent({
    householdId,
    module: 'Potentials',
    recordId: dealId,
    fields: payload,
    actingEmail: gate.user.email,
    result: 'ok',
  })

  return NextResponse.json({
    ok: true,
    dealId,
    written: Object.keys(payload),
    audit: recorded.configured && recorded.ok ? recorded.data : null,
    auditWarning: !recorded.configured
      ? 'The Zoho write landed; the audit store is not configured.'
      : !recorded.ok
        ? 'The Zoho write landed; the audit record did not save.'
        : undefined,
  })
}
