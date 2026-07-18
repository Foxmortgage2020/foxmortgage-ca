// The "Check Finmo now" nudge (B6.4, Task 4). Forces a Finmo pull right now
// (bypassing the room-open staleness throttle), syncs the request inventory
// (marking deleted requests withdrawn), recomputes presence, and re-runs both
// analyses. Idempotent and read-only to Finmo, so every internal role that sees a
// deal room may trigger it (conditions.recompute) — it decides nothing.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { checkFinmoNow, STATUS_BY_KIND } from '@/lib/gates'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { dealId: string } }) {
  const gate = await apiPermission('conditions.recompute')
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, kind: gate.status === 401 ? 'auth' : 'forbidden', message: gate.message },
      { status: gate.status },
    )
  }
  const result = await checkFinmoNow(params.dealId, req.headers.get('x-gates-token'))
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
