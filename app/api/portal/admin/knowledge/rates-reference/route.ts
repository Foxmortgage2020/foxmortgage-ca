// Rates-reference proxy (Session 6): prime with as-of and source,
// per-lender overrides, payment-mechanism notes, quote-slug coverage.
// Same posture as every knowledge proxy: browser-minted token forwarded
// via x-gates-token, read-only, nothing cached. Effective rates are
// computed client-side against this payload and always labeled with the
// prime as-of; when this route fails, the UI shows the discount alone
// with the honest prime-unavailable state.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { getRatesReference, STATUS_BY_KIND } from '@/lib/gates'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const gate = await apiPermission('knowledge.view')
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, kind: gate.status === 401 ? 'auth' : 'forbidden', message: gate.message },
      { status: gate.status },
    )
  }
  const result = await getRatesReference(req.headers.get('x-gates-token'))
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
