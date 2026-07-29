// Call-identity parse proxy (CC-03). Forwards the browser-minted gates token
// to fox-underwriting's parse endpoint, which returns a reviewable draft and
// WRITES NOTHING. Safe to call repeatedly while the description is being got
// right. The portal never touches Zoho or the number directory itself.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { parseCallIdentity, STATUS_BY_KIND } from '@/lib/gates'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { callId: string } }) {
  const gate = await apiPermission('calls.resolve')
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, kind: gate.status === 401 ? 'auth' : 'forbidden', message: gate.message },
      { status: gate.status },
    )
  }
  let body: any = null
  try {
    body = await req.json()
  } catch {
    // fall through to the text check
  }
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (!text) {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: 'Describe who the call was with first.' },
      { status: 422 },
    )
  }
  const result = await parseCallIdentity(params.callId, text.slice(0, 4000), req.headers.get('x-gates-token'))
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
