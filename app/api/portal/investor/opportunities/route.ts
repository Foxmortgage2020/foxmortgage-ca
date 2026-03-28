import { currentUser } from '@clerk/nextjs/server'
import { getInvestorOpportunities } from '@/lib/zoho'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const user = await currentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const opportunities = await getInvestorOpportunities()
    return NextResponse.json({ data: opportunities })
  } catch (error) {
    console.error('[investor/opportunities] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch opportunities' },
      { status: 500 },
    )
  }
}
