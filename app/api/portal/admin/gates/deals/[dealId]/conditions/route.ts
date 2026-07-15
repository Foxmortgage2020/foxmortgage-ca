// Add a condition to a deal's working checklist by hand (2026-07-14). The
// workbench creates it as source='manual', gate_status='approved', recorded
// with the acting person. POST-only; a GET can never create a condition.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { addManualCondition, MANUAL_OWNER_OPTIONS, STATUS_BY_KIND, type ManualConditionAddBody, type ManualOwner } from '@/lib/gates'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { dealId: string } }) {
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
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  const owner = body?.owner
  if (text.length < 4) {
    return NextResponse.json({ ok: false, kind: 'validation', message: 'A condition needs at least 4 characters of text.' }, { status: 422 })
  }
  if (!MANUAL_OWNER_OPTIONS.includes(owner)) {
    return NextResponse.json({ ok: false, kind: 'validation', message: `Owner must be one of ${MANUAL_OWNER_OPTIONS.join(', ')}.` }, { status: 422 })
  }
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
  const payload: ManualConditionAddBody = {
    text,
    owner: owner as ManualOwner,
    doc_kind: str(body?.doc_kind) ?? null,
    borrower_id: str(body?.borrower_id) ?? null,
    due_date: str(body?.due_date) ?? null,
    load_bearing: body?.load_bearing === true,
    note: str(body?.note),
  }
  const result = await addManualCondition(params.dealId, payload, req.headers.get('x-gates-token'))
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
