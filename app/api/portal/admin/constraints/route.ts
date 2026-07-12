// GET  /api/portal/admin/constraints?client=<key>  — list a client's constraints (rates.view)
// POST /api/portal/admin/constraints                — add one (constraints.manage), refused in demo
// Constraints are per-client lender rules keyed to the Zoho contact / household /
// file ref. Every constraint requires a reason (the reason is the point).

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { isDemoMode } from '@/lib/demo'
import { isConstraintType } from '@/lib/constraints'
import { addConstraint, constraintsFor, constraintsStoreConfigured } from '@/lib/constraints-store'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const gate = await apiPermission('rates.view')
  if (!gate.ok) return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  if (!constraintsStoreConfigured()) return NextResponse.json({ ok: true, constraints: [], configured: false })
  const client = new URL(req.url).searchParams.get('client')?.trim()
  if (!client) return NextResponse.json({ ok: false, message: 'A client key is required.' }, { status: 422 })
  const res = await constraintsFor(client)
  if (!res.configured) return NextResponse.json({ ok: true, constraints: [], configured: false })
  if (!res.ok) return NextResponse.json({ ok: false, message: res.error }, { status: 502 })
  return NextResponse.json({ ok: true, constraints: res.data, configured: true })
}

export async function POST(req: Request) {
  const gate = await apiPermission('constraints.manage')
  if (!gate.ok) return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  if (isDemoMode()) return NextResponse.json({ ok: false, message: 'Demo mode is read-only.' }, { status: 403 })

  const body = (await req.json().catch(() => ({}))) as {
    clientKey?: string
    lenderSlug?: string
    lenderLabel?: string | null
    type?: string
    reason?: string
  }
  const clientKey = (body.clientKey ?? '').trim()
  const lenderSlug = (body.lenderSlug ?? '').trim().toLowerCase()
  const reason = (body.reason ?? '').trim()
  if (!clientKey || !lenderSlug || !isConstraintType(body.type)) {
    return NextResponse.json({ ok: false, message: 'A client, a lender, and a valid type are required.' }, { status: 422 })
  }
  if (reason.length < 4) {
    return NextResponse.json({ ok: false, message: 'A reason is required (the reason is the point).' }, { status: 422 })
  }
  const res = await addConstraint({
    clientKey,
    lenderSlug,
    lenderLabel: (body.lenderLabel ?? null) || null,
    type: body.type,
    reason,
    actingEmail: gate.user.email,
  })
  if (!res.configured) return NextResponse.json({ ok: false, message: 'The constraints store is not configured.' }, { status: 503 })
  if (!res.ok) return NextResponse.json({ ok: false, message: res.error }, { status: 502 })
  return NextResponse.json({ ok: true, id: res.data })
}
