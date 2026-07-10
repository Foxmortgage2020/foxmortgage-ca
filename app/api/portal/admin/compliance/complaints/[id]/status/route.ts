// Complaint status transitions (Session 6): open, investigating,
// resolved, reported. Every change appends to the record's status history
// (compliance_events) with who and when; a resolution note updates the
// record's resolution summary.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { setComplaintStatus } from '@/lib/compliance'

export const dynamic = 'force-dynamic'

const STATUSES = ['open', 'investigating', 'resolved', 'reported'] as const

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gate = await apiPermission('compliance.manage')
  if (!gate.ok) return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  const body = (await req.json().catch(() => null)) as { status?: string; note?: string } | null
  const status = STATUSES.find(s => s === body?.status)
  if (!status) {
    return NextResponse.json(
      { ok: false, message: 'Status must be open, investigating, resolved, or reported.' },
      { status: 422 },
    )
  }
  const note = typeof body?.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 4000) : null
  const res = await setComplaintStatus(params.id, status, note, gate.user.email)
  if (!res.configured) {
    return NextResponse.json({ ok: false, message: 'Compliance store not configured.' }, { status: 503 })
  }
  if (!res.ok) return NextResponse.json({ ok: false, message: res.error }, { status: 502 })
  if (res.data !== true) return NextResponse.json({ ok: false, message: 'Not found.' }, { status: 404 })
  return NextResponse.json({ ok: true, data: { status } })
}
