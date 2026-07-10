// POST /api/admin/impersonate/exit
//
// Gated on portals.view-as (Session 8). Stamps ended_at on the FOXCA
// view_as_sessions row when the cookie carries a logId, then clears the
// `fox_impersonation` cookie. Returns { ok: true } even if no cookie was
// present so the client can call this idempotently on logout / page
// unload.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { clearImpersonationCookie, readImpersonationCookie } from '@/lib/auth'
import { viewAsEnd } from '@/lib/people-store'

export async function POST() {
  const gate = await apiPermission('portals.view-as')
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: gate.status })
  }

  const impersonation = await readImpersonationCookie()
  if (impersonation?.logId) {
    // Graceful: an unreachable store never traps the admin in view-as.
    // view_as_end is idempotent (only stamps a null ended_at).
    const ended = await viewAsEnd(impersonation.logId)
    if (!(ended.configured && ended.ok)) {
      console.error('[admin/impersonate/exit] view_as_end did not record')
    }
  }

  await clearImpersonationCookie()

  return NextResponse.json({ ok: true })
}
