import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { getDeferredSchedules } from '@/lib/zoho-creator'

// GET /api/bookkeeping/deferred-schedules?status=Active
// Proxy for Deferred_Revenue_Schedule records in Zoho Creator
export async function GET(req: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const roles = (user.publicMetadata as { roles?: string[] })?.roles || []
    if (!roles.includes('admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const status = req.nextUrl.searchParams.get('status') ?? undefined
    const records = await getDeferredSchedules(status)
    return NextResponse.json({ records })
  } catch (err) {
    console.error('[GET /api/bookkeeping/deferred-schedules]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
