// Client offer authoring (B8b Task 2). POST only, one route with an action.
//
// On 'create' the client sends ONLY the quote id. The route re-fetches the
// approved quote and its lender's knowledge claims through the read-only role,
// builds the frozen snapshot (grade included) SERVER-SIDE, and stores it. So a
// published offer's grade can never be anything but what the rubric produced
// from cited truth at selection time — the client cannot influence a figure or
// a grade.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { isDemoMode } from '@/lib/demo'
import { buildOfferSnapshot } from '@/lib/client-presentation'
import { createOffer, setOfferPublished, deleteOffer } from '@/lib/client-presentation-store'
import { getAgentIdByEmail, getRateQuotesFull, getKnowledgeClaims } from '@/lib/underwriting'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'

export const dynamic = 'force-dynamic'

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

export async function POST(req: Request) {
  const gate = await apiPermission('client.presentation.manage')
  if (!gate.ok) return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  if (isDemoMode())
    return NextResponse.json({ ok: false, message: 'Demo mode is read-only.' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, message: 'Malformed request.' }, { status: 400 })
  }

  const action = str(body.action)
  const zohoDealId = str(body.zohoDealId)
  if (!/^\S+$/.test(zohoDealId)) {
    return NextResponse.json({ ok: false, message: 'A valid deal is required.' }, { status: 422 })
  }
  const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : null

  if (action === 'publish') {
    if (!id) return NextResponse.json({ ok: false, message: 'Which offer?' }, { status: 422 })
    return storeResponse(await setOfferPublished(id, body.published === true))
  }
  if (action === 'delete') {
    if (!id) return NextResponse.json({ ok: false, message: 'Which offer?' }, { status: 422 })
    return storeResponse(await deleteOffer(id))
  }
  if (action !== 'create') {
    return NextResponse.json({ ok: false, message: 'Unknown action.' }, { status: 400 })
  }

  const quoteId = str(body.quoteId)
  if (!quoteId) return NextResponse.json({ ok: false, message: 'Which rate?' }, { status: 422 })

  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  const agentId = agentRes.configured && agentRes.ok ? agentRes.data : null
  if (!agentId) {
    return NextResponse.json({ ok: false, message: 'The rate book is not connected.' }, { status: 503 })
  }
  const quotesRes = await getRateQuotesFull(agentId)
  if (!quotesRes.configured || !quotesRes.ok) {
    return NextResponse.json({ ok: false, message: 'Could not read the rate book.' }, { status: 502 })
  }
  const quote = quotesRes.data.find(q => q.id === quoteId && q.status === 'approved')
  if (!quote) {
    return NextResponse.json({ ok: false, message: 'That rate is no longer in the approved book.' }, { status: 404 })
  }
  const claimsRes = await getKnowledgeClaims(agentId, quote.lenderSlug)
  const claims = claimsRes.configured && claimsRes.ok ? claimsRes.data : []

  const snapshot = buildOfferSnapshot(quote, claims)
  const res = await createOffer({
    zohoDealId,
    fileRef: str(body.fileRef) || null,
    quoteId,
    snapshot,
    createdBy: gate.user.email,
  })
  return storeResponse(res)
}

function storeResponse(res: { configured: boolean; ok?: boolean; data?: unknown; error?: string }) {
  if (!res.configured)
    return NextResponse.json({ ok: false, message: 'The store is not configured.' }, { status: 503 })
  if (!res.ok) return NextResponse.json({ ok: false, message: res.error }, { status: 502 })
  return NextResponse.json({ ok: true, id: res.data ?? null })
}
