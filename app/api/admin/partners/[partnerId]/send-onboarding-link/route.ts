import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getPortalContext } from '@/lib/auth'
import { getPartner, updatePartner } from '@/lib/zoho'
import { rememberMagicLink } from '@/lib/cache'
import {
  generateMagicLinkToken,
  computeMagicLinkExpiry,
} from '@/lib/onboarding'

// POST /api/admin/partners/[partnerId]/send-onboarding-link
//
// Admin-only. Issues a new magic-link token to the partner, updates
// Onboarding_Stage to "Invited", and emails the investor the welcome
// link. Resending overrides any previous token (the old one is
// invalidated by being overwritten).
//
// Body: none.
// Response: { ok: true, email } on success.
export async function POST(
  _req: NextRequest,
  { params }: { params: { partnerId: string } },
) {
  try {
    const ctx = await getPortalContext()
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!ctx.actor.roles.includes('admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { partnerId } = params
    if (!partnerId || !/^\d{15,}$/.test(partnerId)) {
      return NextResponse.json({ error: 'Invalid partner id.' }, { status: 400 })
    }

    const partner = await getPartner(partnerId)
    if (!partner) {
      return NextResponse.json({ error: 'Partner not found.' }, { status: 404 })
    }
    if (!partner.email) {
      return NextResponse.json(
        { error: 'Partner has no email on file. Add an email in Zoho before sending.' },
        { status: 400 },
      )
    }
    // Only investors get the onboarding flow. Don't let admins
    // accidentally fire this on an FP or Realtor partner.
    if ((partner.partnerType ?? '').toLowerCase() !== 'investor') {
      return NextResponse.json(
        { error: 'Onboarding links are for Investor partners only.' },
        { status: 400 },
      )
    }

    // Generate token, set Zoho fields, advance stage. Magic_Link_Used_At
    // is cleared so a previously-redeemed-then-resent link is
    // re-usable (admin can override a stuck state).
    const token = generateMagicLinkToken()
    const expiresAt = computeMagicLinkExpiry()
    await updatePartner(partnerId, {
      Magic_Link_Token: token,
      Magic_Link_Expires_At: expiresAt,
      Magic_Link_Used_At: null,
      Onboarding_Stage: 'Invited',
    })

    // Read-after-write: populate the in-memory cache so the investor's
    // immediate click resolves before Zoho's search index catches up.
    rememberMagicLink(token, partnerId)

    // Build the magic link URL. Production base is foxmortgage.ca;
    // local dev would be http://localhost:3000 — derive from the
    // incoming request when available, falling back to the canonical
    // production URL so emails sent from any env land somewhere safe.
    const origin = _req.nextUrl.origin
    const link = `${origin}/onboard/investor/${token}`

    // Email send is best-effort but blocking — if Resend fails we
    // surface the error to the admin so they know the link wasn't
    // delivered. The Zoho update has already succeeded, so the admin
    // can resend without re-allocating a token.
    const firstName =
      partner.preferredName ||
      (partner.name ?? '').split(' ')[0] ||
      'there'

    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'Mike Fox <mike@app.foxmortgage.ca>',
        to: partner.email,
        replyTo: 'mfox@foxmortgage.ca',
        subject: 'Welcome to Fox Mortgage. Your investor onboarding link is ready.',
        text:
`Hi ${firstName},

Thanks for your interest in investing with Fox Mortgage. I've set up your secure onboarding link below.

Click here to get started: ${link}

The link is good for 14 days. You'll set a password on your first visit, and you can come back anytime to finish where you left off.

If you have any questions, just reply to this email.

Mike Fox
Mortgage Agent, Level 2
Fox Mortgage`,
      })
    } catch (mailErr) {
      console.error('[send-onboarding-link] Resend send failed', { partnerId, partnerEmail: partner.email }, mailErr)
      return NextResponse.json(
        {
          error: 'Link was stored on the partner record but the email failed to send. Try again to resend.',
          partnerId,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true, email: partner.email }, { status: 200 })
  } catch (error) {
    console.error(
      '[POST /api/admin/partners/[partnerId]/send-onboarding-link]',
      new Date().toISOString(),
      error,
    )
    return NextResponse.json(
      { error: "We couldn't load this data right now. Please try again in a moment.", code: 'ZOHO_UNAVAILABLE' },
      { status: 503 },
    )
  }
}
