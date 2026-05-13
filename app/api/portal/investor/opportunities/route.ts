import { getPortalContext } from '@/lib/auth'
import { getInvestorOpportunities } from '@/lib/zoho'

export async function GET() {
  try {
    const ctx = await getPortalContext()
    if (!ctx) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isInvestor = ctx.actor.roles.includes('investor')
    const isAdmin = ctx.actor.roles.includes('admin')
    if (!isInvestor && !isAdmin) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Cached for 5 min per lib/cache.ts — first request hits Zoho,
    // subsequent investor dashboard + opportunities loads within the
    // window are served from memory.
    const records = await getInvestorOpportunities()
    return Response.json({ data: records })
  } catch (error) {
    console.error('[GET /api/portal/investor/opportunities]', new Date().toISOString(), error)
    return Response.json({ data: [] })
  }
}
