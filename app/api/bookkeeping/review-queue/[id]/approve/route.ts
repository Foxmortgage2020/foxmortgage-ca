import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { updateReviewRecord } from '@/lib/zoho-creator'

// POST /api/bookkeeping/review-queue/[id]/approve
// Marks a review queue item as approved (accepts the suggested account/memo_tag as-is)
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const roles = (user.publicMetadata as { roles?: string[] })?.roles || []
    if (!roles.includes('admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = params
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const result = await updateReviewRecord(id, {
      Status: 'Approved',
      Reviewed_At: new Date().toISOString(),
      ...(body.Reviewer_Notes ? { Reviewer_Notes: body.Reviewer_Notes } : {}),
    })
    return NextResponse.json({ result })
  } catch (err) {
    console.error('[POST /api/bookkeeping/review-queue/[id]/approve]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
