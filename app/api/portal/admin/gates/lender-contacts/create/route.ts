// Create a lender contact. Gated on knowledge.contact.manage (admin), demo
// refused, then shaped + lightly validated before the browser gates token is
// forwarded to the workbench (which normalizes the phone, checks the email,
// and refuses a duplicate — the authority on all of it). The gate order is the
// house pattern: gate -> demo refuse -> validate -> act.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { isDemoMode } from '@/lib/demo'
import { createLenderContact, STATUS_BY_KIND } from '@/lib/gates'
import { shapeContactDraft, validateContactDraft } from '@/lib/lender-contacts'

export const dynamic = 'force-dynamic'

const SLUG_RE = /^[a-z0-9-]{2,40}$/

export async function POST(req: Request) {
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
  const lenderSlug =
    body && typeof (body as { lender_slug?: unknown }).lender_slug === 'string'
      ? (body as { lender_slug: string }).lender_slug.trim()
      : ''
  if (!SLUG_RE.test(lenderSlug)) {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: 'A lender is required.' },
      { status: 422 },
    )
  }
  const draft = shapeContactDraft(body)
  const invalid = validateContactDraft(draft)
  if (invalid) {
    return NextResponse.json({ ok: false, kind: 'validation', message: invalid }, { status: 422 })
  }
  const result = await createLenderContact(lenderSlug, draft, req.headers.get('x-gates-token'))
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
