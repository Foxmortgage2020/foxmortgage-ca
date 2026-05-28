import { NextResponse } from 'next/server'
import { getPortalContext } from '@/lib/auth'
import { getRealtorMessages } from '@/lib/zoho'

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
