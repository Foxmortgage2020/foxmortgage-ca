import { NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'

// GET /api/bookkeeping/weekly-summary
// Stub — Week 3 will populate this with aggregated QBO transaction stats
// for the current week (Mon–Sun): total categorized, total deferred,
// top vendors by spend, and confidence distribution.
export async function GET() {
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const roles = (user.publicMetadata as { roles?: string[] })?.roles || []
    if (!roles.includes('admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    return NextResponse.json({
      stub: true,
      message: 'Weekly summary will be available in Week 3 once QBO credentials are active.',
      data: null,
    })
  } catch (err) {
    console.error('[GET /api/bookkeeping/weekly-summary]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
