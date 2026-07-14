// Knowledge claim gate decision proxy. Per-claim approve/reject, with the
// optional edits (edited_text / edited_value) and the as_of_date a dateless
// claim needs to approve. The gate validates; this route only shapes.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import {
  decideKnowledgeClaim,
  KNOWLEDGE_CLAIM_ACTIONS,
  STATUS_BY_KIND,
  type KnowledgeClaimAction,
} from '@/lib/gates'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { claimId: string } }) {
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
  const action = body?.action as KnowledgeClaimAction
  if (!KNOWLEDGE_CLAIM_ACTIONS.includes(action)) {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: 'Action must be approve or reject.' },
      { status: 422 },
    )
  }
  const result = await decideKnowledgeClaim(
    params.claimId,
    {
      action,
      note: typeof body?.note === 'string' ? body.note : undefined,
      edited_text: typeof body?.edited_text === 'string' ? body.edited_text : undefined,
      as_of_date: typeof body?.as_of_date === 'string' ? body.as_of_date : undefined,
      ...(body && 'edited_value' in body ? { edited_value: body.edited_value } : {}),
    },
    req.headers.get('x-gates-token'),
  )
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
