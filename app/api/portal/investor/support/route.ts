import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, email, subject, message } = body

    if (!email || !name) {
      return NextResponse.json({ error: 'Name and email required' }, { status: 400 })
    }

    // TODO: Wire to Zoho CRM when credentials are added
    console.log('[Investor Support]', { name, email, subject, message, timestamp: new Date().toISOString() })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Investor Support Error]', error)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
