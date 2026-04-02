import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

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

    // ── Zoho CRM ──────────────────────────────────────────────────────────────
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
              Tag: [{ name: 'SMM Enrolled' }],
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

    // ── Resend notification ───────────────────────────────────────────────────
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'SMM Enrollment <noreply@app.foxmortgage.ca>',
        to: 'mfox@foxmortgage.ca',
        subject: `New SMM Enrollment — ${firstName} ${lastName}`,
        text: `New SMM enrollment received.

NAME: ${firstName} ${lastName}
EMAIL: ${email}
PHONE: ${phone || 'Not provided'}

PROPERTY
Type: ${propertyType}
City: ${city}, ${province}

MORTGAGE
Lender: ${currentLender}
Current Rate: ${currentRate}%
Rate Type: ${rateType}
Mortgage Amount: ${mortgageAmount}

RENEWAL
Month/Year: ${renewalMonth} ${renewalYear}

REFERRAL
Source: ${referralSource}
Name: ${referralName || 'N/A'}

Submitted: ${body.submittedAt}

---
OWNWELL ENTRY CHECKLIST
[ ] Add homeowner in Ownwell
[ ] Enter full property address
[ ] Set use type (Owner Occupied / Rental)
[ ] Enter original mortgage amount (exact $)
[ ] Enter closing/maturity date
[ ] Enter payment frequency
[ ] Enter amortization and term
[ ] Mark lead as Active in Zoho CRM`,
      })
    } catch (resendErr) {
      console.error('[SMM Enroll] Resend error (user still gets confirmation):', resendErr)
    }

    // ── Zoho Campaigns ────────────────────────────────────────────────────────
    try {
      const campaignsToken = await getZohoToken()
      const campaignsBody = new URLSearchParams({
        resfmt: 'JSON',
        listkey: '1588620000000211001',
        contactinfo: JSON.stringify({
          'Contact Email': email,
          'First Name': firstName,
          'Last Name': lastName,
        }),
      })
      console.log('[SMM Enroll] Zoho Campaigns request body:', campaignsBody.toString())
      const campaignsRes = await fetch(
        'https://campaigns.zoho.com/api/v1.1/json/listsubscribe',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Zoho-oauthtoken ${campaignsToken}`,
          },
          body: campaignsBody,
        }
      )
      const campaignsText = await campaignsRes.text()
      console.log('[SMM Enroll] Zoho Campaigns response:', campaignsRes.status, campaignsText)
      if (!campaignsRes.ok) {
        console.error('[SMM Enroll] Zoho Campaigns failed:', campaignsRes.status, campaignsText.substring(0, 300))
      }
    } catch (campaignsErr) {
      console.error('[SMM Enroll] Zoho Campaigns error (user still gets confirmation):', campaignsErr)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[SMM Enroll] Unhandled error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
