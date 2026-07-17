// Revoke a client portal link (B5). POST only.
//
// Revocation is immediate and total: client_link_resolve filters revoked rows,
// so the next request to that URL renders the same not-found page a garbage
// token renders. Idempotent by design — revoking twice keeps the first
// timestamp, so the record says when the link actually died.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { isDemoMode } from '@/lib/demo'
import { recordClientLinkEvent, revokeClientLink } from '@/lib/client-links-store'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { linkId: string } }) {
  const gate = await apiPermission('client.link.manage')
  if (!gate.ok) {
    return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  }
  if (isDemoMode()) {
    return NextResponse.json(
      { ok: false, message: 'Demo mode is read-only; client links are disabled.' },
      { status: 403 },
    )
  }

  const linkId = params.linkId
  if (!/^[0-9a-f-]{36}$/i.test(linkId)) {
    return NextResponse.json({ ok: false, message: 'Unknown link.' }, { status: 422 })
  }

  let body: { zohoDealId?: unknown; fileRef?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    // The body only carries audit context; revocation does not depend on it.
  }
  const zohoDealId = typeof body.zohoDealId === 'string' ? body.zohoDealId : 'unknown'
  const fileRef = typeof body.fileRef === 'string' ? body.fileRef : null

  const res = await revokeClientLink(linkId, gate.user.email)
  if (!res.configured) {
    return NextResponse.json(
      { ok: false, message: 'The client links store is not configured.' },
      { status: 503 },
    )
  }
  if (!res.ok) {
    await recordClientLinkEvent({
      linkId,
      zohoDealId,
      fileRef,
      action: 'revoked',
      actingEmail: gate.user.email,
      result: `failed: ${res.error}`.slice(0, 200),
    })
    return NextResponse.json({ ok: false, message: res.error }, { status: 502 })
  }

  await recordClientLinkEvent({
    linkId,
    zohoDealId,
    fileRef,
    action: 'revoked',
    actingEmail: gate.user.email,
  })
  return NextResponse.json({ ok: true })
}
