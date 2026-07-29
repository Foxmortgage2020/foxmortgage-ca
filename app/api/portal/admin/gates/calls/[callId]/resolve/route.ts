// Call-identity resolve proxy (CC-03). The write: forwards the confirmed
// identity — the fields as REVIEWED in the browser, never the raw parse — to
// fox-underwriting's resolve endpoint, which creates or matches the Zoho
// person, teaches the number directory, and stamps the transcript row.
//
// The shape is validated here too, so a malformed confirm is refused before it
// costs a Gates round trip. The Gates API validates it again and owns the
// audit entry; this is a convenience check, never the authority.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { resolveCallIdentity, STATUS_BY_KIND, type ConfirmedCallIdentity } from '@/lib/gates'

export const dynamic = 'force-dynamic'

function invalid(message: string) {
  return NextResponse.json({ ok: false, kind: 'validation', message }, { status: 422 })
}

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
    return invalid('The confirmation could not be read.')
  }
  const identity = body?.identity
  if (identity?.kind !== 'contact' && identity?.kind !== 'partner') {
    return invalid('Choose whether this is a client or a partner.')
  }
  if (identity.mode === 'existing') {
    if (typeof identity.zohoId !== 'string' || !identity.zohoId.trim()) {
      return invalid('Pick the existing record to use.')
    }
  } else if (identity.mode === 'create') {
    if (typeof identity.name !== 'string' || !identity.name.trim()) {
      return invalid('A new record needs a name.')
    }
  } else {
    return invalid('Confirm either an existing record or a new one.')
  }

  const zohoRecordId = typeof body?.zohoRecordId === 'string' ? body.zohoRecordId : null
  const result = await resolveCallIdentity(
    params.callId,
    identity as ConfirmedCallIdentity,
    zohoRecordId,
    req.headers.get('x-gates-token'),
  )
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
