import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { clientName, clientEmail, clientPhone, propertyType, purchasePrice, closingDate, mortgageType, notes } = body

    if (!clientName || !clientEmail) {
      return NextResponse.json({ error: 'Client name and email required' }, { status: 400 })
    }

    // TODO: Wire to Zoho CRM createLead() when credentials are added
    console.log('[Portal Referral]', {
      clientName,
      clientEmail,
      clientPhone,
      propertyType,
      purchasePrice,
      closingDate,
      mortgageType,
      notes,
      timestamp: new Date().toISOString(),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Portal Referral Error]', error)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
