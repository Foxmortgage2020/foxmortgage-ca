// Open times for RESCHEDULING an existing booking. PUBLIC, POST-only.
//
// Why this exists instead of reusing /api/book/slots: a booking occupies its own
// slot, and its buffers block the slots either side of it. Asked plainly, the
// public endpoint would hide the times nearest the client's current one, which
// are exactly the times someone moving by fifteen minutes wants. This endpoint
// removes the booking from the inputs first, so the list it returns matches what
// the reschedule will actually accept.
//
// POST, not GET, because the token is a capability. Keeping it out of the query
// string keeps it out of proxy logs and browser history.

import { NextRequest, NextResponse } from 'next/server'
import {
  bookingForToken,
  loadConfig,
  providerForAgent,
  withoutBooking,
  withoutOwnEvent,
  SELF_SERVE_CUTOFF_HOURS,
} from '@/lib/booking/engine'
import { availabilityInputs } from '@/lib/booking/store'
import { computeSlots } from '@/lib/booking/availability'
import { addDaysYMD, isoMs, toUtcIso, wallClockToUtc, zonedYMD } from '@/lib/booking/time'
import { clientKeyFrom, rateLimit, SLOTS_LIMIT } from '@/lib/booking/rate-limit'
import { refusalCopy } from '@/lib/booking/validate'

export const dynamic = 'force-dynamic'

const WINDOW_DAYS = 28

export async function POST(req: NextRequest) {
  const limited = rateLimit(`manage-slots:${clientKeyFrom(req.headers)}`, SLOTS_LIMIT)
  if (!limited.allowed) {
    return NextResponse.json(
      { ok: false, message: refusalCopy('rate_limited') },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } },
    )
  }

  let body: { token?: unknown }
  try {
    body = (await req.json()) as { token?: unknown }
  } catch {
    return NextResponse.json({ ok: false, message: 'That did not come through.' }, { status: 400 })
  }

  const booking = await bookingForToken(String(body.token ?? ''))
  if (!booking) {
    return NextResponse.json({ ok: false, message: refusalCopy('not_found') }, { status: 404 })
  }
  if (booking.status !== 'booked') {
    return NextResponse.json(
      { ok: false, message: refusalCopy(booking.status === 'cancelled' ? 'already_cancelled' : 'not_active') },
      { status: 409 },
    )
  }

  const now = new Date()
  const startMs = isoMs(booking.startsAt)
  if (startMs !== null && startMs - now.getTime() < SELF_SERVE_CUTOFF_HOURS * 3_600_000) {
    return NextResponse.json({ ok: false, message: refusalCopy('too_late') }, { status: 409 })
  }

  const config = await loadConfig(booking.hostSlug, booking.eventTypeSlug)
  if (!config) {
    return NextResponse.json({ ok: false, message: refusalCopy('event_inactive') }, { status: 409 })
  }

  const tz = config.host.timezone
  const todayYMD = zonedYMD(now, tz)
  const toYMD = addDaysYMD(todayYMD, WINDOW_DAYS - 1)
  const fromInstant = toUtcIso(wallClockToUtc(addDaysYMD(todayYMD, -1), 0, tz))
  const toInstant = toUtcIso(wallClockToUtc(addDaysYMD(toYMD, 2), 0, tz))

  const inputsRes = await availabilityInputs({
    agentId: config.host.agentId,
    fromDate: todayYMD,
    toDate: toYMD,
    fromInstant,
    toInstant,
  })
  if (!inputsRes.configured || !inputsRes.ok) {
    return NextResponse.json({ ok: false, message: refusalCopy('store_unavailable') }, { status: 503 })
  }

  const provider = providerForAgent(config.host.agentId)
  const busyRes = await provider.getBusy({ startUtc: fromInstant, endUtc: toInstant })
  if (!busyRes.ok) {
    return NextResponse.json({ ok: false, message: refusalCopy('calendar_unreadable'), slots: [] }, { status: 503 })
  }

  // The booking is not an obstacle to its own move, and it exists in two places:
  // the bookings table and the calendar. Both are removed, using the SAME helpers
  // the reschedule engine uses, so this list cannot offer a time the server would
  // then refuse.
  const slots = computeSlots({
    timezone: tz,
    eventType: config.eventType,
    inputs: withoutBooking(inputsRes.data, booking),
    busy: withoutOwnEvent(busyRes.busy, booking.calendarEventId),
    busyReadable: true,
    now,
    fromYMD: todayYMD,
    days: WINDOW_DAYS,
  })

  return NextResponse.json({
    ok: true,
    timezone: tz,
    durationMinutes: config.eventType.durationMinutes,
    current: { startsAt: booking.startsAt, endsAt: booking.endsAt },
    eventName: booking.eventTypeName,
    hostName: booking.hostDisplayName,
    slots,
  })
}
