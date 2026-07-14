// Knowledge document gate decision proxy: the batch action over one
// uploaded document's pending claims. Claims with a null as_of are held
// out of a batch approve by the gate and come back as heldForAsOf.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import {
  decideKnowledgeDoc,
  KNOWLEDGE_DOC_ACTIONS,
  STATUS_BY_KIND,
  type KnowledgeDocAction,
} from '@/lib/gates'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { documentId: string } }) {
  const gate = await apiPermission('approvals.knowledge.decide')
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
  const action = body?.action as KnowledgeDocAction
  if (!KNOWLEDGE_DOC_ACTIONS.includes(action)) {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: 'Action must be approve or reject.' },
      { status: 422 },
    )
  }
  const note = typeof body?.note === 'string' ? body.note : undefined
  const result = await decideKnowledgeDoc(params.documentId, { action, note }, req.headers.get('x-gates-token'))
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
