// POST /api/portal/admin/underwriting/sweep — the bridge sweep (Phase B1).
// Two callers, two gates:
//   - the n8n schedule (and any machine trigger) sends x-bridge-secret,
//     never Clerk — the bookkeeping service-account precedent; the route is
//     in middleware publicRoutes and enforces the secret itself.
//   - a signed-in caller (the Underwriting page's refresh, or the manual
//     "Start underwriting early" with a zohoId body) rides Clerk. The full
//     sweep needs deals.view; the manual early-start is a workbench room
//     CREATE and gates on underwriting.provision (admin), because a human
//     choosing to open a room early is a decision, not plumbing.
// Demo mode never sweeps: zero real reads, zero real writes.

import { NextResponse } from 'next/server'
import { apiPermission, can } from '@/lib/authz'
import { isDemoMode } from '@/lib/demo'
import { runBridgeSweep, provisionEarly } from '@/lib/underwriting-sweep'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const secret = process.env.UW_BRIDGE_SECRET
  const headerSecret = req.headers.get('x-bridge-secret')
  const machineCall = Boolean(secret && headerSecret && headerSecret === secret)

  let body: { zohoId?: string } | null = null
  try {
    body = await req.json()
  } catch {
    body = null
  }

  if (!machineCall) {
    const gate = await apiPermission('deals.view')
    if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })
    if (isDemoMode()) {
      return NextResponse.json({ ok: true, demo: true, provisioned: [], funded: [], dormant: [], skipped: [] })
    }
    if (body?.zohoId) {
      if (!can(gate.user, 'underwriting.provision')) {
        return NextResponse.json(
          { error: 'Starting a room early needs the underwriting.provision permission.' },
          { status: 403 },
        )
      }
      const result = await provisionEarly(body.zohoId)
      return NextResponse.json(result, { status: result.ok ? 200 : 502 })
    }
  } else if (body?.zohoId) {
    // The machine path never creates early rooms: that is Michael's call.
    return NextResponse.json({ error: 'early provisioning is a signed-in action' }, { status: 403 })
  }

  const result = await runBridgeSweep()
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}
