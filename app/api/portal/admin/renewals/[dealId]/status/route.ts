// POST /api/portal/admin/renewals/[dealId]/status — the ONLY path from the
// Renewal Radar to a Zoho write. Gated by renewals.decide (admin). The client
// sends only an enumerated action KEY; the server looks it up in
// RENEWAL_ACTIONS and writes exactly the mapped fields through the single Zoho
// write function (updateZohoRecordFields), the same path Ask Fox's confirm
// cards use. No free text, no client-supplied field names or values. Who and
// when are recorded to the FOXCA renewal_events audit alongside the write.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { isRenewalActionKey, RENEWAL_ACTIONS } from '@/lib/renewals'
import { getRenewalDealById, updateZohoRecordFields } from '@/lib/zoho-admin'
import { recordRenewalEvent } from '@/lib/renewals-store'
import { isDemoMode } from '@/lib/demo'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { dealId: string } }) {
  const gate = await apiPermission('renewals.decide')
  if (!gate.ok) {
    return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  }

  if (isDemoMode()) {
    return NextResponse.json(
      { ok: false, message: 'Demo mode is read-only; renewal status changes are disabled.' },
      { status: 403 },
    )
  }

  let body: { action?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, message: 'Malformed request.' }, { status: 400 })
  }
  const action = typeof body.action === 'string' ? body.action : ''
  if (!isRenewalActionKey(action)) {
    return NextResponse.json({ ok: false, message: 'Unknown renewal action.' }, { status: 422 })
  }
  const def = RENEWAL_ACTIONS[action]

  // Read the current row for the audit (prev status + name). Never fatal.
  let dealName: string | null = null
  let prevStatus: string | null = null
  try {
    const current = await getRenewalDealById(params.dealId)
    if (current) {
      dealName = current.dealName
      prevStatus = current.renewalStatus
    }
  } catch {
    // proceed; the write is the source of truth
  }

  try {
    await updateZohoRecordFields('Potentials', params.dealId, def.fields)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Zoho write failed'
    // Record the failed attempt too (who tried, when, that it did not land).
    await recordRenewalEvent({
      dealId: params.dealId,
      dealName,
      action,
      actingEmail: gate.user.email,
      fields: def.fields,
      prevStatus,
      result: `failed: ${message}`.slice(0, 200),
    }).catch(() => {})
    return NextResponse.json(
      { ok: false, message: `The write did not land: ${message}.` },
      { status: 502 },
    )
  }

  const recorded = await recordRenewalEvent({
    dealId: params.dealId,
    dealName,
    action,
    actingEmail: gate.user.email,
    fields: def.fields,
    prevStatus,
    result: 'ok',
  })

  return NextResponse.json({
    ok: true,
    action,
    fields: def.fields,
    audit: recorded.configured && recorded.ok ? recorded.data : null,
    auditWarning:
      !recorded.configured
        ? 'The Zoho write landed; the audit store is not configured.'
        : !recorded.ok
          ? 'The Zoho write landed; the audit record did not save.'
          : undefined,
  })
}
