// Edit a condition on the working checklist by hand (2026-07-14). The
// workbench preserves the machine's original in the audit and marks the
// changed fields human-edited so a re-extraction never overwrites them.
// Provenance is untouchable. Same dynamic segment ([id]) as the sibling
// condition routes. POST-only.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { editCondition, MANUAL_OWNER_OPTIONS, STATUS_BY_KIND, type ManualConditionEditBody, type ManualOwner } from '@/lib/gates'

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
    // fall through to validation
  }
  if (body?.owner !== undefined && !MANUAL_OWNER_OPTIONS.includes(body.owner)) {
    return NextResponse.json({ ok: false, kind: 'validation', message: `Owner must be one of ${MANUAL_OWNER_OPTIONS.join(', ')}.` }, { status: 422 })
  }
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
  const payload: ManualConditionEditBody = {}
  if (typeof body?.text === 'string') payload.text = body.text.trim()
  if (body?.owner !== undefined) payload.owner = body.owner as ManualOwner
  if (body?.doc_kind !== undefined) payload.doc_kind = str(body.doc_kind) ?? null
  if (body?.borrower_id !== undefined) payload.borrower_id = str(body.borrower_id)?.trim() || null
  if (body?.due_date !== undefined) payload.due_date = str(body.due_date)?.trim() || null
  if (body?.load_bearing !== undefined) payload.load_bearing = body.load_bearing === true
  if (typeof body?.requirement_amount === 'number' && Number.isFinite(body.requirement_amount) && body.requirement_amount > 0) payload.requirement_amount = body.requirement_amount
  if (typeof body?.note === 'string') payload.note = body.note
  const result = await editCondition(params.id, payload, req.headers.get('x-gates-token'))
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
