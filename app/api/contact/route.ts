import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, email, phone, message, interest } = body

    if (!email || !name) {
      return NextResponse.json({ error: 'Name and email required' }, { status: 400 })
    }

    // TODO: Replace console.log with Zoho CRM call
    console.log('[Contact Form]', { name, email, phone, interest, message, timestamp: new Date().toISOString() })

    // When ready, uncomment:
    // const { createZohoLead } = await import('@/lib/zoho')
    // await createZohoLead({
    //   Last_Name: name,
    //   Email: email,
    //   Phone: phone,
    //   Lead_Source: 'Website',
    //   Description: `Interest: ${interest}\n\n${message}`,
    // })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Contact Error]', error)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
