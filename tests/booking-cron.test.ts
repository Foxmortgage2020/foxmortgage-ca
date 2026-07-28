// The booking cron's move from n8n to Vercel, held to the three things that can
// silently rot: the schedule entry itself, the auth matrix (two callers, one of
// which does not exist until an env var is set), and the runtime log line that
// is now the ONLY durable record of a run, because the Vercel cron discards the
// response body that n8n used to keep.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { NextRequest } from 'next/server'
import type { JobLog } from '@/lib/booking/jobs'

function log(name: string, ok = true): JobLog {
  return { ok, ran: name, considered: 2, succeeded: 1, failed: 0, skipped: 1, stuck: [], notes: [] }
}

vi.mock('@/lib/booking/jobs', () => ({
  runReminderJob: vi.fn(async () => log('reminders')),
  runReconcileJob: vi.fn(async () => log('reconcile')),
}))

// Imported after the mock so the route binds the doubles, not the real jobs.
import { GET, POST } from '@/app/api/book/cron/route'
import { runReminderJob, runReconcileJob } from '@/lib/booking/jobs'

const BRIDGE = 'bridge-secret-for-tests'
const CRON = 'cron-secret-for-tests'
const URL_BASE = 'https://www.foxmortgage.ca/api/book/cron'

function get(headers: Record<string, string> = {}, query = '') {
  return new NextRequest(`${URL_BASE}${query}`, { method: 'GET', headers })
}

