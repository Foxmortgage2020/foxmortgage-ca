// The booking engine's scheduled work, behind a machine gate.
//
// POST /api/book/cron  { job: 'reminders' | 'reconcile' | 'both' }
//
// AUTH, and this is a deliberate decision worth stating: it reuses the EXISTING
// machine-path secret `UW_BRIDGE_SECRET` over the `x-bridge-secret` header, the
// same pattern and the same header the underwriting sweep already uses for its
// n8n schedule. This session is not permitted to provision environment
// variables, and the alternative — putting FOXCA_OPERATOR_SECRET into an n8n
// credential — would copy the database's master key into a second system to
// solve a scheduling problem.
//
// THE COST, stated rather than buried: a leak of UW_BRIDGE_SECRET now also
// unlocks these two jobs. The blast radius is bounded on purpose — this route
// sends reminders for bookings that already exist and retries calendar writes
// that were already requested. It cannot create, move, or cancel a booking, and
// it returns counts and ids, never a client's name, email, or number.
//
// SESSION THREE SHOULD GIVE BOOKING ITS OWN SECRET once env vars are allowed
// again. The header name is already generic enough that only the value changes.
//
// The route is in middleware publicRoutes because Clerk would 401 a machine call
// with a null body before this handler ever ran.

import { NextRequest, NextResponse } from 'next/server'
import { runReconcileJob, runReminderJob } from '@/lib/booking/jobs'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const secret = process.env.UW_BRIDGE_SECRET
  const headerSecret = req.headers.get('x-bridge-secret')
  const machineCall = Boolean(secret && headerSecret && headerSecret === secret)
  if (!machineCall) {
    // One shape for a wrong secret and for a missing one, so nothing here tells
    // an unauthenticated caller which of the two they got wrong.
    return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  }

  let body: { job?: unknown } | null = null
  try {
    body = (await req.json()) as { job?: unknown }
  } catch {
    body = null
  }
  const job = typeof body?.job === 'string' ? body.job : 'both'
  const now = new Date()

  const logs = []
  if (job === 'reminders' || job === 'both') {
    logs.push(await runReminderJob(now))
  }
  if (job === 'reconcile' || job === 'both') {
    logs.push(await runReconcileJob(now))
  }
  if (logs.length === 0) {
    return NextResponse.json({ error: 'job must be reminders, reconcile, or both' }, { status: 400 })
  }

  const ok = logs.every(l => l.ok)
  // The whole log goes back in the response. n8n keeps it, so a run that quietly
  // did nothing is visible as a run that did nothing.
  return NextResponse.json({ ok, at: now.toISOString(), logs }, { status: ok ? 200 : 502 })
}
