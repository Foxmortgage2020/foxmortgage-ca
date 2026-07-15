// Deal-document URL proxy (analysis session, 2026-07-15): forwards to the gates
// read endpoint that mints a 60-second signed URL for one deal document. A
// condition's analysis citation opens the source it read. Minted per click in
// the browser; nothing is stored; tenancy-scoped in the workbench.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { getDealDocumentUrl, STATUS_BY_KIND } from '@/lib/gates'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: { documentId: string } }) {
  const gate = await apiPermission('document.view')
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, kind: gate.status === 401 ? 'auth' : 'forbidden', message: gate.message },
      { status: gate.status },
    )
  }
  const result = await getDealDocumentUrl(params.documentId, req.headers.get('x-gates-token'))
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
