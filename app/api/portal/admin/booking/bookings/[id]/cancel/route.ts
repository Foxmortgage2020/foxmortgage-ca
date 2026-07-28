// Cancel a booking from the desk. Gated on booking.manage.
//
// IT REUSES THE CLIENT'S OWN PATH. `cancelBooking` is the same function the
// link in a client's confirmation email calls, so the client's cancellation
// email, the calendar event removal, the Zoho note, and the audit fields all
// happen exactly as they do when the client cancels. The only difference is
// `by: 'admin'` on the record.
//
// That is the whole design. An admin cancel that took a shortcut would be a
// booking the client never heard was cancelled, sitting in their calendar.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { bookingForAdmin, cancelBooking } from '@/lib/booking/engine'
import { isDemoMode } from '@/lib/demo'

export const dynamic = 'force-dynamic'

function statusFor(reason: string): number {
  if (reason === 'not_found') return 404
  if (reason === 'store_unavailable') return 503
  return 409
}

const REASONS: Record<string, string> = {
  already_cancelled: 'That booking is already cancelled.',
  not_active: 'That booking is not active, so there is nothing to cancel.',
  store_unavailable: 'The booking store did not answer. Nothing was changed.',
  demo_mode: 'Demo mode is read only.',
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gate = await apiPermission('booking.manage')
  if (!gate.ok) return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })

  if (isDemoMode()) {
    return NextResponse.json({ ok: false, message: 'Demo mode is read only.' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as { reason?: unknown } | null
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : ''

  const booking = await bookingForAdmin(params.id ?? '')
  if (!booking) {
    return NextResponse.json({ ok: false, message: 'That booking could not be found.' }, { status: 404 })
  }

  const outcome = await cancelBooking({
    booking,
    reason: reason || null,
    now: new Date(),
    by: 'admin',
  })

  if (!outcome.ok) {
    const key = String(outcome.reason)
    return NextResponse.json(
      { ok: false, reason: key, message: REASONS[key] ?? 'That could not be cancelled.' },
      { status: statusFor(key) },
    )
  }

  return NextResponse.json({ ok: true, cancelled: true, id: booking.id })
}
