// Saved scenarios API (Rates v3, Part 5). Per-user store behind rates.view
// (scenarios are already inside that key's scope — no new authority key).
// GET lists the current user's active scenarios; POST saves or retires one.
// Writes are keyed by the server-side Clerk user id (gate.user.userId), never
// a body-supplied id, so one user can never touch another's rows. Demo mode
// short-circuits before any real FOXCA read or write: a demo walkthrough
// never lists or persists real saved scenarios (their names can carry a file
// ref). Nothing hard-deletes; retire flips the status.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { isDemoMode } from '@/lib/demo'
import { scenarioFromParams, scenarioToParams } from '@/lib/scenario'
import {
  createSavedScenario,
  listSavedScenarios,
  retireSavedScenario,
} from '@/lib/saved-scenarios-store'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FILE_REF_RE = /^[A-Z0-9-]{4,24}$/

// Canonicalize a scenario query string server-side: only real scenario
// dimensions survive (from/pins/tab/lender are dropped), so the stored params
// are exactly what the rail understands on recall.
function canonicalScenarioParams(raw: string): string {
  const parsed: Record<string, string> = {}
  new URLSearchParams(raw).forEach((v, k) => {
    parsed[k] = v
  })
  return new URLSearchParams(scenarioToParams(scenarioFromParams(parsed))).toString()
}

export async function GET() {
  const gate = await apiPermission('rates.view')
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.message }, { status: gate.status })

  if (isDemoMode()) {
    return NextResponse.json({ ok: true, configured: true, scenarios: [] })
  }

  const res = await listSavedScenarios(gate.user.userId)
  if (!res.configured) return NextResponse.json({ ok: true, configured: false, scenarios: [] })
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 503 })
  return NextResponse.json({ ok: true, configured: true, scenarios: res.data })
}

export async function POST(req: Request) {
  const gate = await apiPermission('rates.view')
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.message }, { status: gate.status })

  if (isDemoMode()) {
    return NextResponse.json(
      { ok: false, error: 'Saved scenarios are disabled in demo mode.' },
      { status: 403 },
    )
  }

  let body:
    | { action?: 'save' | 'retire'; name?: string; params?: string; from?: string; id?: string }
    | null = null
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Send JSON.' }, { status: 422 })
  }

  const action = body?.action ?? 'save'

  if (action === 'retire') {
    const id = typeof body?.id === 'string' && UUID_RE.test(body.id) ? body.id : null
    if (!id) return NextResponse.json({ ok: false, error: 'A valid scenario id is required.' }, { status: 422 })
    const res = await retireSavedScenario(id, gate.user.userId)
    if (!res.configured) return NextResponse.json({ ok: false, error: 'Store not configured.' }, { status: 503 })
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 503 })
    return NextResponse.json({ ok: true, retired: res.data })
  }

  // action === 'save'
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : ''
  if (name.length === 0) return NextResponse.json({ ok: false, error: 'Name the scenario first.' }, { status: 422 })
  // Guard on the RAW input: scenarioToParams always emits the four default
  // dimensions, so a check on the canonicalized string could never be empty.
  const rawParams = typeof body?.params === 'string' ? body.params.trim() : ''
  if (rawParams.length === 0) {
    return NextResponse.json({ ok: false, error: 'Describe a scenario first.' }, { status: 422 })
  }
  const params = canonicalScenarioParams(rawParams)
  const fromFile = typeof body?.from === 'string' && FILE_REF_RE.test(body.from) ? body.from : null

  const res = await createSavedScenario(gate.user.userId, name, params, fromFile)
  if (!res.configured) return NextResponse.json({ ok: false, error: 'Store not configured.' }, { status: 503 })
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 503 })
  return NextResponse.json({ ok: true, id: res.data })
}
