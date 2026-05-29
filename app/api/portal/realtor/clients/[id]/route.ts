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
    // effective realtor id via Referral_Partner (the same field the client
    // list query filters on). The legacy Realtor lookup is never populated, so
    // gating on it 403'd every real deal. For a non-impersonating admin (no
    // realtor_zoho_id), effectiveRealtorId is null and the check correctly
    // fails — admins should impersonate to view a specific realtor's client.
    if (client.referralPartnerId !== ctx.effectiveRealtorId) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You do not have access to this client.' },
        { status: 403 },
      )
    }

    return NextResponse.json({ client })
  } catch (error) {
    console.error('[GET /api/portal/realtor/clients/[id]]', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
