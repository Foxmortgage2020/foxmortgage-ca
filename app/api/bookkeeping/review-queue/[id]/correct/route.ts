import { NextRequest, NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { updateReviewRecord } from '@/lib/zoho-creator'

// POST /api/bookkeeping/review-queue/[id]/correct
// Marks a review queue item as corrected, with the human-supplied account and memo_tag
// Body: { Final_Account, Final_Memo_Tag, Reviewer_Notes? }
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

    const body = await req.json()
    if (!body.Final_Account || !body.Final_Memo_Tag) {
      return NextResponse.json({ error: 'Final_Account and Final_Memo_Tag are required' }, { status: 400 })
    }

    const result = await updateReviewRecord(id, {
      Status: 'Corrected',
      Final_Account: body.Final_Account,
      Final_Memo_Tag: body.Final_Memo_Tag,
      Reviewed_At: new Date().toISOString(),
      ...(body.Reviewer_Notes ? { Reviewer_Notes: body.Reviewer_Notes } : {}),
    })
    return NextResponse.json({ result })
  } catch (err) {
    console.error('[POST /api/bookkeeping/review-queue/[id]/correct]', err)
    return NextResponse.json(
      { error: "We couldn't load this data right now. Please try again in a moment.", code: 'ZOHO_UNAVAILABLE' },
      { status: 503 },
    )
  }
}
