import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getPortalContext } from '@/lib/auth'
import { getPartner, updatePartner } from '@/lib/zoho'
import { rememberMagicLink } from '@/lib/cache'
import {
  generateMagicLinkToken,
  computeMagicLinkExpiry,
} from '@/lib/onboarding'
import { getPartnerConfigByZohoType } from '@/lib/partner-types'

// POST /api/admin/partners/[partnerId]/send-portal-invite
//
// Admin-only. Issues a magic-link invite for a *partner* (FP / Realtor /
// Lawyer). Sibling of /send-onboarding-link, which is investor-only and
// stays untouched. Investors that get sent here are bounced back with a
// helpful error directing the admin to the investor route.
//
// Differs from the investor route in three places that the gate-lift
// investigation (May 28, 2026) flagged as silent breaks if shared:
//   1. The magic link URL — partners land at /onboard/partner/...,
//      NOT /onboard/investor/...
//   2. The email copy — generic partner template, no "investing"
//      language.
//   3. (Downstream, in the signup route) Clerk publicMetadata uses the
//      per-type metadata key resolved from PARTNER_TYPE_CONFIGS, never
//      a hardcoded zoho_partner_id.
//
// The magic-link primitives, Zoho Magic_Link_* fields, and
// Onboarding_Stage='Invited' write are identical to the investor route —
// those layers are partner-type-agnostic.
//
// Body: none.
// Response: { ok: true, email, kind } on success.
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

    // Resolve config by Partner_Type. Unknown / unsupported types
    // (e.g. 'Lender', 'Underwriter', 'Insurance Advisor' — no portal
    // today) → reject with a clear error so we don't silently issue
    // a link that nobody can use.
    const config = getPartnerConfigByZohoType(partner.partnerType)
    if (!config) {
      return NextResponse.json(
        {
          error: 'UnsupportedPartnerType',
          message: `No portal exists for Partner_Type '${partner.partnerType ?? '<unset>'}'. Set the Partner_Type in Zoho to a supported value (Financial Planner, Realtor, Lawyer) before inviting.`,
        },
        { status: 400 },
      )
    }

    // Investors have their own multi-step onboarding flow at
    // /onboard/investor. This route is for the non-investor partner
    // types — bounce the admin to the right place rather than letting
    // the wrong shape leak through.
    if (!config.usesPartnerOnboarding) {
      return NextResponse.json(
        {
          error: 'WrongOnboardingFlow',
          message: 'Investor partners use a separate onboarding flow. Call /api/admin/partners/{id}/send-onboarding-link instead.',
        },
        { status: 400 },
      )
    }

    // Token + Zoho write — identical to the investor route. These
    // fields and the Onboarding_Stage='Invited' value are
    // partner-type-agnostic. Magic_Link_Used_At is cleared so a
    // re-send invalidates a previously-redeemed-then-resent link.
    const token = generateMagicLinkToken()
    const expiresAt = computeMagicLinkExpiry()
    await updatePartner(partnerId, {
      Magic_Link_Token: token,
      Magic_Link_Expires_At: expiresAt,
      Magic_Link_Used_At: null,
      Onboarding_Stage: 'Invited',
    })

    rememberMagicLink(token, partnerId)

    // Partner landing route — NOT the investor /onboard/investor/...
    // URL. The partner welcome page validates the (partnerId, token)
    // pair against Zoho directly (same shared primitive the investor
    // page uses) and posts to /api/onboard/partner/signup.
    const origin = _req.nextUrl.origin
    const link = `${origin}/onboard/partner/${partnerId}/${token}`

    const firstName =
      partner.preferredName ||
      (partner.name ?? '').split(' ')[0] ||
      'there'

    // Friendly singular label for the partner kind, used in the email
    // body. The label stays generic ("partner portal") to keep one
    // template across all kinds — per-kind copy variations are an
    // easy follow-up via this same config map.
    const kindLabel =
      config.kind === 'fp' ? 'Financial Planner'
      : config.kind === 'realtor' ? 'Realtor'
      : config.kind === 'lawyer' ? 'Lawyer'
      : 'Partner'

    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'Mike Fox <mike@app.foxmortgage.ca>',
        to: partner.email,
        replyTo: 'mfox@foxmortgage.ca',
        subject: 'Welcome to the Fox Mortgage partner portal.',
        text:
`Hi ${firstName},

Thanks for partnering with Fox Mortgage. I've set up your secure portal access below — you'll be able to track every client mortgage file you've referred or that you're working on with us, see real-time stage updates, and message me directly when you need to.

Click here to get started: ${link}

The link is good for 14 days. You'll set a password on your first visit, and you can come back anytime.

If you have any questions, just reply to this email.

Mike Fox
Mortgage Agent, Level 2
Fox Mortgage`,
      })
    } catch (mailErr) {
      console.error('[send-portal-invite] Resend send failed', { partnerId, partnerEmail: partner.email }, mailErr)
      return NextResponse.json(
        {
          error: 'Link was stored on the partner record but the email failed to send. Try again to resend.',
          partnerId,
        },
        { status: 500 },
      )
    }

    return NextResponse.json(
      { ok: true, email: partner.email, kind: config.kind, kindLabel },
      { status: 200 },
    )
  } catch (error) {
    console.error(
      '[POST /api/admin/partners/[partnerId]/send-portal-invite]',
      new Date().toISOString(),
      error,
    )
    return NextResponse.json(
      { error: "We couldn't load this data right now. Please try again in a moment.", code: 'ZOHO_UNAVAILABLE' },
      { status: 503 },
    )
  }
}
