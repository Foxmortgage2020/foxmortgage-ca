// Open times for a host's event type. PUBLIC (middleware publicRoutes) and
// READ-ONLY: it creates nothing and reveals nothing about who else has booked —
// the response is a list of instants and nothing more. No name, no email, no
// count of existing bookings, no reason a time is missing.
//
// Every instant is UTC. The browser renders them in the visitor's own timezone,
// which is why this endpoint never needs to guess where the visitor is.

import { NextRequest, NextResponse } from 'next/server'
import { getSlots, loadConfig } from '@/lib/booking/engine'
import { clientKeyFrom, rateLimit, SLOTS_LIMIT } from '@/lib/booking/rate-limit'
import { refusalCopy } from '@/lib/booking/validate'

export const dynamic = 'force-dynamic'

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,48}$/

export async function GET(req: NextRequest) {
  const limited = rateLimit(`slots:${clientKeyFrom(req.headers)}`, SLOTS_LIMIT)
  if (!limited.allowed) {
    return NextResponse.json(
      { ok: false, message: refusalCopy('rate_limited') },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } },
    )
  }

  const host = (req.nextUrl.searchParams.get('host') ?? '').trim().toLowerCase()
  const event = (req.nextUrl.searchParams.get('event') ?? '').trim().toLowerCase()
  if (!SLUG_RE.test(host) || !SLUG_RE.test(event)) {
    return NextResponse.json({ ok: false, message: 'Not found.' }, { status: 404 })
  }

  const daysRaw = Number(req.nextUrl.searchParams.get('days'))
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(Math.floor(daysRaw), 90) : undefined

  const config = await loadConfig(host, event)
  if (!config) {
    return NextResponse.json({ ok: false, message: 'Not found.' }, { status: 404 })
  }

  const outcome = await getSlots(config, { now: new Date(), days })
  if (!outcome.ok) {
    return NextResponse.json(
      { ok: false, message: refusalCopy(outcome.reason ?? 'unknown'), slots: [] },
      { status: 503 },
    )
  }

  return NextResponse.json({
    ok: true,
    timezone: config.host.timezone,
    durationMinutes: config.eventType.durationMinutes,
    slots: outcome.slots,
  })
}
