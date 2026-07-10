// Per-record change history (Session 6): the append-only
// compliance_events rows for one credential, complaint, or policy. This
// is how the register shows its full status history.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { listEvents } from '@/lib/compliance'

export const dynamic = 'force-dynamic'

const TYPES = ['credential', 'complaint', 'policy'] as const
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: Request) {
  const gate = await apiPermission('compliance.view')
  if (!gate.ok) return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  const url = new URL(req.url)
  const type = TYPES.find(t => t === url.searchParams.get('type'))
  const id = url.searchParams.get('id') ?? ''
  if (!type || !UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, message: 'A record type and id are required.' }, { status: 422 })
  }
  const res = await listEvents(type, id)
  if (!res.configured) {
    return NextResponse.json({ ok: false, message: 'Compliance store not configured.' }, { status: 503 })
  }
  if (!res.ok) return NextResponse.json({ ok: false, message: res.error }, { status: 502 })
  return NextResponse.json({ ok: true, data: res.data })
}
