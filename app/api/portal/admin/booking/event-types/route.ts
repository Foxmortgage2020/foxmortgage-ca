// Meeting type settings. Gated on booking.manage.
//
// EDIT ONLY, deliberately. Creating a meeting type mints a public URL and a new
// thing clients can book, which is a decision worth making on purpose rather
// than through a form nobody has needed yet. The four seeded types cover the
// practice; creation waits for a real second agent.
//
// The slug is NOT editable. It is the public URL, so changing it would silently
// break every link already sent.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { validateEventTypeDraft } from '@/lib/booking/admin'
import { updateEventType } from '@/lib/booking/store'
import { bookingAgentId } from '@/lib/booking/admin-agent'

export const dynamic = 'force-dynamic'

export async function PATCH(req: Request) {
  const gate = await apiPermission('booking.manage')
  if (!gate.ok) return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })

  const body = await req.json().catch(() => null)
  const draft = validateEventTypeDraft(body)
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

  const res = await updateEventType(agent, draft.value)
  if (!res.configured) {
    return NextResponse.json({ ok: false, message: 'Booking store not configured.' }, { status: 503 })
  }
  if (!res.ok) return NextResponse.json({ ok: false, message: res.error }, { status: 502 })
  return NextResponse.json({ ok: true, eventType: draft.value })
}
