// Decide on a lender contact: supersede (edit) or retire (remove). Editing is
// supersession on the workbench — the response carries the NEW row id, so the
// card refetches rather than re-pointing. Retire needs a reason (5+ chars) and
// never hard-deletes; the contact drops out of the next read. Gate order:
// gate -> demo refuse -> validate -> act. The gates token is browser-minted.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { isDemoMode } from '@/lib/demo'
import { decideLenderContact, STATUS_BY_KIND } from '@/lib/gates'
import { shapeContactDraft, validateContactDraft } from '@/lib/lender-contacts'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { contactId: string } }) {
  const gate = await apiPermission('knowledge.contact.manage')
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, kind: gate.status === 401 ? 'auth' : 'forbidden', message: gate.message },
      { status: gate.status },
    )
  }
  if (isDemoMode()) {
    return NextResponse.json(
      { ok: false, kind: 'forbidden', message: 'Demo mode is read-only.' },
      { status: 403 },
    )
  }
  let body: unknown = null
  try {
    body = await req.json()
  } catch {
    // fall through to validation
  }
  const action = (body as { action?: unknown })?.action

  if (action === 'retire') {
    const reason =
      typeof (body as { reason?: unknown }).reason === 'string'
        ? (body as { reason: string }).reason.trim()
        : ''
    if (reason.length < 5) {
      return NextResponse.json(
        { ok: false, kind: 'validation', message: 'A reason of at least 5 characters is needed to retire a contact.' },
        { status: 422 },
      )
    }
    const result = await decideLenderContact(
      params.contactId,
      { action: 'retire', reason },
      req.headers.get('x-gates-token'),
    )
    return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
  }

  if (action === 'supersede') {
    const draft = shapeContactDraft(body)
    const invalid = validateContactDraft(draft)
    if (invalid) {
      return NextResponse.json({ ok: false, kind: 'validation', message: invalid }, { status: 422 })
    }
    const result = await decideLenderContact(
      params.contactId,
      { action: 'supersede', ...draft },
      req.headers.get('x-gates-token'),
    )
    return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
  }

  return NextResponse.json(
    { ok: false, kind: 'validation', message: 'Action must be supersede or retire.' },
    { status: 422 },
  )
}
