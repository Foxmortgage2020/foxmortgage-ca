// Commitment-conditions LIST gate proxy (Phase B2). approve makes the
// extracted set the room's checklist (and supersedes a prior document's set);
// reject discards it. Keyed on the source document.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import {
  COMMITMENT_LIST_ACTIONS,
  decideCommitmentList,
  STATUS_BY_KIND,
  type CommitmentListAction,
} from '@/lib/gates'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { documentId: string } }) {
  const gate = await apiPermission('approvals.conditions.decide')
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
  const action = body?.action as CommitmentListAction
  if (!COMMITMENT_LIST_ACTIONS.includes(action)) {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: 'Action must be approve or reject.' },
      { status: 422 },
    )
  }
  const note = typeof body?.note === 'string' ? body.note : undefined
  const result = await decideCommitmentList(params.documentId, action, req.headers.get('x-gates-token'), note)
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
