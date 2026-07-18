// Approve an outbound client-comms touch AND send it (comms.decide, admin,
// human-only). The send is triple-gated on the workbench (the kill switch, the
// env mode gate, and this human approval) plus suppression and per-client caps,
// so it cannot send while the engine is dark. See docs/gates-api.md.
import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { approveCommsTouch, STATUS_BY_KIND } from '@/lib/gates'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { touchId: string } }) {
  const gate = await apiPermission('comms.decide')
  if (!gate.ok) {
    return NextResponse.json({ ok: false, kind: gate.status === 401 ? 'auth' : 'forbidden', message: gate.message }, { status: gate.status })
  }
  let body: any = null
  try { body = await req.json() } catch { /* note is optional */ }
  const note = typeof body?.note === 'string' ? body.note : undefined
  const result = await approveCommsTouch(params.touchId, req.headers.get('x-gates-token'), note)
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
