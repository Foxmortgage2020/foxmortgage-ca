// Pull the Finmo application snapshot for a deal (finmo-substrate session,
// 2026-07-15). POST-only; permission-gated (finmo.snapshot.pull); forwards the
// browser-minted gates token. The workbench fetches, redacts, maps, and stores
// the snapshot (the DATA write audits as system there). Demo-refused.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { isDemoMode } from '@/lib/demo'
import { pullFinmoSnapshot, STATUS_BY_KIND } from '@/lib/gates'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { dealId: string } }) {
  const gate = await apiPermission('finmo.snapshot.pull')
  if (!gate.ok) {
    return NextResponse.json({ ok: false, kind: gate.status === 401 ? 'auth' : 'forbidden', message: gate.message }, { status: gate.status })
  }
  if (isDemoMode()) {
    return NextResponse.json({ ok: false, kind: 'forbidden', message: 'Demo mode is read-only.' }, { status: 403 })
  }
  const result = await pullFinmoSnapshot(params.dealId, req.headers.get('x-gates-token'))
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
