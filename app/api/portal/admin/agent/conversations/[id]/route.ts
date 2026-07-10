// GET /api/portal/admin/agent/conversations/[id] (Agent session): one
// conversation with its messages, tool logs, and cards, for resuming a
// thread and for the supervision read.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { getConversation, listCards, listMessages } from '@/lib/agent/store'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const gate = await apiPermission('agent.use')
  if (!gate.ok) {
    return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  }
  const conv = await getConversation(params.id)
  if (!conv.configured) {
    return NextResponse.json({ ok: false, message: 'Conversation store not configured.' }, { status: 503 })
  }
  if (!conv.ok) {
    return NextResponse.json({ ok: false, message: conv.error }, { status: 502 })
  }
  if (!conv.data) {
    return NextResponse.json({ ok: false, message: 'Conversation not found.' }, { status: 404 })
  }
  const [messages, cards] = await Promise.all([listMessages(params.id), listCards(params.id)])
  return NextResponse.json({
    ok: true,
    data: {
      conversation: conv.data,
      messages: messages.configured && messages.ok ? messages.data : [],
      cards: cards.configured && cards.ok ? cards.data : [],
    },
  })
}
