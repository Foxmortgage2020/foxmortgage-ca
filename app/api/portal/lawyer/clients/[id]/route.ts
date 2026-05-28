import { NextRequest, NextResponse } from 'next/server'
import { getPortalContext } from '@/lib/auth'
import { getLawyerClientDetail } from '@/lib/zoho'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const { id } = params
    if (!id) {
      return NextResponse.json({ error: 'Deal ID required.' }, { status: 400 })
    }

    const client = await getLawyerClientDetail(id)
    if (!client) {
      return NextResponse.json({ error: 'Client not found.' }, { status: 404 })
    }

    // Ownership check — the requested client must be linked to the actor's
    // effective lawyer id. For a non-impersonating admin (no lawyer_zoho_id),
    // effectiveLawyerId is null and the check correctly fails — admins should
    // impersonate to view a specific lawyer's client.
    if (client.lawyerId !== ctx.effectiveLawyerId) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You do not have access to this client.' },
        { status: 403 },
      )
    }

    return NextResponse.json({ client })
  } catch (error) {
    console.error('[GET /api/portal/lawyer/clients/[id]]', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
