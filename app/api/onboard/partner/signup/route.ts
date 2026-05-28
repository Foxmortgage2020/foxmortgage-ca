import { NextRequest, NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { findPartnerByIdAndMagicLinkToken, updatePartner } from '@/lib/zoho'
import { forgetMagicLink } from '@/lib/cache'
import { isMagicLinkExpired, formatZohoDateTime } from '@/lib/onboarding'
import { getPartnerConfigByZohoType } from '@/lib/partner-types'

// POST /api/onboard/partner/signup
//
// Public route — the (partnerId, token) pair IS the auth. Body:
//   { partnerId: string, token: string, password: string }
//
// Sibling of /api/onboard/signup (investor). Differences:
//   1. Resolves the partner's PartnerTypeConfig and sets the CORRECT
//      Clerk metadata key per type — never hardcodes zoho_partner_id /
//      roles=['investor']. This is the fix for the silent-break the
//      gate-lift investigation found.
//   2. Sets Onboarding_Stage='Active' on signup. Partners don't have
//      the multi-step state machine investors do (no Investment Funds /
//      Olympia Setup / etc.), so we skip 'In Progress' and go straight
//      to Active. Last_Onboarding_Step is intentionally left untouched
//      to avoid implying a state machine that doesn't apply.
//   3. Returns redirectTo = config.portalDashboard so the client can
//      land the partner directly in their portal.
//
// The investor route remains untouched.
export async function POST(req: NextRequest) {
  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
    }
    const { partnerId, token, password } = (body ?? {}) as {
      partnerId?: unknown
      token?: unknown
      password?: unknown
    }

    if (typeof partnerId !== 'string' || !/^\d{15,19}$/.test(partnerId)) {
      return NextResponse.json({ error: 'Invalid onboarding link.' }, { status: 400 })
    }
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) {
      return NextResponse.json({ error: 'Invalid onboarding link.' }, { status: 400 })
    }
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
    }

    const partner = await findPartnerByIdAndMagicLinkToken(partnerId, token)
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

    // Resolve config — the source of truth for per-type metadata key
    // and post-signup destination. Investors and unsupported types
    // are rejected here so the partner flow can never silently apply
    // investor-shaped state to a non-investor record.
    const config = getPartnerConfigByZohoType(partner.partnerType)
    if (!config) {
      return NextResponse.json(
        { error: 'This partner has no supported portal type. Please contact mfox@foxmortgage.ca.' },
        { status: 400 },
      )
    }
    if (!config.usesPartnerOnboarding) {
      return NextResponse.json(
        { error: 'Investor onboarding uses a different flow. Please use the link in your invitation email.' },
        { status: 400 },
      )
    }

    // Build the per-type publicMetadata block. The metadata key (one
    // of fp_zoho_id / realtor_zoho_id / lawyer_zoho_id) is picked
    // from the config — NEVER hardcoded. This is the difference that
    // makes lifting the gate safe.
    const publicMetadata: Record<string, unknown> = {
      roles: [config.clerkRole],
      [config.clerkMetadataKey]: partner.id,
    }

    const client = await clerkClient()
    let clerkUserId: string
    try {
      const created = await client.users.createUser({
        emailAddress: [partner.email],
        password,
        skipPasswordChecks: false,
        skipPasswordRequirement: false,
        publicMetadata,
      })
      clerkUserId = created.id
    } catch (clerkErr: any) {
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
      console.error('[onboard/partner/signup] Clerk createUser failed', clerkErr)
      return NextResponse.json(
        { error: message || 'Account creation failed. Please try again.' },
        { status: 400 },
      )
    }

    // Mark the Partner record as redeemed. Onboarding_Stage jumps
    // straight to 'Active' — partners don't have the multi-step
    // investor flow that uses 'In Progress'.
    try {
      await updatePartner(partner.id, {
        Magic_Link_Used_At: formatZohoDateTime(new Date()),
        Onboarding_Stage: 'Active',
      })
    } catch (zohoErr) {
      console.error(
        '[onboard/partner/signup] Clerk user created but Zoho update failed',
        { clerkUserId, partnerId: partner.id, kind: config.kind },
        zohoErr,
      )
    }

    forgetMagicLink(token)
    return NextResponse.json(
      {
        ok: true,
        userId: clerkUserId,
        kind: config.kind,
        redirectTo: config.portalDashboard,
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('[POST /api/onboard/partner/signup]', new Date().toISOString(), error)
    return NextResponse.json(
      { error: "We couldn't load this data right now. Please try again in a moment.", code: 'ZOHO_UNAVAILABLE' },
      { status: 503 },
    )
  }
}
