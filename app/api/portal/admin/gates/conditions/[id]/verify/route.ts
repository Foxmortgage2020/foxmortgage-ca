// Human-only presence -> verified (Phase B2). The machine collects up to
// 'obtained'; a person's tap records 'verified' WITH the actor. Same dynamic
// segment ([id]) as the decision and approve routes.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { verifyCondition, STATUS_BY_KIND } from '@/lib/gates'

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
    // note is optional — fall through
  }
  const note = typeof body?.note === 'string' ? body.note : undefined
  const result = await verifyCondition(params.id, req.headers.get('x-gates-token'), note)
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
