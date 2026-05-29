import { NextRequest, NextResponse } from 'next/server'
import { getPortalContext } from '@/lib/auth'
import { getFPClientDetail } from '@/lib/zoho'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const { id } = params
    if (!id) {
      return NextResponse.json({ error: 'Deal ID required.' }, { status: 400 })
    }

    const client = await getFPClientDetail(id)
    if (!client) {
      return NextResponse.json({ error: 'Client not found.' }, { status: 404 })
    }

    // Ownership check — the requested client must be linked to the actor's
    // effective FP id. For a non-impersonating admin (no fp_zoho_id),
    // effectiveFpId is null and the check correctly fails — admins should
    // impersonate to view a specific FP's client.
    if (client.referralPartnerId !== ctx.effectiveFpId) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You do not have access to this client.' },
        { status: 403 },
      )
    }

    // Surface whether the partner message write-path is live so the client
    // file can render a real send box vs a read-only "Message Michael" state.
    // Server-derived from the existing webhook env var — no client-readable env.
    const messagingEnabled = !!process.env.FP_MESSAGE_WEBHOOK_URL

    return NextResponse.json({ client, messagingEnabled })
  } catch (error) {
    console.error('[GET /api/portal/fp/clients/[id]]', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
