// Lender contacts read proxy. The browser mints the gates token (azp
// requirement) and this route forwards it; lib/gates.ts stays the only Gates
// API caller. One bulk read for the whole book; the card groups by lender
// slug client-side. Demo returns a canned set (the guard lives in
// getLenderContacts, so there are zero real reads in demo).

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { getLenderContacts, STATUS_BY_KIND } from '@/lib/gates'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const gate = await apiPermission('knowledge.view')
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, kind: gate.status === 401 ? 'auth' : 'forbidden', message: gate.message },
      { status: gate.status },
    )
  }
  const result = await getLenderContacts(req.headers.get('x-gates-token'))
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
