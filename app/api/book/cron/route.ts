// The booking engine's scheduled work, behind a machine gate.
//
// GET  /api/book/cron?job=reminders|reconcile|both   (the Vercel cron)
// POST /api/book/cron  { job: 'reminders' | 'reconcile' | 'both' }
//
// THE CLOCK IS VERCEL'S NOW. vercel.json schedules this path hourly ('0 * * * *',
// UTC). It replaces n8n `Uc9CoYm4B2XSpN5m`, which never ran: it sat inactive with
// no credential bound to its HTTP node, so no reminder ever fired on its own and
// no stuck calendar write ever drained. The renewal-day plan for that workflow is
// DEACTIVATION, not rebinding — this route is the trigger now.
//
// AUTH, two paths, both valid during the transition:
//
//   1. `x-bridge-secret` = UW_BRIDGE_SECRET — the original machine path, the same
//      header and secret the underwriting sweep uses. It stays PRIMARY: it is the
//      one that is known to be configured, and it is how a run is triggered by
//      hand. It retires when n8n does.
//   2. `Authorization: Bearer <CRON_SECRET>` — what Vercel attaches to a cron
//      invocation, and only when CRON_SECRET is set on the project. Vercel does
//      not mint it for you. Until it exists in the project environment the
//      hourly call arrives with NO Authorization header and is refused here with
//      a 401, which is the correct and visible failure: the schedule fires, the
//      jobs do not run, and nothing is silently half-authenticated. Setting
//      CRON_SECRET in the Vercel dashboard (Production) is the one manual step
//      that finishes this migration, and it needs no redeploy of this file.
//
// Vercel invokes crons with GET, so GET exists purely for the platform and reads
// its job from the query string. Both verbs run the identical work through
// runJobs. The jobs are idempotent (session two), so an overlap with a revived
// n8n trigger double-fires harmlessly.
//
// THE COST OF SHARING THE BRIDGE SECRET, stated rather than buried: a leak of
// UW_BRIDGE_SECRET also unlocks these two jobs. The blast radius is bounded on
// purpose — this route sends reminders for bookings that already exist and
// retries calendar writes that were already requested. It cannot create, move,
// or cancel a booking, and it returns counts and ids, never a client's name,
// email, or number.
//
// The route is in middleware publicRoutes because Clerk would 401 a machine call
// with a null body before this handler ever ran.

import { NextRequest, NextResponse } from 'next/server'
import { runReconcileJob, runReminderJob } from '@/lib/booking/jobs'

export const dynamic = 'force-dynamic'

type Caller = 'bridge' | 'vercel-cron'

/**
 * One shape for a wrong secret and for a missing one, so nothing here tells an
 * unauthenticated caller which of the two they got wrong: this returns the
 * caller's name or null, and the null is never explained to the client.
 */
function authorise(req: NextRequest): Caller | null {
  const bridgeSecret = process.env.UW_BRIDGE_SECRET
  const bridgeHeader = req.headers.get('x-bridge-secret')
  if (bridgeSecret && bridgeHeader && bridgeHeader === bridgeSecret) return 'bridge'

  // Vercel's documented guard: no CRON_SECRET means no cron call can authenticate.
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  if (cronSecret && authHeader && authHeader === `Bearer ${cronSecret}`) return 'vercel-cron'

  return null
}

async function runJobs(job: string, via: Caller) {
  const now = new Date()
  const startedAt = Date.now()

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

  // The Vercel cron DISCARDS the response body, so counts that only ever lived in
  // the response would be lost the moment n8n stopped being the caller. This line
  // is the run's durable record in the runtime log. Counts, ids, and durations
  // only: never a note's free text, never a payload, never a client's details.
  console.log(
    'book.cron',
    JSON.stringify({
      via,
      job,
      ok,
      ms: Date.now() - startedAt,
      runs: logs.map(l => ({
        ran: l.ran,
        ok: l.ok,
        considered: l.considered,
        succeeded: l.succeeded,
        failed: l.failed,
        skipped: l.skipped,
        stuck: l.stuck.length,
      })),
    }),
  )

  // The whole log still goes back in the response for a caller that keeps one.
  return NextResponse.json({ ok, at: now.toISOString(), via, logs }, { status: ok ? 200 : 502 })
}

/** The Vercel cron. Hourly per vercel.json, job in the query string. */
export async function GET(req: NextRequest) {
  const via = authorise(req)
  if (!via) return NextResponse.json({ error: 'not authorised' }, { status: 401 })

  const requested = req.nextUrl.searchParams.get('job')
  return runJobs(requested ?? 'both', via)
}

/** The n8n and by-hand path. Job in the body. */
export async function POST(req: NextRequest) {
  const via = authorise(req)
  if (!via) return NextResponse.json({ error: 'not authorised' }, { status: 401 })

  let body: { job?: unknown } | null = null
  try {
    body = (await req.json()) as { job?: unknown }
  } catch {
    body = null
  }
  const job = typeof body?.job === 'string' ? body.job : 'both'
  return runJobs(job, via)
}
