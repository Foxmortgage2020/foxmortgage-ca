// Single-lender knowledge proxy. Markdown verbatim, profile JSON exactly
// as stored (null when deliberately withheld). Unknown slugs are 404.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { getKnowledgeLender, STATUS_BY_KIND } from '@/lib/gates'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const gate = await apiPermission('knowledge.view')
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, kind: gate.status === 401 ? 'auth' : 'forbidden', message: gate.message },
      { status: gate.status },
    )
  }
  const result = await getKnowledgeLender(params.slug, req.headers.get('x-gates-token'))
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
