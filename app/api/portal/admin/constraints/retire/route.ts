// POST /api/portal/admin/constraints/retire — retire a constraint (nothing
// deletes; history is retained). Gated constraints.manage, refused in demo.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { isDemoMode } from '@/lib/demo'
import { retireConstraint } from '@/lib/constraints-store'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await apiPermission('constraints.manage')
  if (!gate.ok) return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  if (isDemoMode()) return NextResponse.json({ ok: false, message: 'Demo mode is read-only.' }, { status: 403 })
  const body = (await req.json().catch(() => ({}))) as { id?: string }
  if (!body.id) return NextResponse.json({ ok: false, message: 'A constraint id is required.' }, { status: 422 })
  const res = await retireConstraint(body.id, gate.user.email)
  if (!res.configured) return NextResponse.json({ ok: false, message: 'The constraints store is not configured.' }, { status: 503 })
  if (!res.ok) return NextResponse.json({ ok: false, message: res.error }, { status: 502 })
  return NextResponse.json({ ok: true })
}
