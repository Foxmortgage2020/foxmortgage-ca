// Edit-then-approve ONE drafted commitment condition (Phase B2). Only the
// edited fields ride; the workbench re-validates and leaves provenance
// untouchable. Same dynamic segment ([id]) as the decision route so Next.js
// keeps one slug name for /gates/conditions/[id]/*.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { approveCondition, STATUS_BY_KIND, type ConditionApproveBody } from '@/lib/gates'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { id: string } }) {
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
    // an approve with no edits is valid — fall through with an empty body
  }
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
  const payload: ConditionApproveBody = {
    edited_text: str(body?.edited_text),
    edited_owner: str(body?.edited_owner),
    edited_doc_kind: str(body?.edited_doc_kind),
    edited_borrower_id: str(body?.edited_borrower_id),
    note: str(body?.note),
  }
  const result = await approveCondition(params.id, payload, req.headers.get('x-gates-token'))
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
