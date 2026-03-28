import { auth } from '@clerk/nextjs/server'
import { getInvestorPositions } from '@/lib/zoho'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const { userId, sessionClaims } = auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const zohoPartnerId = (sessionClaims?.publicMetadata as any)?.zoho_partner_id as string | undefined
    if (!zohoPartnerId) {
      return NextResponse.json({ error: 'No Zoho partner ID in user metadata', setup_required: true }, { status: 400 })
    }

    const positions = await getInvestorPositions(zohoPartnerId)
    return NextResponse.json({ data: positions })
  } catch (error) {
    console.error('[investor/positions] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch positions' },
      { status: 500 }
    )
  }
}
