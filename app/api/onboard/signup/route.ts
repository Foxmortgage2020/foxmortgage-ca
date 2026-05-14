import { NextRequest, NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { findPartnerByMagicLinkToken, updatePartner } from '@/lib/zoho'
import { forgetMagicLink } from '@/lib/cache'
import { isMagicLinkExpired, formatZohoDateTime } from '@/lib/onboarding'

// POST /api/onboard/signup
//
// Public route — the magic-link token IS the auth. Body:
//   { token: string, password: string }
//
// Flow:
//   1. Validate token + partner (re-check expiry; defense against
//      concurrent expiration between the welcome-page server load and
//      the form submit)
//   2. Create Clerk user via backend SDK with email pre-verified —
//      skips Clerk's own email_code verification because the magic
//      link already proved email control
//   3. Stamp the user's publicMetadata with zoho_partner_id + roles
//   4. Update Partner record: Magic_Link_Used_At = NOW,
//      Onboarding_Stage = "In Progress", Last_Onboarding_Step =
//      "Account Created"
//   5. Forget the magic-link hint so it can't be re-used
//
// Returns { ok: true, userId } on success. The client then signs the
// user in browser-side via useSignIn() to establish the session
// cookie.
export async function POST(req: NextRequest) {
  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
    }
    const { token, password } = (body ?? {}) as { token?: unknown; password?: unknown }

    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) {
      return NextResponse.json({ error: 'Invalid onboarding link.' }, { status: 400 })
    }
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
    }

    const partner = await findPartnerByMagicLinkToken(token)
    if (!partner) {
      return NextResponse.json({ error: 'Onboarding link is no longer valid.' }, { status: 400 })
    }
    if (isMagicLinkExpired(partner.magicLinkExpiresAt)) {
      return NextResponse.json({ error: 'This onboarding link has expired.' }, { status: 400 })
    }
    if (partner.magicLinkUsedAt) {
      return NextResponse.json(
        { error: 'This onboarding link has already been used. Please sign in instead.' },
        { status: 400 },
      )
    }
    if (!partner.email) {
      return NextResponse.json({ error: 'No email on file for this partner.' }, { status: 400 })
    }

    // Create the Clerk user with email pre-verified. The backend SDK
    // path skips email_code verification entirely; the resulting user
    // has a verified primary email and an immediately usable password.
    const client = await clerkClient()
    let clerkUserId: string
    try {
      const created = await client.users.createUser({
        emailAddress: [partner.email],
        password,
        skipPasswordChecks: false,
        skipPasswordRequirement: false,
        publicMetadata: {
          zoho_partner_id: partner.id,
          roles: ['investor'],
        },
      })
      clerkUserId = created.id
    } catch (clerkErr: any) {
      // Clerk surfaces structured errors. The most common one for
      // this flow is "email already taken" — when a Partner record
      // somehow shares an email with an existing Clerk account.
      const errors = clerkErr?.errors as Array<{ code?: string; message?: string }> | undefined
      const code = errors?.[0]?.code
      const message = errors?.[0]?.message
      if (code === 'form_identifier_exists') {
        return NextResponse.json(
          { error: 'An account already exists for this email. Please sign in instead.' },
          { status: 409 },
        )
      }
      if (code === 'form_password_pwned') {
        return NextResponse.json(
          { error: 'That password has appeared in a public breach. Please choose a different one.' },
          { status: 400 },
        )
      }
      console.error('[onboard/signup] Clerk createUser failed', clerkErr)
      return NextResponse.json(
        { error: message || 'Account creation failed. Please try again.' },
        { status: 400 },
      )
    }

    // Mark the Partner record as redeemed and advance the onboarding
    // stage. Failure here is logged but doesn't roll back the Clerk
    // user — the user can proceed to the hub, and Mike can manually
    // reconcile the Partner state if needed.
    try {
      await updatePartner(partner.id, {
        Magic_Link_Used_At: formatZohoDateTime(new Date()),
        Onboarding_Stage: 'In Progress',
        Last_Onboarding_Step: 'Account Created',
      })
    } catch (zohoErr) {
      console.error(
        '[onboard/signup] Clerk user created but Zoho update failed',
        { clerkUserId, partnerId: partner.id },
        zohoErr,
      )
    }

    forgetMagicLink(token)
    return NextResponse.json({ ok: true, userId: clerkUserId }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/onboard/signup]', new Date().toISOString(), error)
    return NextResponse.json(
      { error: "We couldn't load this data right now. Please try again in a moment.", code: 'ZOHO_UNAVAILABLE' },
      { status: 503 },
    )
  }
}