function post(headers: Record<string, string> = {}, body: unknown = {}) {
  return new NextRequest(URL_BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

let logged: string[] = []

beforeEach(() => {
  vi.clearAllMocks()
  process.env.UW_BRIDGE_SECRET = BRIDGE
  process.env.CRON_SECRET = CRON
  logged = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(' '))
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.CRON_SECRET
  delete process.env.UW_BRIDGE_SECRET
})

// ─── The schedule entry ──────────────────────────────────────────────────────
//
// vercel.json is the whole clock. A typo in the path is a cron that 404s every
// hour forever and looks, from the dashboard, exactly like a cron that works.

describe('vercel.json cron entry', () => {
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'))

  it('schedules the booking jobs hourly', () => {
    const entries = config.crons.filter((c: { path: string }) => c.path === '/api/book/cron')
    expect(entries).toHaveLength(1)
    expect(entries[0].schedule).toBe('0 * * * *')
  })

  it('points every cron path at a route that exists on disk', () => {
    for (const cron of config.crons as Array<{ path: string }>) {
      const route = `app${cron.path}/route.ts`
      expect(existsSync(route), `${cron.path} has no route at ${route}`).toBe(true)
    }
  })

  it('keeps the cron path exempt from Clerk, or the platform call never reaches the handler', () => {
    expect(readFileSync('middleware.ts', 'utf8')).toContain("'/api/book/cron'")
  })
})

// ─── The auth matrix ─────────────────────────────────────────────────────────

describe('cron auth', () => {
  it('accepts the Vercel cron bearing CRON_SECRET', async () => {
    const res = await GET(get({ authorization: `Bearer ${CRON}` }))
    expect(res.status).toBe(200)
    expect((await res.json()).via).toBe('vercel-cron')
    expect(runReminderJob).toHaveBeenCalledTimes(1)
    expect(runReconcileJob).toHaveBeenCalledTimes(1)
  })

  it('still accepts the bridge header, the path that retires with n8n', async () => {
    const res = await POST(post({ 'x-bridge-secret': BRIDGE }))
    expect(res.status).toBe(200)
    expect((await res.json()).via).toBe('bridge')
    expect(runReminderJob).toHaveBeenCalledTimes(1)
  })

  it('accepts the bridge header on GET too, so a run can be triggered by hand', async () => {
    const res = await GET(get({ 'x-bridge-secret': BRIDGE }))
    expect(res.status).toBe(200)
    expect((await res.json()).via).toBe('bridge')
  })

  it('refuses a cron bearer while CRON_SECRET is unset, rather than half-authenticating', async () => {
    delete process.env.CRON_SECRET
    const res = await GET(get({ authorization: 'Bearer anything-at-all' }))
    expect(res.status).toBe(401)
    expect(runReminderJob).not.toHaveBeenCalled()
    expect(runReconcileJob).not.toHaveBeenCalled()
  })

  it('refuses an unauthenticated call on both verbs', async () => {
    expect((await GET(get())).status).toBe(401)
    expect((await POST(post())).status).toBe(401)
    expect(runReminderJob).not.toHaveBeenCalled()
  })

  it('refuses a wrong secret on either header', async () => {
    expect((await GET(get({ authorization: 'Bearer wrong' }))).status).toBe(401)
    expect((await GET(get({ 'x-bridge-secret': 'wrong' }))).status).toBe(401)
    expect(runReconcileJob).not.toHaveBeenCalled()
  })

  it('says nothing about which secret was wrong', async () => {
    const missing = await GET(get())
    const wrong = await GET(get({ authorization: 'Bearer wrong' }))
    expect(await missing.json()).toEqual(await wrong.json())
  })
})

// ─── Both verbs, one body of work ────────────────────────────────────────────

describe('job selection', () => {
  it('runs both jobs by default on the cron GET', async () => {
    await GET(get({ authorization: `Bearer ${CRON}` }))
    expect(runReminderJob).toHaveBeenCalledTimes(1)
    expect(runReconcileJob).toHaveBeenCalledTimes(1)
  })

  it('honours ?job= on GET', async () => {
    await GET(get({ authorization: `Bearer ${CRON}` }, '?job=reminders'))
    expect(runReminderJob).toHaveBeenCalledTimes(1)
    expect(runReconcileJob).not.toHaveBeenCalled()
  })

  it('honours the POST body, unchanged from the n8n contract', async () => {
    const res = await POST(post({ 'x-bridge-secret': BRIDGE }, { job: 'reconcile' }))
    expect(res.status).toBe(200)
    expect((await res.json()).via).toBe('bridge')
    expect(runReconcileJob).toHaveBeenCalledTimes(1)
    expect(runReminderJob).not.toHaveBeenCalled()
  })

  it('treats a POST with no body as both, so a bare trigger still works', async () => {
    const req = new NextRequest(URL_BASE, { method: 'POST', headers: { 'x-bridge-secret': BRIDGE } })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(runReminderJob).toHaveBeenCalledTimes(1)
    expect(runReconcileJob).toHaveBeenCalledTimes(1)
  })

  it('refuses an unknown job name', async () => {
    const res = await GET(get({ authorization: `Bearer ${CRON}` }, '?job=nonsense'))
    expect(res.status).toBe(400)
    expect(runReminderJob).not.toHaveBeenCalled()
  })

  it('reports 502 when a job comes back not ok', async () => {
    vi.mocked(runReminderJob).mockResolvedValueOnce(log('reminders', false))
    const res = await GET(get({ authorization: `Bearer ${CRON}` }))
    expect(res.status).toBe(502)
    expect((await res.json()).ok).toBe(false)
  })
})

// ─── The runtime log, now the only durable record ────────────────────────────

describe('runtime log line', () => {
  it('carries the counts of every run', async () => {
    await GET(get({ authorization: `Bearer ${CRON}` }))
    expect(logged).toHaveLength(1)
    const payload = JSON.parse(logged[0].replace(/^book\.cron /, ''))
    expect(payload.via).toBe('vercel-cron')
    expect(payload.ok).toBe(true)
    expect(payload.runs.map((r: { ran: string }) => r.ran)).toEqual(['reminders', 'reconcile'])
    expect(payload.runs[0]).toMatchObject({ considered: 2, succeeded: 1, failed: 0, skipped: 1, stuck: 0 })
    expect(typeof payload.ms).toBe('number')
  })

  it('logs a stuck count, never the stuck rows themselves', async () => {
    vi.mocked(runReconcileJob).mockResolvedValueOnce({
      ...log('reconcile'),
      stuck: [{ id: 'bk_123', ageHours: 30, detail: 'graph refused', alerted: true }],
      notes: ['stuck alert for bk_123 could not be sent'],
    })
    await GET(get({ authorization: `Bearer ${CRON}` }))
    const line = logged[0]
    expect(JSON.parse(line.replace(/^book\.cron /, '')).runs[1].stuck).toBe(1)
    expect(line).not.toContain('graph refused')
    expect(line).not.toContain('could not be sent')
  })

  it('never logs a secret', async () => {
    await GET(get({ authorization: `Bearer ${CRON}` }))
    expect(logged.join('\n')).not.toContain(CRON)
    expect(logged.join('\n')).not.toContain(BRIDGE)
  })
})
