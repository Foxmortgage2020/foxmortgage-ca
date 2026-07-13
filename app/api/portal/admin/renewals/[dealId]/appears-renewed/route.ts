// POST /api/portal/admin/renewals/[dealId]/appears-renewed — DECLINE an
// appears-renewed flag: "the feed contradiction is not a renewal." Writes
// NOTHING to Zoho; it records a persisted, reasoned dismissal to the FOXCA
// renewal events store, and the radar excludes the deal from detection on
// every later render. The CONFIRM side goes through the existing status
// route (action renewed_with_us), never here. POST-only; gated by
// renewals.decide; refused in demo.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { recordRenewalEvent } from '@/lib/renewals-store'
import { isDemoMode } from '@/lib/demo'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { dealId: string } }) {
  const gate = await apiPermission('renewals.decide')
  if (!gate.ok) {
    return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  }
  if (isDemoMode()) {
    return NextResponse.json({ ok: false, message: 'Demo mode is read-only.' }, { status: 403 })
  }

  let body: { decision?: unknown; reason?: unknown; evidenceKey?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, message: 'Malformed request.' }, { status: 400 })
  }
  if (body.decision !== 'decline') {
    return NextResponse.json({ ok: false, message: 'Only a decline lands here; confirms go through the status route.' }, { status: 422 })
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (reason.length < 5) {
    return NextResponse.json({ ok: false, message: 'A reason (5+ characters) is required to clear the flag.' }, { status: 422 })
  }
  // The decline is scoped to the evidence it dismisses: if the feed later
  // changes (a real renewal after a dismissed false positive), the key no
  // longer matches and the flag returns.
  const evidenceKey = typeof body.evidenceKey === 'string' ? body.evidenceKey : ''
  if (!evidenceKey) {
    return NextResponse.json({ ok: false, message: 'The evidence key is required so the decline clears only this evidence.' }, { status: 422 })
  }

  const recorded = await recordRenewalEvent({
    dealId: params.dealId,
    dealName: null,
    action: 'appears_renewed_declined',
    actingEmail: gate.user.email,
    fields: { reason, evidenceKey },
    prevStatus: null,
    result: 'ok',
  })
  if (!recorded.configured) {
    return NextResponse.json({ ok: false, message: 'The events store is not configured; the flag cannot be cleared durably.' }, { status: 503 })
  }
  if (!recorded.ok) {
    return NextResponse.json({ ok: false, message: 'The dismissal did not record; the flag stays.' }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
