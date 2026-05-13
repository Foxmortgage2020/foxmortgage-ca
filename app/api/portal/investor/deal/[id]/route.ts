import { NextResponse } from 'next/server'
import { getPortalContext } from '@/lib/auth'
import { getInvestorDeal } from '@/lib/zoho'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
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

    const deal = await getInvestorDeal(params.id)
    if (!deal) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 })
    }

    // Ownership check — the requested deal's Investor_Name lookup (a Partners
    // record) must match the actor's effectivePartnerId. For a non-impersonating
    // admin (no zoho_partner_id), effectivePartnerId is null and the check
    // correctly fails — admins must impersonate to view a specific investor's deal.
    const investorIdOnDeal =
      typeof deal.Investor_Name === 'object' ? deal.Investor_Name?.id : null
    if (investorIdOnDeal !== ctx.effectivePartnerId) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You do not have access to this deal.' },
        { status: 403 },
      )
    }

    return NextResponse.json({ data: deal })
  } catch (error) {
    console.error('[GET /api/portal/investor/deal/[id]]', new Date().toISOString(), error)
    return NextResponse.json(
      { error: "We couldn't load this data right now. Please try again in a moment.", code: 'ZOHO_UNAVAILABLE' },
      { status: 503 },
    )
  }
}
