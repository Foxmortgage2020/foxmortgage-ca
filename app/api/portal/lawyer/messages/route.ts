import { NextResponse } from 'next/server'
import { getPortalContext } from '@/lib/auth'
import { getLawyerMessages } from '@/lib/zoho'

export async function GET() {
  try {
    const ctx = await getPortalContext()
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isLawyer = ctx.actor.roles.includes('lawyer')
    const isAdmin = ctx.actor.roles.includes('admin')
    if (!isLawyer && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Pass the effective lawyer partner id — getLawyerMessages resolves the
    // email from the Partners record internally, so under impersonation we
    // fetch the impersonated lawyer's messages, not the admin's.
    const lawyerZohoId = ctx.effectiveLawyerId
    if (!lawyerZohoId) {
      // Admin not impersonating anyone — no lawyer context, nothing to show.
      return NextResponse.json({ messages: [] })
    }

    const messages = await getLawyerMessages(lawyerZohoId)
    return NextResponse.json({ messages })
  } catch (error) {
    console.error('[GET /api/portal/lawyer/messages]', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
