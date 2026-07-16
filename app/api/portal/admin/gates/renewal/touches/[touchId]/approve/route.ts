// Approve a renewal drip touch AND send it (renewal.decide, human-only on the
// workbench). The send is mode-gated workbench-side (ships off): approving
// with sending unconfigured records the approval and surfaces the reason.
import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { approveRenewalTouch, STATUS_BY_KIND } from '@/lib/gates'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { touchId: string } }) {
  const gate = await apiPermission('renewal.decide')
  if (!gate.ok) {
    return NextResponse.json({ ok: false, kind: gate.status === 401 ? 'auth' : 'forbidden', message: gate.message }, { status: gate.status })
  }
  let body: any = null
  try { body = await req.json() } catch { /* note optional */ }
  const note = typeof body?.note === 'string' ? body.note : undefined
  const result = await approveRenewalTouch(params.touchId, req.headers.get('x-gates-token'), note)
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
