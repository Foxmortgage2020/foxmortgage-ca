import { auth } from '@clerk/nextjs/server'
import { getInvestorDeal } from '@/lib/zoho'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const deal = await getInvestorDeal(params.id)
    if (!deal) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 })
    }

    return NextResponse.json({ data: deal })
  } catch (error) {
    console.error('[investor/deal] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch deal' },
      { status: 500 }
    )
  }
}
