// GET /api/admin/dashboard
//
// Admin-only. Backs the live tiles on app/portal/admin (partner counts,
// referrals-this-month, referral attribution). Gated through the authority
// matrix (apiPermission, 'deals.view'). The payload builder never throws and
// degrades gracefully, so this route just gates and forwards.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { getAdminDashboardPayload } from '@/lib/zoho'

export async function GET() {
  // Session 8: permission key, not a role literal.
  const gate = await apiPermission('deals.view')
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: gate.status })
  }

  const payload = await getAdminDashboardPayload()
  return NextResponse.json(payload)
}
