// POST /api/portal/admin/demo (Session 9) — enter or exit demo mode.
//
// Gated on demo.mode (admin only) AND fenced by demoModeAvailable(): where
// DEMO_MODE_ENABLED is unset the route 404s, so the capability cannot be
// turned on in a project that did not opt in. The route only ever
// sets/clears the signed fox_demo cookie — it NEVER writes to any real
// system (Zoho, the workbench, FOXCA, Clerk).

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { demoModeAvailable, setDemoCookie, clearDemoCookie } from '@/lib/demo'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await apiPermission('demo.mode')
  if (!gate.ok) {
    return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  }
  if (!demoModeAvailable()) {
    return NextResponse.json(
      { ok: false, message: 'Demo mode is not enabled in this environment.' },
      { status: 404 },
    )
  }

  const body = (await req.json().catch(() => null)) as { action?: unknown } | null
  const action = body?.action
  if (action !== 'enter' && action !== 'exit') {
    return NextResponse.json(
      { ok: false, message: "action must be 'enter' or 'exit'." },
      { status: 400 },
    )
  }

  if (action === 'enter') {
    await setDemoCookie()
    return NextResponse.json({ ok: true, demo: true })
  }
  await clearDemoCookie()
  return NextResponse.json({ ok: true, demo: false })
}
