import { NextRequest, NextResponse } from 'next/server'
import { getPortalContext } from '@/lib/auth'
import { getRealtorClientDetail } from '@/lib/zoho'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const { id } = params
    if (!id) {
      return NextResponse.json({ error: 'Deal ID required.' }, { status: 400 })
    }

    const client = await getRealtorClientDetail(id)
    if (!client) {
      return NextResponse.json({ error: 'Client not found.' }, { status: 404 })
    }

    // Ownership check — the requested deal must be attributed to the actor's
    // effective realtor id on EITHER the Realtor lookup (they're the attached
    // realtor on the deal) OR Referral_Partner (they referred it) — the same
    // union the client list query matches on. The `!!effectiveRealtorId` guard
    // denies a non-impersonating admin (no realtor_zoho_id → null), who must
    // impersonate to view a specific realtor's client, and prevents a null
    // effective id from matching a deal that happens to have neither field set.
    const effectiveRealtorId = ctx.effectiveRealtorId
    const ownsClient =
      !!effectiveRealtorId &&
      (client.realtorId === effectiveRealtorId ||
        client.referralPartnerId === effectiveRealtorId)
    if (!ownsClient) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You do not have access to this client.' },
        { status: 403 },
      )
    }

    // Surface whether the partner message write-path is live so the client
    // file can render a real send box vs a read-only "Message Michael" state.
    // Server-derived from the existing webhook env var — no client-readable env.
    const messagingEnabled = !!process.env.REALTOR_MESSAGE_WEBHOOK_URL

    return NextResponse.json({ client, messagingEnabled })
  } catch (error) {
    console.error('[GET /api/portal/realtor/clients/[id]]', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
