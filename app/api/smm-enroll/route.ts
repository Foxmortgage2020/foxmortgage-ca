import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, email, source = 'website' } = body

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 })
    }

    // TODO: Replace console.log with Zoho CRM call
    // See lib/zoho.ts for the helper function
    console.log('[SMM Enroll]', { name, email, source, timestamp: new Date().toISOString() })

    // When ready, uncomment:
    // const { createZohoLead } = await import('@/lib/zoho')
    // await createZohoLead({
    //   Last_Name: name || email,
    //   Email: email,
    //   Lead_Source: 'Website',
    //   Description: `SMM enrollment from ${source}`,
    // })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[SMM Enroll Error]', error)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
