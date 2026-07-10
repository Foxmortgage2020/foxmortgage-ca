import { NextRequest, NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { updateReviewRecord } from '@/lib/zoho-creator'

// POST /api/bookkeeping/review-queue/[id]/approve
// Marks a review queue item as approved (accepts the suggested account/memo_tag as-is)
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Session 8: permission key, not a role literal (bookkeeping.view is
    // admin-only in the shipped baseline).
    const gate = await apiPermission('bookkeeping.view')
    if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })

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
    return NextResponse.json(
      { error: "We couldn't load this data right now. Please try again in a moment.", code: 'ZOHO_UNAVAILABLE' },
      { status: 503 },
    )
  }
}
