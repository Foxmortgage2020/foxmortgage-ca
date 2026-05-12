// POST /api/admin/impersonate/exit
//
// Admin-only. Clears the `fox_impersonation` cookie. Returns { ok: true }
// even if no cookie was present so the client can call this idempotently
// on logout / page unload.

import { NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { clearImpersonationCookie } from '@/lib/auth'

export async function POST() {
  const user = await currentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const metadata = (user.publicMetadata ?? {}) as { roles?: string[] }
  const roles = metadata.roles ?? []
  if (!roles.includes('admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await clearImpersonationCookie()

  return NextResponse.json({ ok: true })
}
