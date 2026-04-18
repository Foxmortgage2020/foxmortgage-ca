import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { getReviewQueue, createReviewRecord, updateReviewRecord } from '@/lib/zoho-creator'

function adminOnly(roles: string[]): boolean {
  return roles.includes('admin')
}

// GET /api/bookkeeping/review-queue?status=Pending
export async function GET(req: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const roles = (user.publicMetadata as { roles?: string[] })?.roles || []
    if (!adminOnly(roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const status = req.nextUrl.searchParams.get('status') ?? undefined
    const records = await getReviewQueue(status)
    return NextResponse.json({ records })
  } catch (err) {
    console.error('[GET /api/bookkeeping/review-queue]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}

// POST /api/bookkeeping/review-queue — submit a transaction for review
// Body: { Transaction_ID, Transaction_Date, Vendor_Name, Amount, Suggested_Account,
//         Suggested_Memo_Tag, Confidence_Score, Match_Method, AI_Notes }
export async function POST(req: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const roles = (user.publicMetadata as { roles?: string[] })?.roles || []
    if (!adminOnly(roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const result = await createReviewRecord({ ...body, Status: 'Pending' })
    return NextResponse.json({ result }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/bookkeeping/review-queue]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}

// PATCH /api/bookkeeping/review-queue — approve/correct/reject a record
// Body: { rowId, Status, Final_Account?, Final_Memo_Tag?, Reviewer_Notes? }
export async function PATCH(req: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const roles = (user.publicMetadata as { roles?: string[] })?.roles || []
    if (!adminOnly(roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { rowId, ...updates } = await req.json()
    if (!rowId) return NextResponse.json({ error: 'rowId required' }, { status: 400 })

    const result = await updateReviewRecord(rowId, {
      ...updates,
      Reviewed_At: new Date().toISOString(),
    })
    return NextResponse.json({ result })
  } catch (err) {
    console.error('[PATCH /api/bookkeeping/review-queue]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
