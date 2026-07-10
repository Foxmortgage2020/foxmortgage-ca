// POST /api/portal/admin/agent/cards/[id]/execute (Agent session): the
// ONLY path from an Ask Fox proposal to a Zoho write. Gated by
// agent.execute (admin). The route loads the STORED card payload and
// executes exactly that; the request body is ignored by design, so what
// Michael saw on the card is what runs. One execution per card: the store
// guard turns a double tap into a 409, and the decision (who, when,
// result) lands on the card row in the conversation log.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { decideCard, getCard } from '@/lib/agent/store'
import {
  createZohoTask,
  isAgentWritableModule,
  updateZohoRecordFields,
} from '@/lib/zoho-admin'

export const dynamic = 'force-dynamic'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const gate = await apiPermission('agent.execute')
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
  const card = cardRes.data
  if (!card) {
    return NextResponse.json({ ok: false, message: 'Card not found.' }, { status: 404 })
  }
  if (card.status !== 'proposed') {
    return NextResponse.json(
      { ok: false, message: `Already ${card.status}.`, status: card.status, result: card.result },
      { status: 409 },
    )
  }

  // Execute the stored payload through the same server code path a manual
  // action would use.
  let result: Record<string, unknown>
  try {
    if (card.kind === 'zoho_update') {
      const p = card.payload as {
        module?: string
        record_id?: string
        fields?: Record<string, unknown>
      }
      if (!p.module || !isAgentWritableModule(p.module) || !p.record_id || !p.fields) {
        return NextResponse.json({ ok: false, message: 'The stored card payload is not executable.' }, { status: 422 })
      }
      await updateZohoRecordFields(p.module, p.record_id, p.fields)
      result = { kind: 'zoho_update', module: p.module, record_id: p.record_id, fields: p.fields }
    } else {
      const p = card.payload as {
        subject?: string
        description?: string | null
        due_date?: string | null
        priority?: string | null
        related_deal_id?: string | null
      }
      if (!p.subject) {
        return NextResponse.json({ ok: false, message: 'The stored card payload is not executable.' }, { status: 422 })
      }
      const taskId = await createZohoTask({
        subject: p.subject,
        description: p.description ?? null,
        dueDate: p.due_date ?? null,
        priority: p.priority ?? null,
        relatedDealId: p.related_deal_id ?? null,
      })
      result = { kind: 'task_create', task_id: taskId, subject: p.subject }
    }
  } catch (err) {
    // The write failed; the card stays proposed so Michael can retry or
    // dismiss with the failure visible.
    const message = err instanceof Error ? err.message : 'Zoho write failed'
    return NextResponse.json(
      { ok: false, message: `The write did not land: ${message}. The card stays pending.` },
      { status: 502 },
    )
  }

  const decided = await decideCard(card.id, 'executed', result, gate.user.email)
  if (!decided.configured || !decided.ok || decided.data !== true) {
    // The write landed but the decision stamp raced another tab; report
    // the truth rather than pretending.
    return NextResponse.json(
      {
        ok: true,
        warning: 'The write landed but the card was decided by another tab at the same time; check the conversation log.',
        result,
      },
      { status: 200 },
    )
  }
  return NextResponse.json({ ok: true, result })
}
