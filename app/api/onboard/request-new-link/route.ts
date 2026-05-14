import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { findPartnerByMagicLinkToken } from '@/lib/zoho'

// POST /api/onboard/request-new-link
//
// Public route — the original (expired) token is in the body so we
// can route a Resend notification to Mike with a direct link to the
// Partner's detail page. Always returns 200 on the user-visible path,
// even when the token doesn't resolve to a known partner — we don't
// want to leak token existence to attackers.
export async function POST(req: NextRequest) {
  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }
    const { ref } = (body ?? {}) as { ref?: unknown }
    if (typeof ref !== 'string') {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }

    let partnerName = '(unknown)'
    let partnerEmail = '(unknown)'
    let partnerId: string | null = null

    if (/^[a-f0-9]{64}$/i.test(ref)) {
      try {
        const partner = await findPartnerByMagicLinkToken(ref)
        if (partner) {
          partnerName = partner.name ?? partnerName
          partnerEmail = partner.email ?? partnerEmail
          partnerId = partner.id
        }
      } catch (lookupErr) {
        // Log but don't surface — the user-visible flow still completes.
        console.error('[onboard/request-new-link] partner lookup failed', lookupErr)
      }
    }

    const adminLink = partnerId
      ? `${req.nextUrl.origin}/portal/admin/partners/${partnerId}`
      : `${req.nextUrl.origin}/portal/admin/partners`

    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'Fox Mortgage <noreply@app.foxmortgage.ca>',
        to: 'mfox@foxmortgage.ca',
        subject: `Expired onboarding link request from ${partnerName}`,
        text:
`${partnerName} (${partnerEmail}) tried to access an expired onboarding link and requested a new one.

Generate a new link from their partner detail page:
${adminLink}`,
      })
    } catch (mailErr) {
      console.error('[onboard/request-new-link] Resend send failed', mailErr)
      // Continue to 200 — the investor sees the same "got it" message
      // either way. Mike can monitor logs / Resend dashboard if
      // deliveries are dropping.
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[POST /api/onboard/request-new-link]', new Date().toISOString(), error)
    return NextResponse.json(
      { error: "We couldn't process that request right now. Please try again in a moment." },
      { status: 503 },
    )
  }
}
