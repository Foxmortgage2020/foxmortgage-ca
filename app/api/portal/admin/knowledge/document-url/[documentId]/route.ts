// Knowledge document URL proxy: forwards to the gates read endpoint that
// mints a 60-second signed URL for one knowledge source document. Minted
// per click in the browser; nothing is stored.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { getKnowledgeDocumentUrl, STATUS_BY_KIND } from '@/lib/gates'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: { documentId: string } }) {
  const gate = await apiPermission('knowledge.view')
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, kind: gate.status === 401 ? 'auth' : 'forbidden', message: gate.message },
      { status: gate.status },
    )
  }
  const result = await getKnowledgeDocumentUrl(params.documentId, req.headers.get('x-gates-token'))
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
