import { NextResponse } from 'next/server'
import { getPortalContext } from '@/lib/auth'
import { getMortgageAgentDashboardPayload } from '@/lib/zoho'

export async function GET() {
  try {
    const ctx = await getPortalContext()
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isMortgageAgent = ctx.actor.roles.includes('mortgage_agent')
    const isAdmin = ctx.actor.roles.includes('admin')
    if (!isMortgageAgent && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // effectiveMortgageAgentId is the impersonated partner's id when an admin
    // is impersonating a mortgage agent, otherwise the actor's own
    // mortgage_agent_zoho_id. Null means admin not-impersonating with no linked
    // mortgage-agent id — nothing to fetch.
    const mortgageAgentZohoId = ctx.effectiveMortgageAgentId
    if (!mortgageAgentZohoId) {
      return NextResponse.json({ error: 'No Zoho Partner ID linked to account.' }, { status: 400 })
    }

    // Single minimal-field Zoho call — never throws. Always returns a valid
    // payload so the dashboard can render its stat grid (with zeros if empty).
    const payload = await getMortgageAgentDashboardPayload(mortgageAgentZohoId)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('[GET /api/portal/mortgage-agent/dashboard]', new Date().toISOString(), error)
    return NextResponse.json(
      { error: "We couldn't load this data right now. Please try again in a moment.", code: 'ZOHO_UNAVAILABLE' },
      { status: 503 },
    )
  }
}
