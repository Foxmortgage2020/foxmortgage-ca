// Recompute document presence on room open (Phase B2). Idempotent and
// read-only to Finmo; every internal role that sees a deal room may trigger
// it (conditions.recompute), because it decides nothing — it only refreshes
// which documents Finmo already holds against each condition.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { recomputePresence, STATUS_BY_KIND } from '@/lib/gates'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { dealId: string } }) {
  const gate = await apiPermission('conditions.recompute')
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, kind: gate.status === 401 ? 'auth' : 'forbidden', message: gate.message },
      { status: gate.status },
    )
  }
  const result = await recomputePresence(params.dealId, req.headers.get('x-gates-token'))
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
