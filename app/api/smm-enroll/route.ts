import { NextRequest, NextResponse } from 'next/server'

async function getZohoToken(): Promise<string> {
  const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: process.env.ZOHO_REFRESH_TOKEN!,
      client_id: process.env.ZOHO_CLIENT_ID!,
      client_secret: process.env.ZOHO_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!data.access_token) {
    throw new Error(`Zoho token error: ${JSON.stringify(data)}`)
  }
  return data.access_token
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      firstName,
      lastName,
      email,
      phone,
      propertyType,
      city,
      province,
      currentLender,
      currentRate,
      rateType,
      mortgageAmount,
      renewalMonth,
      renewalYear,
      referralSource,
      referralName,
    } = body

    if (!firstName || !lastName || !email) {
      return NextResponse.json(
        { error: 'First name, last name, and email are required' },
        { status: 400 }
      )
    }

    const description = [
      `Property: ${propertyType} in ${city}, ${province}`,
      `Lender: ${currentLender} | Rate: ${currentRate}% ${rateType}`,
      `Mortgage: ${mortgageAmount} | Renewal: ${renewalMonth} ${renewalYear}`,
      `Referred by: ${referralSource}${referralName ? ' — ' + referralName : ''}`,
    ].join('\n')

    console.log('[SMM Enroll]', {
      firstName,
      lastName,
      email,
      description,
      submittedAt: body.submittedAt,
    })

    try {
      const token = await getZohoToken()
      const zohoRes = await fetch('https://www.zohoapis.com/crm/v2/Leads', {
        method: 'POST',
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: [
            {
              First_Name: firstName,
              Last_Name: lastName,
              Email: email,
              Phone: phone ?? '',
              Lead_Source: 'Website - SMM Wizard',
              Description: description,
            },
          ],
        }),
      })
      if (!zohoRes.ok) {
        const text = await zohoRes.text()
        console.error('[SMM Enroll] Zoho write failed:', zohoRes.status, text.substring(0, 300))
      }
    } catch (zohoErr) {
      console.error('[SMM Enroll] Zoho error (user still gets confirmation):', zohoErr)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[SMM Enroll] Unhandled error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
