// Read-and-acknowledge (Session 6): records that the signed-in user read
// this policy version, who and when, once per version. Behind
// compliance.view so every role that can read the library can
// acknowledge; the record carries the acting user's email and Clerk id.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { ackPolicy } from '@/lib/compliance'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gate = await apiPermission('compliance.view')
  if (!gate.ok) return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  const body = (await req.json().catch(() => null)) as { version?: number } | null
  const version = Number(body?.version)
  if (!Number.isInteger(version) || version < 1) {
    return NextResponse.json({ ok: false, message: 'A policy version is required.' }, { status: 422 })
  }
  const res = await ackPolicy(params.id, version, gate.user.email, gate.user.userId)
  if (!res.configured) {
    return NextResponse.json({ ok: false, message: 'Compliance store not configured.' }, { status: 503 })
  }
  if (!res.ok) return NextResponse.json({ ok: false, message: res.error }, { status: 502 })
  return NextResponse.json({ ok: true, data: { acknowledged: res.data === true, alreadyAcked: res.data !== true } })
}
