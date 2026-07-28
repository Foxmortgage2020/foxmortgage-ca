// Confirm a booking. PUBLIC (middleware publicRoutes). The one write the public
// booking surface can make.
//
// ORDER, and it is fixed: honeypot, then rate limit, then config, then validate,
// then the engine (which re-reads availability, re-checks the slot, inserts under
// a unique index, and only then touches the calendar).
//
// The honeypot check comes FIRST and returns a quiet success. A bot learns
// nothing — no field name, no timing signal, no error shape. Nothing is stored.
//
// WHAT COMES BACK: on success, the booking id, the confirmed instants, and
// whether the calendar entry landed. On a refusal, one plain sentence and, when
// the reason is that the time went away, a fresh slot list so the visitor can pick
// again without a reload.

import { NextRequest, NextResponse } from 'next/server'
import { confirmBooking, loadConfig } from '@/lib/booking/engine'
import {
  clientKeyFrom,
  emailKeyFrom,
  rateLimit,
  CONFIRM_EMAIL_LIMIT,
  CONFIRM_IP_LIMIT,
} from '@/lib/booking/rate-limit'
import { isHoneypotFilled, refusalCopy, validateBooking } from '@/lib/booking/validate'
import { readPrefill } from '@/lib/booking/tokens'

export const dynamic = 'force-dynamic'

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,48}$/

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, message: 'That did not come through. Please try again.' }, { status: 400 })
  }

  // Honeypot. Quiet success, nothing stored, nothing learned.
  if (isHoneypotFilled(body)) {
    return NextResponse.json({ ok: true, booked: true, quiet: true })
  }

  const limited = rateLimit(`confirm-ip:${clientKeyFrom(req.headers)}`, CONFIRM_IP_LIMIT)
  if (!limited.allowed) {
    return NextResponse.json(
      { ok: false, message: refusalCopy('rate_limited') },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } },
    )
  }

  const host = String(body.host ?? '').trim().toLowerCase()
  const event = String(body.event ?? '').trim().toLowerCase()
  if (!SLUG_RE.test(host) || !SLUG_RE.test(event)) {
    return NextResponse.json({ ok: false, message: 'Not found.' }, { status: 404 })
  }

  const config = await loadConfig(host, event)
  if (!config) {
    return NextResponse.json({ ok: false, message: 'Not found.' }, { status: 404 })
  }

  const validated = validateBooking(body, config.eventType)
  if (!validated.ok) {
    return NextResponse.json(
      { ok: false, message: 'Please check the highlighted boxes.', errors: validated.errors },
      { status: 400 },
    )
  }

  // PER-EMAIL, checked here rather than at the top because the address has to be
  // validated before it can be a key, and keyed by hash so no address is ever
  // held in memory. This is the tier that survives a proxy pool: rotating IPs
  // buys a fresh IP budget but not a fresh address budget. Still before any
  // write, so a refusal stores nothing.
  const emailLimited = rateLimit(
    `confirm-email:${emailKeyFrom(validated.value.email)}`,
    CONFIRM_EMAIL_LIMIT,
  )
  if (!emailLimited.allowed) {
    return NextResponse.json(
      { ok: false, message: refusalCopy('rate_limited') },
      { status: 429, headers: { 'Retry-After': String(emailLimited.retryAfterSeconds) } },
    )
  }

  const now = new Date()
  const prefill = readPrefill(typeof body.k === 'string' ? body.k : null, now.getTime())

  const outcome = await confirmBooking({
    config,
    clean: validated.value,
    prefill,
    now,
    source: prefill ? 'prefill-link' : 'public',
  })

  if (!outcome.ok) {
    const status =
      outcome.reason === 'store_unavailable' || outcome.reason === 'calendar_unreadable' ? 503 : 409
    return NextResponse.json(
      {
        ok: false,
        reason: outcome.reason,
        message: refusalCopy(String(outcome.reason)),
        ...(outcome.slots ? { slots: outcome.slots } : {}),
      },
      { status },
    )
  }

  // The reschedule token is NOT returned to the browser. It is a capability that
  // belongs in the confirmation email (session two), not in a response a shared
  // screen or a browser history can hold.
  return NextResponse.json({
    ok: true,
    booked: true,
    bookingId: outcome.bookingId,
    startsAt: outcome.startsAt,
    endsAt: outcome.endsAt,
  })
}
