import { NextResponse } from 'next/server'
import { getPortalContext } from '@/lib/auth'
import { roleCan } from '@/config/authority'
import { getRealtorMessages } from '@/lib/zoho'

export async function GET() {
  try {
    const ctx = await getPortalContext()
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isRealtor = ctx.actor.roles.includes('realtor')
    // Session 8: the admin allowance is the portals.view-as capability, not a role literal.
    const isAdmin = roleCan(ctx.actor.roles, 'portals.view-as')
    if (!isRealtor && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Pass the effective realtor partner id — getRealtorMessages resolves the
    // email from the Partners record internally, so under impersonation we
    // fetch the impersonated realtor's messages, not the admin's.
    const realtorZohoId = ctx.effectiveRealtorId
    if (!realtorZohoId) {
      // Admin not impersonating anyone — no realtor context, nothing to show.
      return NextResponse.json({ messages: [] })
    }

    const messages = await getRealtorMessages(realtorZohoId)
    return NextResponse.json({ messages })
  } catch (error) {
    console.error('[GET /api/portal/realtor/messages]', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
