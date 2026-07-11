// Offer gate decision proxy (the offers desk session). Approve or reject a
// pending promotional offer through the audited gate. The portal never writes
// the lender_offers table; this forwards the browser-minted token to the Gates
// API, which owns the decision and the audit entry. Mirrors the rate-sheet
// decision proxy exactly.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { decideOffer, OFFER_ACTIONS, STATUS_BY_KIND, type OfferAction } from '@/lib/gates'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { offerId: string } }) {
  const gate = await apiPermission('approvals.offer.decide')
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, kind: gate.status === 401 ? 'auth' : 'forbidden', message: gate.message },
      { status: gate.status },
    )
  }
  let body: any = null
  try {
    body = await req.json()
  } catch {
    // fall through to the action check
  }
  const action = body?.action as OfferAction
  if (!OFFER_ACTIONS.includes(action)) {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: 'Action must be approve or reject.' },
      { status: 422 },
    )
  }
  const note = typeof body?.note === 'string' ? body.note : undefined
  const result = await decideOffer(params.offerId, action, req.headers.get('x-gates-token'), note)
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
