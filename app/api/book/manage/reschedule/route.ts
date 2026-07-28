// Move an existing booking. PUBLIC, POST-only, authorised by the reschedule
// token alone — the token IS the auth, the same model the client status page
// uses. It is shape-gated and hash-compared server-side; the raw token never
// reaches the database.
//
// The engine re-runs the full availability check and then moves the row
// atomically under the same unique index a fresh booking writes against, so two
// people racing for one slot cannot both win.

import { NextRequest, NextResponse } from 'next/server'
import { bookingForToken, rescheduleBooking } from '@/lib/booking/engine'
import { clientKeyFrom, rateLimit, MANAGE_LIMIT } from '@/lib/booking/rate-limit'
import { refusalCopy } from '@/lib/booking/validate'

export const dynamic = 'force-dynamic'

const START_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/

function statusFor(reason: string): number {
  if (reason === 'not_found') return 404
  if (reason === 'store_unavailable' || reason === 'calendar_unreadable') return 503
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

  let body: { token?: unknown; start?: unknown }
  try {
    body = (await req.json()) as { token?: unknown; start?: unknown }
  } catch {
    return NextResponse.json({ ok: false, message: 'That did not come through.' }, { status: 400 })
  }

  const start = String(body.start ?? '')
  if (!START_RE.test(start)) {
    return NextResponse.json({ ok: false, message: 'Please pick a time.' }, { status: 400 })
  }

  const booking = await bookingForToken(String(body.token ?? ''))
  if (!booking) {
    return NextResponse.json({ ok: false, message: refusalCopy('not_found') }, { status: 404 })
  }

  const outcome = await rescheduleBooking({ booking, startIso: start, now: new Date() })
  if (!outcome.ok) {
    return NextResponse.json(
      {
        ok: false,
        reason: outcome.reason,
        message: refusalCopy(String(outcome.reason)),
        ...(outcome.slots ? { slots: outcome.slots } : {}),
      },
      { status: statusFor(String(outcome.reason)) },
    )
  }

  return NextResponse.json({
    ok: true,
    moved: true,
    startsAt: outcome.startsAt,
    endsAt: outcome.endsAt,
  })
}
