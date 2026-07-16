// The per-touch-tier auto-send toggle (exists, ships OFF; gated + audited to
// change — and the workbench send path stays mode-gated regardless).
import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { setRenewalAutosend, STATUS_BY_KIND } from '@/lib/gates'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await apiPermission('renewal.decide')
  if (!gate.ok) {
    return NextResponse.json({ ok: false, kind: gate.status === 401 ? 'auth' : 'forbidden', message: gate.message }, { status: gate.status })
  }
  let body: any = null
  try { body = await req.json() } catch { /* required below */ }
  if (typeof body?.tier !== 'string' || typeof body?.enabled !== 'boolean') {
    return NextResponse.json({ ok: false, kind: 'validation', message: 'tier and enabled are required.' }, { status: 422 })
  }
  const result = await setRenewalAutosend(body.tier, body.enabled, req.headers.get('x-gates-token'))
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
