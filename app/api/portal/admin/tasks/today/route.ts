// GET /api/portal/admin/tasks/today — the native Today view proxy (A2).
//
// Gated on tasks.view (every internal role) here, and again on tasks.view by
// the workbench. Rides the same browser-minted gates token as every other
// workbench read in this repo: a backend-minted template token carries no azp
// claim and is refused 401 by design, so the token arrives in x-gates-token
// and is forwarded server-to-server.
//
// Nothing on this path writes anything, to the workbench or to Zoho.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { getTasksToday, STATUS_BY_KIND } from '@/lib/gates'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const gate = await apiPermission('tasks.view')
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, kind: gate.status === 401 ? 'auth' : 'forbidden', message: gate.message },
      { status: gate.status },
    )
  }
  const result = await getTasksToday(req.headers.get('x-gates-token'))
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
