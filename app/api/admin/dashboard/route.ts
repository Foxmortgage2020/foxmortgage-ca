// GET /api/admin/dashboard
//
// Admin-only. Backs the live tiles on app/portal/admin (partner counts,
// referrals-this-month, referral attribution). Auth mirrors the other admin
// routes: currentUser() + publicMetadata.roles includes 'admin' (Clerk v5;
// not auth()). The payload builder never throws and degrades gracefully, so
// this route just gates and forwards.

import { NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { getAdminDashboardPayload } from '@/lib/zoho'

export async function GET() {
  const user = await currentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const metadata = (user.publicMetadata ?? {}) as { roles?: string[]; role?: string }
  // Clerk metadata in this org has inconsistent role shapes (array, string
  // under `roles`, or singular `role`) — normalize before the admin check.
  const roles = Array.isArray(metadata.roles)
    ? metadata.roles
    : typeof metadata.roles === 'string'
      ? [metadata.roles]
      : typeof metadata.role === 'string'
        ? [metadata.role]
        : []
  if (!roles.includes('admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const payload = await getAdminDashboardPayload()
  return NextResponse.json(payload)
}
