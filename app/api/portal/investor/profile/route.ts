import { NextResponse } from 'next/server'
import { getPortalContext } from '@/lib/auth'
import { getPartner } from '@/lib/zoho'

// GET /api/portal/investor/profile
//
// Returns the Zoho Partner record for the actor (or, under admin
// impersonation, for the impersonated investor). The page that
// consumes this displays a read-only profile — there is intentionally
// no PATCH; profile updates go through Mike directly per CRM-of-record
// hygiene.
//
// Response shape:
//   200 { profile: PartnerProfile, actor: { email } }
//   400 { error, setup_pending: true }   no zoho_partner_id on the account
//   401 { error: 'Unauthorized' }
//   403 { error: 'Forbidden' }
//   404 { error: 'Profile not found' }   partner id present but no record
//   503 { error, code: 'ZOHO_UNAVAILABLE' }
export async function GET() {
  try {
    const ctx = await getPortalContext()
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isInvestor = ctx.actor.roles.includes('investor')
    const isAdmin = ctx.actor.roles.includes('admin')
    if (!isInvestor && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // effectivePartnerId is the impersonated investor's id when an admin
    // is impersonating, otherwise the actor's own zoho_partner_id.
    const partnerId = ctx.effectivePartnerId
    if (!partnerId) {
      return NextResponse.json(
        { error: 'No Zoho Partner ID configured for this account.', setup_pending: true },
        { status: 400 },
      )
    }

    const profile = await getPartner(partnerId)
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found.' }, { status: 404 })
    }

    return NextResponse.json({
      profile,
      actor: { email: ctx.actor.email },
    })
  } catch (error) {
    console.error('[GET /api/portal/investor/profile]', new Date().toISOString(), error)
    return NextResponse.json(
      { error: "We couldn't load this data right now. Please try again in a moment.", code: 'ZOHO_UNAVAILABLE' },
      { status: 503 },
    )
  }
}
