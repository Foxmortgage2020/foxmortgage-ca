import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { dealId, investorName } = body

    if (!dealId) {
      return NextResponse.json({ error: 'Deal ID required' }, { status: 400 })
    }

    // TODO: Wire to Zoho CRM when credentials are added
    console.log('[Express Interest]', { dealId, investorName, timestamp: new Date().toISOString() })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Express Interest Error]', error)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
