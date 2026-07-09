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

// Public contact form intake. Persist-first pipeline (lib/form-intake.ts):
// store the raw submission, then create the Zoho Lead, then email Michael,
// then answer honestly. Replaced the console.log stub that silently dropped
// every submission (hotfix 2026-07-09).

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }

    // Honeypot: the visible form never fills "company". A value here means a
    // bot; pretend success and store nothing.
    if (str(body.company)) return NextResponse.json({ success: true })

    const name = str(body.name, 200)
    const email = str(body.email, 320)
    const phone = str(body.phone, 50)
    const interest = str(body.interest, 100)
    const message = str(body.message, 5000)

    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email required' }, { status: 400 })
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 })
    }

    // 1. Persist first. Nothing below this line can lose the submission.
    const capture = await captureSubmission({
      source: 'contact',
      rawPayload: body,
      submitterName: name,
      submitterEmail: email,
    })

    // 2. Structured Zoho record (Leads module).
    let zohoId: string | null = null
    let zohoError: string | null = null
    try {
      const res = await createZohoLead({
        Last_Name: name,
        Email: email,
        ...(phone ? { Phone: phone } : {}),
        Lead_Source: 'Website',
        Description: `Interest: ${interest || 'General Inquiry'}\n\n${message || '(no message)'}`,
      })
      zohoId = res?.data?.[0]?.details?.id ?? null
      if (!zohoId) zohoError = 'Zoho returned no record id'
    } catch (err) {
      zohoError = err instanceof Error ? err.message.slice(0, 500) : 'Zoho create failed'
      console.error('[contact] Zoho lead create failed', zohoError)
    }
    if (capture.stored) {
      await markSubmission(
        capture.id,
        zohoId
          ? { processing_status: 'zoho_created', zoho_record_id: zohoId }
          : { processing_status: 'zoho_failed', error_detail: zohoError ?? 'unknown' },
      )
    }

    // 3. Notify Michael. Best-effort; the submission is already captured.
    const resendId = await notifyMichael({
      subject: `New contact form message from ${name}`,
      text: `New message through the foxmortgage.ca contact form:

Name: ${name}
Email: ${email}
Phone: ${phone || '(not provided)'}
Interested in: ${interest || 'General Inquiry'}

Message:
${message || '(no message)'}

Zoho lead: ${captureStatusLine(zohoId, zohoError, capture)}
Submission id: ${capture.id}`,
    })
    if (capture.stored && resendId) {
      await markSubmission(capture.id, { resend_message_id: resendId })
    }

    // 4. Honest response: success only if the submission is durably held in
    // at least one place.
    if (!capture.stored && !zohoId) {
      console.error('[contact] submission NOT captured anywhere', {
        storeError: capture.error,
        zohoError,
      })
      return NextResponse.json(
        {
          error:
            "We couldn't save your message right now. Please email mfox@foxmortgage.ca and we'll reply within one business day.",
        },
        { status: 503 },
      )
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Contact Error]', error)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
