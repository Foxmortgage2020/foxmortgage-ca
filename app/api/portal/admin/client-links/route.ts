// Create a client portal link (B5). POST only.
//
// The route handler is the house write path (this repo has no server actions),
// and it follows the established order exactly: gate → demo refusal → validate
// → act → audit. The acting human comes from the verified Clerk session and
// nowhere else — the standing rule that a machine may never write a human's
// identity.
//
// THE RAW TOKEN IS RETURNED EXACTLY ONCE, here, in this response, to the
// authenticated admin who just clicked create. It is never stored, never
// logged, and cannot be re-read: only its sha256 goes to the database. If
// Michael loses it, he issues a new one.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { isDemoMode } from '@/lib/demo'
import { clientLinkExpiry, hashClientToken, mintClientToken } from '@/lib/client-links'
import { createClientLink, recordClientLinkEvent } from '@/lib/client-links-store'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
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

  let body: { zohoDealId?: unknown; fileRef?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, message: 'Malformed request.' }, { status: 400 })
  }
  const zohoDealId = typeof body.zohoDealId === 'string' ? body.zohoDealId.trim() : ''
  const fileRef = typeof body.fileRef === 'string' && body.fileRef.trim() ? body.fileRef.trim() : null
  if (!/^\d{15,19}$/.test(zohoDealId)) {
    return NextResponse.json({ ok: false, message: 'A valid deal is required.' }, { status: 422 })
  }

  const token = mintClientToken()
  const expiresAt = clientLinkExpiry().toISOString()
  const created = await createClientLink({
    zohoDealId,
    fileRef,
    tokenHash: hashClientToken(token),
    createdBy: gate.user.email,
    expiresAt,
  })

  if (!created.configured) {
    return NextResponse.json(
      { ok: false, message: 'The client links store is not configured.' },
      { status: 503 },
    )
  }
  if (!created.ok) {
    // Audit the failure too: a link that failed to mint is still an attempt.
    await recordClientLinkEvent({
      linkId: null,
      zohoDealId,
      fileRef,
      action: 'created',
      actingEmail: gate.user.email,
      result: `failed: ${created.error}`.slice(0, 200),
    })
    return NextResponse.json({ ok: false, message: created.error }, { status: 502 })
  }

  const linkId = typeof created.data === 'string' ? created.data : String(created.data ?? '')
  await recordClientLinkEvent({
    linkId: linkId || null,
    zohoDealId,
    fileRef,
    action: 'created',
    actingEmail: gate.user.email,
  })

  return NextResponse.json({
    ok: true,
    id: linkId,
    // The one and only time this value exists outside the client's own URL.
    token,
    expiresAt,
  })
}
