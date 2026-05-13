import { NextResponse } from 'next/server'
import { getPortalContext } from '@/lib/auth'
import { getInvestorPositions } from '@/lib/zoho'

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

    // effectivePartnerId is the impersonated investor's id when an admin is
    // impersonating, otherwise the actor's own zoho_partner_id.
    const zohoPartnerId = ctx.effectivePartnerId
    if (!zohoPartnerId) {
      return NextResponse.json({
        error: 'No Zoho partner ID configured for this account',
        setup_pending: true,
        data: [],
      })
    }

    const positions = await getInvestorPositions(zohoPartnerId)
    return NextResponse.json({ data: positions })
  } catch (error) {
    console.error('[GET /api/portal/investor/positions]', new Date().toISOString(), error)
    return NextResponse.json(
      { error: "We couldn't load this data right now. Please try again in a moment.", code: 'ZOHO_UNAVAILABLE' },
      { status: 503 },
    )
  }
}
