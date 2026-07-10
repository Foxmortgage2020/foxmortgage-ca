// POST /api/portal/admin/agent/cards/[id]/dismiss (Agent session): mark a
// proposed card dismissed. Nothing executes; the card and its payload
// stay in the conversation log with who and when.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { decideCard, getCard } from '@/lib/agent/store'

export const dynamic = 'force-dynamic'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const gate = await apiPermission('agent.use')
  if (!gate.ok) {
    return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  }
  const cardRes = await getCard(params.id)
  if (!cardRes.configured) {
    return NextResponse.json({ ok: false, message: 'Conversation store not configured.' }, { status: 503 })
  }
  if (!cardRes.ok) {
    return NextResponse.json({ ok: false, message: cardRes.error }, { status: 502 })
  }
  if (!cardRes.data) {
    return NextResponse.json({ ok: false, message: 'Card not found.' }, { status: 404 })
  }
  if (cardRes.data.status !== 'proposed') {
    return NextResponse.json(
      { ok: false, message: `Already ${cardRes.data.status}.`, status: cardRes.data.status },
      { status: 409 },
    )
  }
  const decided = await decideCard(params.id, 'dismissed', null, gate.user.email)
  if (!decided.configured || !decided.ok) {
    return NextResponse.json({ ok: false, message: 'The store did not record the dismissal.' }, { status: 502 })
  }
  if (decided.data !== true) {
    return NextResponse.json({ ok: false, message: 'Already decided.' }, { status: 409 })
  }
  return NextResponse.json({ ok: true })
}
