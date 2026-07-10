// Complaint and incident register routes (Session 6). This is the
// register a supervised practice keeps for FSRA: append-leaning, status
// changes recorded with who and when, never a deletion.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { createComplaint, listComplaints } from '@/lib/compliance'

export const dynamic = 'force-dynamic'

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET() {
  const gate = await apiPermission('compliance.view')
  if (!gate.ok) return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  const res = await listComplaints()
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
    receivedOn?: string
    source?: string
    summary?: string
    reference?: string | null
  } | null
  const receivedOn = typeof body?.receivedOn === 'string' && YMD_RE.test(body.receivedOn) ? body.receivedOn : null
  const source = typeof body?.source === 'string' ? body.source.trim().slice(0, 200) : ''
  const summary = typeof body?.summary === 'string' ? body.summary.trim().slice(0, 4000) : ''
  if (!receivedOn || !source || !summary) {
    return NextResponse.json(
      { ok: false, message: 'Received date, source, and summary are required.' },
      { status: 422 },
    )
  }
  const reference =
    typeof body?.reference === 'string' && body.reference.trim() ? body.reference.trim().slice(0, 200) : null
  const res = await createComplaint({ receivedOn, source, summary, reference, actor: gate.user.email })
  if (!res.configured) {
    return NextResponse.json({ ok: false, message: 'Compliance store not configured.' }, { status: 503 })
  }
  if (!res.ok) return NextResponse.json({ ok: false, message: res.error }, { status: 502 })
  return NextResponse.json({ ok: true, data: { id: res.data } })
}
