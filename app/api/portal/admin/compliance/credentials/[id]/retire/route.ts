// Retire a credential (Session 6). Nothing deletes: retired rows stay
// visible with their history; the store refuses a second retire.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { retireCredential } from '@/lib/compliance'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gate = await apiPermission('compliance.manage')
  if (!gate.ok) return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  const body = (await req.json().catch(() => null)) as { note?: string } | null
  const note = typeof body?.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 2000) : null
  const res = await retireCredential(params.id, note, gate.user.email)
  if (!res.configured) {
    return NextResponse.json({ ok: false, message: 'Compliance store not configured.' }, { status: 503 })
  }
  if (!res.ok) return NextResponse.json({ ok: false, message: res.error }, { status: 502 })
  if (res.data !== true) {
    return NextResponse.json({ ok: false, message: 'Not found or already retired.' }, { status: 409 })
  }
  return NextResponse.json({ ok: true, data: { retired: true } })
}
