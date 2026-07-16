// Exclude a client from the drip: exits the sequence, cancels unsent touches.
import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { excludeRenewalSequence, STATUS_BY_KIND } from '@/lib/gates'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { sequenceId: string } }) {
  const gate = await apiPermission('renewal.decide')
  if (!gate.ok) {
    return NextResponse.json({ ok: false, kind: gate.status === 401 ? 'auth' : 'forbidden', message: gate.message }, { status: gate.status })
  }
  let body: any = null
  try { body = await req.json() } catch { /* required below */ }
  if (typeof body?.reason !== 'string' || body.reason.trim().length < 3) {
    return NextResponse.json({ ok: false, kind: 'validation', message: 'An exclusion reason is required.' }, { status: 422 })
  }
  const result = await excludeRenewalSequence(params.sequenceId, body.reason.trim(), req.headers.get('x-gates-token'))
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
