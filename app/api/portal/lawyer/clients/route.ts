import { NextResponse } from 'next/server'
import { getPortalContext } from '@/lib/auth'
import { roleCan } from '@/config/authority'
import { getLawyerClients } from '@/lib/zoho'

export async function GET() {
  try {
    const ctx = await getPortalContext()
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isLawyer = ctx.actor.roles.includes('lawyer')
    // Session 8: the admin allowance is the portals.view-as capability, not a role literal.
    const isAdmin = roleCan(ctx.actor.roles, 'portals.view-as')
    if (!isLawyer && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const lawyerZohoId = ctx.effectiveLawyerId
    if (!lawyerZohoId) {
      return NextResponse.json({ error: 'No Zoho Partner ID linked to account.' }, { status: 400 })
    }

    const clients = await getLawyerClients(lawyerZohoId)
    return NextResponse.json({ clients })
  } catch (error) {
    console.error('[GET /api/portal/lawyer/clients]', new Date().toISOString(), error)
    return NextResponse.json(
      { error: "We couldn't load this data right now. Please try again in a moment.", code: 'ZOHO_UNAVAILABLE' },
      { status: 503 },
    )
  }
}
