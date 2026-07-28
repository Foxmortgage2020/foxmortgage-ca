// Cancel an existing booking. PUBLIC, POST-only, authorised by the reschedule
// token alone.
//
// Cancelling frees the slot immediately, because the partial unique index and
// every availability query key on status = 'booked'. The provider event is
// removed too, so nothing is left pointing at a meeting that is not happening.
//
// Cancelling twice is not an error the client should have to understand: the
// second attempt reports that it is already cancelled, which is a true and
// useful sentence rather than a failure.

import { NextRequest, NextResponse } from 'next/server'
import { bookingForToken, cancelBooking } from '@/lib/booking/engine'
import { clientKeyFrom, rateLimit, MANAGE_LIMIT } from '@/lib/booking/rate-limit'
import { refusalCopy } from '@/lib/booking/validate'

export const dynamic = 'force-dynamic'

function statusFor(reason: string): number {
  if (reason === 'not_found') return 404
  if (reason === 'store_unavailable') return 503
  return 409
}

export async function POST(req: NextRequest) {
  const limited = rateLimit(`manage:${clientKeyFrom(req.headers)}`, MANAGE_LIMIT)
  if (!limited.allowed) {
    return NextResponse.json(
      { ok: false, message: refusalCopy('rate_limited') },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } },
    )
  }

  let body: { token?: unknown; reason?: unknown }
  try {
    body = (await req.json()) as { token?: unknown; reason?: unknown }
  } catch {
    return NextResponse.json({ ok: false, message: 'That did not come through.' }, { status: 400 })
  }

  const booking = await bookingForToken(String(body.token ?? ''))
  if (!booking) {
    return NextResponse.json({ ok: false, message: refusalCopy('not_found') }, { status: 404 })
  }

  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : null

  const outcome = await cancelBooking({ booking, reason: reason || null, now: new Date(), by: 'client' })
  if (!outcome.ok) {
    return NextResponse.json(
      { ok: false, reason: outcome.reason, message: refusalCopy(String(outcome.reason)) },
      { status: statusFor(String(outcome.reason)) },
    )
  }

  return NextResponse.json({ ok: true, cancelled: true })
}
