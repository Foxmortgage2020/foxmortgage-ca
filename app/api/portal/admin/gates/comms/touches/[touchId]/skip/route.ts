// Reject one client-comms touch with a reason (comms.decide, admin). The touch
// is skipped; no message is sent. Used to clear stale history fast.
import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { skipCommsTouch, STATUS_BY_KIND } from '@/lib/gates'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { touchId: string } }) {
  const gate = await apiPermission('comms.decide')
  if (!gate.ok) {
    return NextResponse.json({ ok: false, kind: gate.status === 401 ? 'auth' : 'forbidden', message: gate.message }, { status: gate.status })
  }
  let body: any = null
  try { body = await req.json() } catch { /* required below */ }
  if (typeof body?.reason !== 'string' || body.reason.trim().length < 3) {
    return NextResponse.json({ ok: false, kind: 'validation', message: 'A reason is required to reject a message.' }, { status: 422 })
  }
  const result = await skipCommsTouch(params.touchId, body.reason.trim().slice(0, 300), req.headers.get('x-gates-token'))
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
