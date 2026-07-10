// Credential register routes (Session 6). Reads behind compliance.view;
// writes behind compliance.manage (admin only). Every write carries the
// acting user's email into the store as p_actor, so who-and-when lands on
// the row and in compliance_events. Nothing deletes; retire has its own
// route.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { listCredentials, saveCredential } from '@/lib/compliance'

export const dynamic = 'force-dynamic'

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET() {
  const gate = await apiPermission('compliance.view')
  if (!gate.ok) return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  const res = await listCredentials()
  if (!res.configured) {
    return NextResponse.json({ ok: false, message: 'Compliance store not configured.' }, { status: 503 })
  }
  if (!res.ok) return NextResponse.json({ ok: false, message: res.error }, { status: 502 })
  return NextResponse.json({ ok: true, data: res.data })
}

export async function POST(req: Request) {
  const gate = await apiPermission('compliance.manage')
  if (!gate.ok) return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  const body = (await req.json().catch(() => null)) as {
    id?: string
    name?: string
    holder?: string
    expiresOn?: string | null
    dateConfirmed?: boolean
    notes?: string | null
  } | null
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 200) : ''
  const holder = typeof body?.holder === 'string' ? body.holder.trim().slice(0, 200) : ''
  if (!name || !holder) {
    return NextResponse.json({ ok: false, message: 'Name and holder are required.' }, { status: 422 })
  }
  const id = typeof body?.id === 'string' && UUID_RE.test(body.id) ? body.id : null
  const expiresOn =
    typeof body?.expiresOn === 'string' && YMD_RE.test(body.expiresOn) ? body.expiresOn : null
  const notes = typeof body?.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 2000) : null
  const res = await saveCredential({
    id,
    name,
    holder,
    expiresOn,
    dateConfirmed: body?.dateConfirmed === true && expiresOn !== null,
    notes,
    actor: gate.user.email,
  })
  if (!res.configured) {
    return NextResponse.json({ ok: false, message: 'Compliance store not configured.' }, { status: 503 })
  }
  if (!res.ok) return NextResponse.json({ ok: false, message: res.error }, { status: 502 })
  return NextResponse.json({ ok: true, data: { id: res.data } })
}
