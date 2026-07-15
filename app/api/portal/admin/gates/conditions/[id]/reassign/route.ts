// Re-assign a condition's owner in one control (2026-07-14). The
// Broker/Underwriting boundary is a judgment call; Michael's is final and a
// re-extraction never overwrites it. POST-only.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { reassignConditionOwner, MANUAL_OWNER_OPTIONS, STATUS_BY_KIND, type ManualOwner } from '@/lib/gates'

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
  if (!MANUAL_OWNER_OPTIONS.includes(body?.owner)) {
    return NextResponse.json({ ok: false, kind: 'validation', message: `Owner must be one of ${MANUAL_OWNER_OPTIONS.join(', ')}.` }, { status: 422 })
  }
  const note = typeof body?.note === 'string' ? body.note : undefined
  const result = await reassignConditionOwner(params.id, body.owner as ManualOwner, req.headers.get('x-gates-token'), note)
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
