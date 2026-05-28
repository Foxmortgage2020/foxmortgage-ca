import { NextResponse } from 'next/server'
import { getPortalContext } from '@/lib/auth'
import { getRealtorDashboardPayload } from '@/lib/zoho'

export async function GET() {
  try {
    const ctx = await getPortalContext()
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isRealtor = ctx.actor.roles.includes('realtor')
    const isAdmin = ctx.actor.roles.includes('admin')
    if (!isRealtor && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // effectiveRealtorId is the impersonated partner's id when an admin is
    // impersonating a realtor, otherwise the actor's own realtor_zoho_id. Null
    // means admin not-impersonating with no linked realtor id — nothing to fetch.
    const realtorZohoId = ctx.effectiveRealtorId
    if (!realtorZohoId) {
      return NextResponse.json({ error: 'No Zoho Partner ID linked to account.' }, { status: 400 })
    }

    // Single minimal-field Zoho call — never throws. Always returns a valid
    // payload so the dashboard can render its stat grid (with zeros if empty).
    const payload = await getRealtorDashboardPayload(realtorZohoId)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('[GET /api/portal/realtor/dashboard]', new Date().toISOString(), error)
    return NextResponse.json(
      { error: "We couldn't load this data right now. Please try again in a moment.", code: 'ZOHO_UNAVAILABLE' },
      { status: 503 },
    )
  }
}
