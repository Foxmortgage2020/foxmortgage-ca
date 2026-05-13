import { NextResponse } from 'next/server'
import { getPortalContext } from '@/lib/auth'
import { getFPDashboardPayload } from '@/lib/zoho'

export async function GET() {
  try {
    const ctx = await getPortalContext()
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isFP = ctx.actor.roles.includes('financial-planner')
    const isAdmin = ctx.actor.roles.includes('admin')
    if (!isFP && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // effectiveFpId is the impersonated partner's id when an admin is
    // impersonating an FP, otherwise the actor's own fp_zoho_id. Null
    // means admin not-impersonating with no linked FP id — nothing to fetch.
    const fpZohoId = ctx.effectiveFpId
    if (!fpZohoId) {
      return NextResponse.json({ error: 'No Zoho Partner ID linked to account.' }, { status: 400 })
    }

    // Single minimal-field Zoho call — never throws. Always returns a valid
    // payload so the dashboard can render its stat grid (with zeros if empty).
    const payload = await getFPDashboardPayload(fpZohoId)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('[GET /api/portal/fp/dashboard]', new Date().toISOString(), error)
    return NextResponse.json(
      { error: "We couldn't load this data right now. Please try again in a moment.", code: 'ZOHO_UNAVAILABLE' },
      { status: 503 },
    )
  }
}
