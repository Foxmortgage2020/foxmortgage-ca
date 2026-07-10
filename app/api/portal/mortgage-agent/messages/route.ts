import { NextResponse } from 'next/server'
import { getPortalContext } from '@/lib/auth'
import { roleCan } from '@/config/authority'
import { getMortgageAgentMessages } from '@/lib/zoho'

export async function GET() {
  try {
    const ctx = await getPortalContext()
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isMortgageAgent = ctx.actor.roles.includes('mortgage_agent')
    // Session 8: the admin allowance is the portals.view-as capability, not a role literal.
    const isAdmin = roleCan(ctx.actor.roles, 'portals.view-as')
    if (!isMortgageAgent && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Pass the effective mortgage-agent partner id — getMortgageAgentMessages
    // resolves the thread from the Partners record internally, so under
    // impersonation we fetch the impersonated agent's messages, not the admin's.
    const mortgageAgentZohoId = ctx.effectiveMortgageAgentId
    if (!mortgageAgentZohoId) {
      // Admin not impersonating anyone — no mortgage-agent context, nothing to show.
      return NextResponse.json({ messages: [] })
    }

    const messages = await getMortgageAgentMessages(mortgageAgentZohoId)
    return NextResponse.json({ messages })
  } catch (error) {
    console.error('[GET /api/portal/mortgage-agent/messages]', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
