import { NextResponse } from 'next/server'
import { getPortalContext } from '@/lib/auth'
import { getFPMessages } from '@/lib/zoho'

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

    // Pass the effective FP partner id — getFPMessages resolves the email
    // from the Partners record internally, so under impersonation we fetch
    // the impersonated FP's messages, not the admin's.
    const fpZohoId = ctx.effectiveFpId
    if (!fpZohoId) {
      // Admin not impersonating anyone — no FP context, nothing to show.
      return NextResponse.json({ messages: [] })
    }

    const messages = await getFPMessages(fpZohoId)
    return NextResponse.json({ messages })
  } catch (error) {
    console.error('[GET /api/portal/fp/messages]', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
