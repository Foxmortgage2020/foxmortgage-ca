import { NextResponse } from 'next/server'
import { getPortalContext } from '@/lib/auth'
import { getRealtorClients } from '@/lib/zoho'

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

    const realtorZohoId = ctx.effectiveRealtorId
    if (!realtorZohoId) {
      return NextResponse.json({ error: 'No Zoho Partner ID linked to account.' }, { status: 400 })
    }

    const clients = await getRealtorClients(realtorZohoId)
    return NextResponse.json({ clients })
  } catch (error) {
    console.error('[GET /api/portal/realtor/clients]', new Date().toISOString(), error)
    return NextResponse.json(
      { error: "We couldn't load this data right now. Please try again in a moment.", code: 'ZOHO_UNAVAILABLE' },
      { status: 503 },
    )
  }
}
