import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { getDeferredSchedules, createDeferredSchedule, updateDeferredSchedule } from '@/lib/zoho-creator'

function adminOnly(roles: string[]): boolean {
  return roles.includes('admin')
}

// GET /api/bookkeeping/schedules?status=Active
export async function GET(req: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const roles = (user.publicMetadata as { roles?: string[] })?.roles || []
    if (!adminOnly(roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const status = req.nextUrl.searchParams.get('status') ?? undefined
    const records = await getDeferredSchedules(status)
    return NextResponse.json({ records })
  } catch (err) {
    console.error('[GET /api/bookkeeping/schedules]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}

// POST /api/bookkeeping/schedules — create a deferred revenue schedule
// Body: { Transaction_ID, Total_Amount, Start_Date, End_Date, Method,
//         Monthly_Amount, Remaining_Balance, Target_Revenue_Account_ID, Notes? }
export async function POST(req: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const roles = (user.publicMetadata as { roles?: string[] })?.roles || []
    if (!adminOnly(roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const result = await createDeferredSchedule({ Status: 'Active', ...body })
    return NextResponse.json({ result }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/bookkeeping/schedules]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}

// PATCH /api/bookkeeping/schedules — update a schedule
// Body: { rowId, ...fields }
export async function PATCH(req: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const roles = (user.publicMetadata as { roles?: string[] })?.roles || []
    if (!adminOnly(roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { rowId, ...updates } = await req.json()
    if (!rowId) return NextResponse.json({ error: 'rowId required' }, { status: 400 })

    const result = await updateDeferredSchedule(rowId, updates)
    return NextResponse.json({ result })
  } catch (err) {
    console.error('[PATCH /api/bookkeeping/schedules]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
