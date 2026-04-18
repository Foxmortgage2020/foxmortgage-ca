import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { getBookkeepingRules, createBookkeepingRule, updateBookkeepingRule } from '@/lib/zoho-creator'

function adminOnly(roles: string[]): boolean {
  return roles.includes('admin')
}

// GET /api/bookkeeping/rules?activeOnly=true
export async function GET(req: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const roles = (user.publicMetadata as { roles?: string[] })?.roles || []
    if (!adminOnly(roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const activeOnly = req.nextUrl.searchParams.get('activeOnly') === 'true'
    const records = await getBookkeepingRules(activeOnly)
    return NextResponse.json({ records })
  } catch (err) {
    console.error('[GET /api/bookkeeping/rules]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}

// POST /api/bookkeeping/rules — create a new rule
// Body: { Vendor_Regex, Account_Name, Memo_Tag, Confidence, Active, Hit_Count? }
export async function POST(req: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const roles = (user.publicMetadata as { roles?: string[] })?.roles || []
    if (!adminOnly(roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const result = await createBookkeepingRule({ Hit_Count: 0, Active: true, ...body })
    return NextResponse.json({ result }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/bookkeeping/rules]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}

// PATCH /api/bookkeeping/rules — update a rule
// Body: { rowId, ...fields }
export async function PATCH(req: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const roles = (user.publicMetadata as { roles?: string[] })?.roles || []
    if (!adminOnly(roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { rowId, ...updates } = await req.json()
    if (!rowId) return NextResponse.json({ error: 'rowId required' }, { status: 400 })

    const result = await updateBookkeepingRule(rowId, updates)
    return NextResponse.json({ result })
  } catch (err) {
    console.error('[PATCH /api/bookkeeping/rules]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
