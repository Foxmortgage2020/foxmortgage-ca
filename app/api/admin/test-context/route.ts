// GET /api/admin/_test-context
//
// THROWAWAY — delete in step 2 of the impersonation build. Returns the full
// output of getPortalContext() as JSON so the test harness page can show
// what the helper currently sees. Admin-gated.

import { NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { getPortalContext } from '@/lib/auth'

export async function GET() {
  const user = await currentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const metadata = (user.publicMetadata ?? {}) as { roles?: string[] }
  const roles = metadata.roles ?? []
  if (!roles.includes('admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const ctx = await getPortalContext()
  return NextResponse.json({ context: ctx })
}
