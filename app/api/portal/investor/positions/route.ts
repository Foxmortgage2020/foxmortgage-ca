import { currentUser } from '@clerk/nextjs/server'
import { getInvestorPositions } from '@/lib/zoho'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const user = await currentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const metadata = user.publicMetadata as {
      zoho_partner_id?: string
      roles?: string[]
    }
    const zohoPartnerId = metadata?.zoho_partner_id

    if (!zohoPartnerId) {
      return NextResponse.json({
        error: 'No Zoho partner ID configured for this account',
        setup_pending: true,
        data: [],
      })
    }

    const positions = await getInvestorPositions(zohoPartnerId)
    return NextResponse.json({ data: positions })
  } catch (error) {
    console.error('[investor/positions] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch positions' },
      { status: 500 },
    )
  }
}
