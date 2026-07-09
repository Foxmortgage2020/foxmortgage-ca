import { NextRequest, NextResponse } from 'next/server'
import { createZohoLead } from '@/lib/zoho'
import {
  EMAIL_RE,
  captureStatusLine,
  captureSubmission,
  markSubmission,
  notifyMichael,
  str,
} from '@/lib/form-intake'

// Private-lending investor inquiry intake. Persist-first pipeline
// (lib/form-intake.ts): store the raw submission, then create the Zoho
// Lead, then email Michael, then answer honestly. Replaced the console.log
// stub that silently dropped every submission (hotfix 2026-07-09).

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }

    // Honeypot: the visible form never fills "company".
    if (str(body.company)) return NextResponse.json({ success: true })

    const firstName = str(body.firstName, 100)
    const lastName = str(body.lastName, 100)
    const email = str(body.email, 320)
    const phone = str(body.phone, 50)
    const capital = str(body.capital, 100)
    const position = str(body.position, 150)
    const vehicle = str(body.vehicle, 100)
    const message = str(body.message, 5000)

    if (!email || !firstName || !lastName) {
      return NextResponse.json({ error: 'Name and email required' }, { status: 400 })
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 })
    }

    const fullName = `${firstName} ${lastName}`

    // 1. Persist first.
    const capture = await captureSubmission({
      source: 'investor-inquiry',
      rawPayload: body,
      submitterName: fullName,
      submitterEmail: email,
    })

    // 2. Structured Zoho record (Leads module).
    let zohoId: string | null = null
    let zohoError: string | null = null
    try {
      const res = await createZohoLead({
        First_Name: firstName,
        Last_Name: lastName,
        Email: email,
        ...(phone ? { Phone: phone } : {}),
        Lead_Source: 'Private Lending Page',
        Description: `Capital: ${capital || 'Not specified'}
Position: ${position || 'Not specified'}
Vehicle: ${vehicle || 'Not specified'}

${message || '(no message)'}`,
      })
      zohoId = res?.data?.[0]?.details?.id ?? null
      if (!zohoId) zohoError = 'Zoho returned no record id'
    } catch (err) {
      zohoError = err instanceof Error ? err.message.slice(0, 500) : 'Zoho create failed'
      console.error('[investor-inquiry] Zoho lead create failed', zohoError)
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
      subject: `New investor inquiry from ${fullName}`,
      text: `New investor inquiry through /private-lending:

Name: ${fullName}
Email: ${email}
Phone: ${phone || '(not provided)'}
Approximate capital: ${capital || '(not selected)'}
Preferred position: ${position || '(not selected)'}
Investment vehicle: ${vehicle || '(not selected)'}

Message:
${message || '(no message)'}

Zoho lead: ${captureStatusLine(zohoId, zohoError, capture)}
Submission id: ${capture.id}`,
    })
    if (capture.stored && resendId) {
      await markSubmission(capture.id, { resend_message_id: resendId })
    }

    // 4. Honest response.
    if (!capture.stored && !zohoId) {
      console.error('[investor-inquiry] submission NOT captured anywhere', {
        storeError: capture.error,
        zohoError,
      })
      return NextResponse.json(
        {
          error:
            "We couldn't save your inquiry right now. Please email mfox@foxmortgage.ca and we'll reply within one business day.",
        },
        { status: 503 },
      )
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Investor Inquiry Error]', error)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
