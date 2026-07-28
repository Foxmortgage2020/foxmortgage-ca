// Weekly hours for one agent. Gated on booking.manage.
//
// ONE WEEKDAY PER CALL. Saving the whole week in one transaction would be
// tidier to type and worse to use: a single bad window would refuse six good
// days along with it. Per-day means the failure is where the mistake is.
//
// An EMPTY windows list is a valid save and means closed. The store deletes the
// row rather than writing an empty one, so a closed day has exactly one
// representation in the database.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { validateWindows } from '@/lib/booking/admin'
import { setHours } from '@/lib/booking/store'
import { bookingAgentId } from '@/lib/booking/admin-agent'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await apiPermission('booking.manage')
  if (!gate.ok) return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })

  const body = (await req.json().catch(() => null)) as { weekday?: unknown; windows?: unknown } | null

  const weekday = Number(body?.weekday)
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return NextResponse.json({ ok: false, message: 'Pick a day of the week.' }, { status: 422 })
  }

  const windows = validateWindows(Array.isArray(body?.windows) ? body?.windows : [])
  if (!windows.ok) {
    return NextResponse.json({ ok: false, message: windows.errors.join(' '), errors: windows.errors }, { status: 422 })
  }

  const agent = await bookingAgentId()
  if (!agent) {
    return NextResponse.json({ ok: false, message: 'No booking host is configured.' }, { status: 503 })
  }

  const res = await setHours(agent, weekday, windows.value)
  if (!res.configured) {
    return NextResponse.json({ ok: false, message: 'Booking store not configured.' }, { status: 503 })
  }
  if (!res.ok) return NextResponse.json({ ok: false, message: res.error }, { status: 502 })
  return NextResponse.json({ ok: true, weekday, windows: windows.value })
}
