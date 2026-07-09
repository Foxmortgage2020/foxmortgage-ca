import { NextRequest, NextResponse } from 'next/server'
import { getPortalContext } from '@/lib/auth'
import { createZohoLead } from '@/lib/zoho'
import {
  EMAIL_RE,
  captureStatusLine,
  captureSubmission,
  markSubmission,
  notifyMichael,
  str,
} from '@/lib/form-intake'

// Partner-portal referral intake. Persist-first pipeline (lib/form-intake.ts)
// with partner attribution preserved end to end. Replaced the console.log
// stub that silently dropped every referral (hotfix 2026-07-09).
//
// Attribution notes:
// - The route is Clerk-public in middleware (posture unchanged), but this
//   handler requires a signed-in partner session and refuses to create an
//   unattributed referral.
// - The Zoho Leads module has NO Referral_Partner lookup (verified against
//   the live fields API 2026-07-09; the FP_* custom fields older docs
//   mention do not exist on Leads either). Attribution therefore rides in
//   the lead Description and on the form_submissions row; Michael links
//   Referral_Partner on the Potentials record at conversion, exactly like
//   the FP webhook flow.
// - Referral intake may later migrate to the n8n webhook path once the
//   partner referral workflows and their *_WEBHOOK_URL env vars exist; this
//   direct path works today without them.

export async function POST(req: NextRequest) {
  try {
    const ctx = await getPortalContext()
    if (!ctx) {
      return NextResponse.json({ error: 'Sign in to submit a referral.' }, { status: 401 })
    }

    // Resolve the referring partner. Honors admin impersonation (the
    // effective ids already reflect the impersonated partner).
    const partner = ctx.effectiveFpId
      ? { zohoId: ctx.effectiveFpId, role: 'financial-planner' }
      : ctx.effectiveRealtorId
        ? { zohoId: ctx.effectiveRealtorId, role: 'realtor' }
        : ctx.effectiveLawyerId
          ? { zohoId: ctx.effectiveLawyerId, role: 'lawyer' }
          : ctx.effectiveMortgageAgentId
            ? { zohoId: ctx.effectiveMortgageAgentId, role: 'mortgage-agent' }
            : null
    if (!partner) {
      // Never create an unattributed referral.
      return NextResponse.json(
        {
          error:
            'No partner profile is linked to this account, so the referral cannot be attributed. Contact Michael to link your profile.',
        },
        { status: 403 },
      )
    }
    const partnerName = ctx.impersonation?.partnerName ?? ctx.actor.email

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }

    const clientName = str(body.clientName, 200)
    const clientEmail = str(body.clientEmail, 320)
    const clientPhone = str(body.clientPhone, 50)
    const propertyType = str(body.propertyType, 100)
    // The form sends estimatedPrice; older callers sent purchasePrice.
    const estimatedPrice = str(body.estimatedPrice, 100) || str(body.purchasePrice, 100)
    const closingDate = str(body.closingDate, 50)
    const mortgageType = str(body.mortgageType, 100)
    const notes = str(body.notes, 5000)

    if (!clientName || !clientEmail) {
      return NextResponse.json({ error: 'Client name and email required' }, { status: 400 })
    }
    if (!EMAIL_RE.test(clientEmail)) {
      return NextResponse.json({ error: 'A valid client email is required.' }, { status: 400 })
    }

    // 1. Persist first, with the partner identity on the row.
    const capture = await captureSubmission({
      source: 'partner-referral',
      rawPayload: body,
      submitterName: clientName,
      submitterEmail: clientEmail,
      clerkUserId: ctx.actor.userId,
      partnerZohoId: partner.zohoId,
      partnerRole: partner.role,
    })

    // 2. Structured Zoho record (Leads module) with attribution in the
    // description (see header note on why not a lookup field).
    const attribution = `[PARTNER REFERRAL]
Referred by: ${partnerName} (${partner.role})
Partner Zoho ID: ${partner.zohoId}
Submitted by account: ${ctx.actor.email}${ctx.impersonation ? ' (admin impersonation)' : ''}`

    let zohoId: string | null = null
    let zohoError: string | null = null
    try {
      const res = await createZohoLead({
        Last_Name: clientName,
        Email: clientEmail,
        ...(clientPhone ? { Phone: clientPhone } : {}),
        Lead_Source: 'Partner Referral',
        Description: `${attribution}

Property Type: ${propertyType || 'Not specified'}
Estimated Price: ${estimatedPrice || 'Not specified'}
Closing Date: ${closingDate || 'Not specified'}
Mortgage Type: ${mortgageType || 'Not specified'}
Notes: ${notes || 'None'}`,
      })
      zohoId = res?.data?.[0]?.details?.id ?? null
      if (!zohoId) zohoError = 'Zoho returned no record id'
    } catch (err) {
      zohoError = err instanceof Error ? err.message.slice(0, 500) : 'Zoho create failed'
      console.error('[add-referral] Zoho lead create failed', zohoError)
    }
    if (capture.stored) {
      await markSubmission(
        capture.id,
        zohoId
          ? { processing_status: 'zoho_created', zoho_record_id: zohoId }
          : { processing_status: 'zoho_failed', error_detail: zohoError ?? 'unknown' },
      )
    }

    // 3. Notify Michael. Best-effort.
    const resendId = await notifyMichael({
      subject: `New partner referral: ${clientName} from ${partnerName}`,
      text: `New client referral through the partner portal:

Client: ${clientName}
Email: ${clientEmail}
Phone: ${clientPhone || '(not provided)'}
Property type: ${propertyType || '(not specified)'}
Estimated price: ${estimatedPrice || '(not specified)'}
Closing date: ${closingDate || '(not specified)'}
Mortgage type: ${mortgageType || '(not specified)'}

Notes:
${notes || '(none)'}

Referred by: ${partnerName} (${partner.role}, Zoho partner id ${partner.zohoId})

Zoho lead: ${captureStatusLine(zohoId, zohoError, capture)}
Submission id: ${capture.id}`,
    })
    if (capture.stored && resendId) {
      await markSubmission(capture.id, { resend_message_id: resendId })
    }

    // 4. Honest response.
    if (!capture.stored && !zohoId) {
      console.error('[add-referral] submission NOT captured anywhere', {
        storeError: capture.error,
        zohoError,
      })
      return NextResponse.json(
        {
          error:
            "We couldn't save the referral right now. Please try again or email mfox@foxmortgage.ca.",
        },
        { status: 503 },
      )
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Portal Referral Error]', error)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
