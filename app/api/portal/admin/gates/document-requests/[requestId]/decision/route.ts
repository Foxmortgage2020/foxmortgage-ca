// Michael's human review of a Finmo document request (B6.4, Task 6). Approve, or
// send back with a >=5-char reason. Admin-only (approvals.document_request.decide);
// the workbench gate refuses any non-human actor before any write (guardrail 19).
// It records HIS review in the workbench (document_request_decisions) and never
// touches Finmo — Finmo's own status still changes only inside Finmo.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { decideDocumentRequest, DOCUMENT_REQUEST_ACTIONS, STATUS_BY_KIND, type DocumentRequestAction } from '@/lib/gates'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { requestId: string } }) {
  const gate = await apiPermission('approvals.document_request.decide')
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
    /* body optional; validated below */
  }
  const action = body?.action as DocumentRequestAction | undefined
  if (!action || !DOCUMENT_REQUEST_ACTIONS.includes(action)) {
    return NextResponse.json({ ok: false, kind: 'validation', message: 'Choose approve or send back.' }, { status: 422 })
  }
  const note = typeof body?.note === 'string' ? body.note : undefined
  // A send-back needs a reason (the workbench enforces >=5 chars too; this is the
  // early, friendlier gate so the client never sends an empty reason).
  if (action === 'send_back' && (!note || note.trim().length < 5)) {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: 'A send-back needs a short reason (5+ characters).' },
      { status: 422 },
    )
  }
  const result = await decideDocumentRequest(params.requestId, action, req.headers.get('x-gates-token'), note)
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
