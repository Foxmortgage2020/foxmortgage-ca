import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { firstName, lastName, email, phone, capital, position, vehicle, message } = body

    if (!email || !firstName || !lastName) {
      return NextResponse.json({ error: 'Name and email required' }, { status: 400 })
    }

    // TODO: Replace console.log with Zoho CRM call
    console.log('[Investor Inquiry]', {
      firstName,
      lastName,
      email,
      phone,
      capital,
      position,
      vehicle,
      message,
      timestamp: new Date().toISOString(),
    })

    // When ready, uncomment:
    // const { createZohoLead } = await import('@/lib/zoho')
    // await createZohoLead({
    //   First_Name: firstName,
    //   Last_Name: lastName,
    //   Email: email,
    //   Phone: phone,
    //   Lead_Source: 'Private Lending Page',
    //   Description: `Capital: ${capital}\nPosition: ${position}\nVehicle: ${vehicle}\n\n${message}`,
    // })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Investor Inquiry Error]', error)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
