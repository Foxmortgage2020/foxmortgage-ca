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
  // leadType selects the capture branch. "financial-planner-prospect"
  // (or "fp") routes to the FP prospect path; absent or anything else
  // preserves the original investor private-lending path unchanged.
  leadType?: string
  fullName?: string
  email?: string
  phone?: string
  investmentVehicle?: string
  approxAmount?: string
  referralSource?: string
  message?: string
  // FP-prospect-only fields (read only on the FP branch).
  firm?: string
  source?: string
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

    // FP prospect capture (partner lead-gen engine, LEADGEN.md §8). Additive
    // branch, taken only when leadType marks a Financial Planner prospect.
    // The investor path below is intentionally left byte-for-byte unchanged.
    const leadType = (body.leadType ?? '').trim().toLowerCase()
    if (leadType === 'financial-planner-prospect' || leadType === 'fp') {
      return await createFpProspectLead(req, body)
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

// FP prospect capture for the partner lead-gen engine (LEADGEN.md §8).
// Creates a Zoho Partner with Partner_Type "Financial Planner Prospect", an
// existing picklist value that getPartnerConfigByZohoType() resolves to the
// "fp" kind, so conversion is later a single field flip to "Financial
// Planner" plus Send Portal Invite, with no schema change. The source is a
// free-text campaign tag (no new Zoho field). Created_Time auto-populates.
async function createFpProspectLead(req: NextRequest, body: LeadCaptureBody) {
  const fullName = (body.fullName ?? '').trim()
  const email = (body.email ?? '').trim()
  const phone = (body.phone ?? '').trim()
  const firm = (body.firm ?? '').trim()
  const source = (body.source ?? '').trim()
  const message = (body.message ?? '').trim()

  if (!fullName) return NextResponse.json({ error: 'Full name is required.' }, { status: 400 })
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 })
  }
  // Phone is optional for FP prospects: capture only what is conspicuously
  // published (LEADGEN.md §8). Firm and source are likewise optional.
  if (message.length > 500) {
    return NextResponse.json({ error: 'Message must be 500 characters or fewer.' }, { status: 400 })
  }

  // Firm and the campaign source tag have no dedicated Zoho field, so record
  // them in Brokerage_Notes for review. The source tag is also written to
  // the free-text Referral_Source_Name so it stays filterable on the record.
  const notesLines = ['[FP PROSPECT INTAKE]']
  if (firm) notesLines.push(`Firm: ${firm}`)
  if (source) notesLines.push(`Source: ${source}`)
  if (message) notesLines.push('', '[FP PROSPECT MESSAGE]', message)
  const brokerageNotes = notesLines.join('\n')

  // Create the prospect Partner record.
  let partnerId: string
  try {
    partnerId = await createPartner({
      Name: fullName,
      Email: email,
      ...(phone ? { Phone: phone } : {}),
      Partner_Type: 'Financial Planner Prospect',
      Partner_Status: 'Prospect',
      Onboarding_Stage: 'Lead',
      ...(source ? { Referral_Source_Name: source } : {}),
      Brokerage_Notes: brokerageNotes,
    })
  } catch (zohoErr) {
    console.error('[lead-capture:fp] createPartner failed', zohoErr)
    return NextResponse.json(
      {
        error: "We couldn't save your details right now. Please email mfox@foxmortgage.ca and we'll get back to you within one business day.",
      },
      { status: 503 },
    )
  }

  // Notify Mike. Best-effort, mirrors the investor path: the prospect record
  // is already created, so a Resend failure must not fail the response.
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const adminLink = `${req.nextUrl.origin}/portal/admin/partners/${partnerId}`
    await resend.emails.send({
      from: 'Fox Mortgage <noreply@app.foxmortgage.ca>',
      to: 'mfox@foxmortgage.ca',
      subject: `New Financial Planner prospect: ${fullName}${firm ? ` (${firm})` : ''}`,
      text:
`New Financial Planner prospect captured through the partner lead-gen engine:

Name: ${fullName}
Firm: ${firm || '(not provided)'}
Email: ${email}
Phone: ${phone || '(not provided)'}
Source: ${source || '(not provided)'}

Message:
${message || '(no message)'}

Review, then flip Partner_Type to "Financial Planner" and Send Portal Invite to convert:
${adminLink}`,
    })
  } catch (mailErr) {
    console.error('[lead-capture:fp] Resend notification failed (prospect already created)', { partnerId }, mailErr)
  }

  const firstName = fullName.split(' ')[0]
  return NextResponse.json({ ok: true, partnerId, firstName }, { status: 201 })
}
