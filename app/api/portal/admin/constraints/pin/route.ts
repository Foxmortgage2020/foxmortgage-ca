// POST /api/portal/admin/constraints/pin — record a restricted-product pin
// confirmation: Michael confirms the client meets the named requirement. The
// confirmation travels with the file; an unconfirmed restricted product cannot
// reach a client PDF. Gated constraints.manage, refused in demo.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { isDemoMode } from '@/lib/demo'
import { addPinConfirmation } from '@/lib/constraints-store'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await apiPermission('constraints.manage')
  if (!gate.ok) return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  if (isDemoMode()) return NextResponse.json({ ok: false, message: 'Demo mode is read-only.' }, { status: 403 })
  const body = (await req.json().catch(() => ({}))) as {
    clientKey?: string
    quoteId?: string
    lenderSlug?: string | null
    requirement?: string
    requirementText?: string | null
  }
  const clientKey = (body.clientKey ?? '').trim()
  const quoteId = (body.quoteId ?? '').trim()
  const requirement = (body.requirement ?? '').trim()
  if (!clientKey || !quoteId || !requirement) {
    return NextResponse.json({ ok: false, message: 'A client, a product, and the confirmed requirement are required.' }, { status: 422 })
  }
  const res = await addPinConfirmation({
    clientKey,
    quoteId,
    lenderSlug: (body.lenderSlug ?? null) || null,
    requirement,
    requirementText: (body.requirementText ?? null) || null,
    actingEmail: gate.user.email,
  })
  if (!res.configured) return NextResponse.json({ ok: false, message: 'The constraints store is not configured.' }, { status: 503 })
  if (!res.ok) return NextResponse.json({ ok: false, message: res.error }, { status: 502 })
  return NextResponse.json({ ok: true, id: res.data })
}
