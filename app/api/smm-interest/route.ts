import { NextRequest, NextResponse } from 'next/server'
import {
  EMAIL_RE,
  alertSubmissionFailure,
  captureSubmission,
  notifyMichael,
  str,
} from '@/lib/form-intake'

// The homepage "Start Monitoring" CTA (app/page.tsx).
//
// THE BUG THIS FIXES (B0, 2026-07-27): that CTA is a native HTML form and
// pointed at /api/smm-enroll, whose handler opens with `await req.json()`.
// A native form POSTs application/x-www-form-urlencoded, so req.json() threw
// a SyntaxError on every submission, the outer catch turned it into a 500,
// and the visitor was navigated off the homepage onto a raw JSON error page.
// /api/smm-enroll also has no capture step, so the email was never written
// anywhere. It also requires firstName and lastName, which this CTA does not
// collect, so even a parsed body would have 400'd. The CTA never worked.
//
// This route accepts BOTH encodings, captures the email before doing anything
// else, and then sends the visitor into the full wizard with the address
// prefilled. The wizard creates the authoritative Zoho record with its CASL
// consent; this row is the guarantee that the address is never lost if they
// abandon it.

export const dynamic = 'force-dynamic'

// The wizard reads this on mount and clears it. Same-origin, short-lived, and
// deliberately NOT a query parameter: an email address must not land in a URL,
// where it would be captured by server logs, browser history, and referrers.
const PREFILL_COOKIE = 'smm_prefill_email'
const PREFILL_MAX_AGE = 900 // 15 minutes

// A native form navigation gets a redirect; a fetch caller gets JSON.
function replyRedirect(req: NextRequest, email: string) {
  const dest = req.nextUrl.clone()
  dest.pathname = '/smm/enroll'
  dest.search = ''
  const res = NextResponse.redirect(dest, 303)
  res.cookies.set(PREFILL_COOKIE, email, {
    httpOnly: false, // the wizard is a client component and reads this
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: PREFILL_MAX_AGE,
    path: '/',
  })
  return res
}

export async function POST(req: NextRequest) {
  // Read the body under BOTH encodings. A native <form method="POST"> sends
  // urlencoded; a fetch caller sends JSON. Getting this wrong is the whole
  // reason the CTA was dropping submissions, so it is handled explicitly.
  let body: Record<string, unknown> = {}
  let wasForm = false
  const contentType = req.headers.get('content-type') ?? ''
  try {
    if (contentType.includes('application/json')) {
      body = (await req.json()) as Record<string, unknown>
    } else {
      wasForm = true
      const fd = await req.formData()
      body = Object.fromEntries(Array.from(fd.entries()).map(([k, v]) => [k, typeof v === 'string' ? v : '']))
    }
  } catch {
    // An unreadable body is the one case with nothing to capture.
    if (wasForm) return replyRedirect(req, '')
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  // Honeypot: the visible form never fills "company". Pretend success, store
  // nothing. Same convention as the other three public forms.
  if (str(body.company)) {
    return wasForm ? replyRedirect(req, '') : NextResponse.json({ success: true })
  }

  const email = str(body.email, 320)
  if (!email || !EMAIL_RE.test(email)) {
    if (wasForm) {
      // Never strand a visitor on an error page. Send them to the wizard,
      // which asks for the address again and validates it inline.
      return replyRedirect(req, '')
    }
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 })
  }

  // 1. Persist first. Nothing below this line can lose the address.
  const capture = await captureSubmission({
    source: 'smm-interest',
    rawPayload: body,
    submitterEmail: email,
  })

  // 2. No Zoho write here, by design: this is one bare email with no name and
  //    no CASL express consent, so it cannot be enrolled yet. Creating a
  //    nameless Lead on every homepage click would fragment attribution
  //    against the record the wizard is about to create. The row plus the
  //    notification below are the guarantee; the wizard does the enrolling.
  //    Rows from this source therefore stay at 'received'.

  // 3. Tell Michael a hand went up. Best-effort; the row already holds it.
  await notifyMichael({
    subject: `Homepage monitoring request from ${email}`,
    text: `Someone asked to have their mortgage monitored, from the homepage CTA.

Email: ${email}

They have been sent to the enrollment wizard with this address prefilled. If
no enrollment follows, they started and did not finish, so this address is
worth a personal reply.

Submission id: ${capture.id}
Stored: ${capture.stored ? 'yes' : `NO (${capture.error})`}`,
  })

  // 4. A failed capture is a real operational failure. Say so the same day.
  if (!capture.stored) {
    await alertSubmissionFailure({
      source: 'smm-interest',
      submissionId: capture.id,
      error: capture.error,
      submitterEmail: email,
      captured: false,
    })
  }

  // 5. Send them on. The visitor never sees a failure here: their address is
  //    held (or alerted on), and the wizard is where the enrollment completes.
  if (wasForm) return replyRedirect(req, email)
  return NextResponse.json({ success: true, next: '/smm/enroll' })
}
