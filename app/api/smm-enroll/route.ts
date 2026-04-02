import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

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

    // ── n8n → Zoho CRM ───────────────────────────────────────────────────────
    // n8n receives this payload and creates a Lead in Zoho CRM
    try {
      const n8nBase = process.env.N8N_BASE_URL ?? 'https://foxmortgage.app.n8n.cloud'
      const n8nRes = await fetch(`${n8nBase}/webhook/smm-enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          phone: phone ?? '',
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
          referralName: referralName ?? '',
          source: body.source ?? 'smm-enroll-wizard',
          submittedAt: body.submittedAt,
        }),
      })
      if (!n8nRes.ok) {
        const text = await n8nRes.text()
        console.error('[SMM Enroll] n8n webhook failed:', n8nRes.status, text.substring(0, 300))
      }
    } catch (n8nErr) {
      console.error('[SMM Enroll] n8n error (user still gets confirmation):', n8nErr)
    }

    // ── Resend notification ───────────────────────────────────────────────────
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'SMM Enrollment <noreply@app.foxmortgage.ca>',
        to: 'mfox@foxmortgage.ca',
        subject: `New SMM Enrollment — ${firstName} ${lastName}`,
        text: `New Strategic Mortgage Monitoring enrollment received.

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
STRATEGIC MORTGAGE MONITORING ENTRY CHECKLIST
[ ] Verify lead created in Zoho CRM via n8n
[ ] Confirm lead source = Website - SMM Wizard
[ ] Review property and mortgage details
[ ] Mark lead as Active in Zoho CRM`,
      })
    } catch (resendErr) {
      console.error('[SMM Enroll] Resend error (user still gets confirmation):', resendErr)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[SMM Enroll] Unhandled error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
