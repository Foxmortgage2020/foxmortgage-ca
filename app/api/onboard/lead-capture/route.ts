import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createPartner } from '@/lib/zoho'

// POST /api/onboard/lead-capture
//
// Public route. Creates a Zoho Partner at Onboarding_Stage="Lead" and
// emails Mike a notification with a link to the new partner's admin
// detail page. The investor sees a confirmation message client-side
// after a 201; they're NOT automatically sent an onboarding link —
// Mike gates that manually via the admin button on the detail page.

interface LeadCaptureBody {
  fullName?: string
  email?: string
  phone?: string
  investmentVehicle?: string
  approxAmount?: string
  referralSource?: string
  message?: string
}

// Allowed values. Mirror the picklist on Partners (Investment_Vehicle,
// Referral_Source_Type). Approximate-amount is freeform but coerced
// to one of the five buckets the form offers.
const ALLOWED_VEHICLES = new Set([
  'Personal', 'Corporation', 'Trust', 'Joint', 'Registered Account',
])
const ALLOWED_SOURCES = new Set([
  'Google', 'Referral', 'Social Media', 'Event', 'Existing Client', 'Other',
])
const ALLOWED_AMOUNTS = new Set([
  'Under $100K', '$100K - $250K', '$250K - $500K', '$500K - $1M', 'Over $1M',
])

export async function POST(req: NextRequest) {
  try {
    let body: LeadCaptureBody
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
    }

    const fullName = (body.fullName ?? '').trim()
    const email = (body.email ?? '').trim()
    const phone = (body.phone ?? '').trim()
    const investmentVehicle = (body.investmentVehicle ?? '').trim()
    const approxAmount = (body.approxAmount ?? '').trim()
    const referralSource = (body.referralSource ?? '').trim()
    const message = (body.message ?? '').trim()

    if (!fullName) return NextResponse.json({ error: 'Full name is required.' }, { status: 400 })
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 })
    }
    if (!phone) return NextResponse.json({ error: 'Phone number is required.' }, { status: 400 })
    if (!ALLOWED_VEHICLES.has(investmentVehicle)) {
      return NextResponse.json({ error: 'Please pick an investment vehicle.' }, { status: 400 })
    }
    if (!ALLOWED_AMOUNTS.has(approxAmount)) {
      return NextResponse.json({ error: 'Please pick an approximate amount.' }, { status: 400 })
    }
    if (!ALLOWED_SOURCES.has(referralSource)) {
      return NextResponse.json({ error: 'Please pick a referral source.' }, { status: 400 })
    }
    if (message.length > 500) {
      return NextResponse.json({ error: 'Message must be 500 characters or fewer.' }, { status: 400 })
    }

    // Approximate-amount has no dedicated Zoho field today (the
    // existing Total_Available_To_Lend is a currency, not a range
    // bucket). Stash it in Brokerage_Notes with a clear prefix so
    // Mike sees it on review. Same for the optional message.
    const notesLines = [`[LEAD INTAKE] Approx amount: ${approxAmount}`]
    if (message) notesLines.push('', '[LEAD MESSAGE]', message)
    const brokerageNotes = notesLines.join('\n')

    // Create the Partner record.
    let partnerId: string
    try {
      partnerId = await createPartner({
        Name: fullName,
        Email: email,
        Phone: phone,
        Partner_Type: 'Investor',
        Partner_Status: 'Prospect',
        Onboarding_Stage: 'Lead',
        Investment_Vehicle: investmentVehicle,
        Referral_Source_Type: referralSource,
        Brokerage_Notes: brokerageNotes,
      })
    } catch (zohoErr) {
      console.error('[lead-capture] createPartner failed', zohoErr)
      return NextResponse.json(
        {
          error: "We couldn't save your inquiry right now. Please email mfox@foxmortgage.ca and we'll get back to you within one business day.",
        },
        { status: 503 },
      )
    }

    // Notify Mike. Best-effort — the investor confirmation doesn't
    // depend on this succeeding (the Partner record is already
    // created), so a Resend failure shouldn't block the response.
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const adminLink = `${req.nextUrl.origin}/portal/admin/partners/${partnerId}`
      await resend.emails.send({
        from: 'Fox Mortgage <noreply@app.foxmortgage.ca>',
        to: 'mfox@foxmortgage.ca',
        subject: `New investor lead: ${fullName} interested in ${approxAmount}`,
        text:
`New investor lead came in through /private-lending:

Name: ${fullName}
Email: ${email}
Phone: ${phone}
Investment Vehicle: ${investmentVehicle}
Approximate Amount: ${approxAmount}
Heard about us via: ${referralSource}

Message:
${message || '(no message)'}

Review and decide whether to send an onboarding link:
${adminLink}`,
      })
    } catch (mailErr) {
      console.error('[lead-capture] Resend notification failed (partner already created)', { partnerId }, mailErr)
    }

    // Pull first name for the confirmation copy.
    const firstName = fullName.split(' ')[0]
    return NextResponse.json({ ok: true, partnerId, firstName }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/onboard/lead-capture]', new Date().toISOString(), error)
    return NextResponse.json(
      { error: "We couldn't process that request right now. Please try again in a moment." },
      { status: 503 },
    )
  }
}
