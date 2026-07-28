// Date overrides: a closed day, or a day with different hours from the usual
// week. Gated on booking.manage.
//
// POST writes one date (upsert, so saving the same date twice is an edit not a
// duplicate). DELETE removes it, which returns the date to the recurring weekly
// hours rather than closing it.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { YMD_RE, validateOverrideDraft } from '@/lib/booking/admin'
import { deleteOverride, setOverride } from '@/lib/booking/store'
import { bookingAgentId } from '@/lib/booking/admin-agent'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await apiPermission('booking.manage')
  if (!gate.ok) return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })

  const body = await req.json().catch(() => null)
  const draft = validateOverrideDraft(body)
  if (!draft.ok) {
    return NextResponse.json(
      { ok: false, message: draft.errors.join(' '), errors: draft.errors },
      { status: 422 },
    )
  }

  const agent = await bookingAgentId()
  if (!agent) {
    return NextResponse.json({ ok: false, message: 'No booking host is configured.' }, { status: 503 })
  }

  const res = await setOverride(agent, draft.value)
  if (!res.configured) {
    return NextResponse.json({ ok: false, message: 'Booking store not configured.' }, { status: 503 })
  }
  if (!res.ok) return NextResponse.json({ ok: false, message: res.error }, { status: 502 })
  return NextResponse.json({ ok: true, override: draft.value })
}

export async function DELETE(req: Request) {
  const gate = await apiPermission('booking.manage')
  if (!gate.ok) return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })

  const date = new URL(req.url).searchParams.get('date') ?? ''
  if (!YMD_RE.test(date)) {
    return NextResponse.json({ ok: false, message: 'A date is required.' }, { status: 422 })
  }

  const agent = await bookingAgentId()
  if (!agent) {
    return NextResponse.json({ ok: false, message: 'No booking host is configured.' }, { status: 503 })
  }

  const res = await deleteOverride(agent, date)
  if (!res.configured) {
    return NextResponse.json({ ok: false, message: 'Booking store not configured.' }, { status: 503 })
  }
  if (!res.ok) return NextResponse.json({ ok: false, message: res.error }, { status: 502 })
  return NextResponse.json({ ok: true, date })
}
