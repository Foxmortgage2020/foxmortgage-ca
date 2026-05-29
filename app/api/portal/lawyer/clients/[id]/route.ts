import { NextRequest, NextResponse } from 'next/server'
import { getPortalContext } from '@/lib/auth'
import { getLawyerClientDetail, relationshipTagFor } from '@/lib/zoho'

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

    // Ownership check — the requested deal must be attributed to the actor's
    // effective lawyer id on EITHER the Lawyer lookup (they're the attached
    // lawyer on the deal) OR Referral_Partner (they referred it) — the same
    // union the client list query matches on. The `!!effectiveLawyerId` guard
    // denies a non-impersonating admin (no lawyer_zoho_id → null), who must
    // impersonate to view a specific lawyer's client, and prevents a null
    // effective id from matching a deal that happens to have neither field set.
    const effectiveLawyerId = ctx.effectiveLawyerId
    const ownsClient =
      !!effectiveLawyerId &&
      (client.lawyerId === effectiveLawyerId ||
        client.referralPartnerId === effectiveLawyerId)
    if (!ownsClient) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You do not have access to this client.' },
        { status: 403 },
      )
    }

    // Attach the per-deal relationship tag for this viewer (attached lawyer,
    // referrer, or both) so the client file renders the same chip the list
    // shows. Computed server-side from the effective id.
    client.relationshipTag = relationshipTagFor(client, effectiveLawyerId)

    // Surface whether the partner message write-path is live so the client
    // file can render a real send box vs a read-only "Message Michael" state.
    // Server-derived from the existing webhook env var — no client-readable env.
    const messagingEnabled = !!process.env.LAWYER_MESSAGE_WEBHOOK_URL

    return NextResponse.json({ client, messagingEnabled })
  } catch (error) {
    console.error('[GET /api/portal/lawyer/clients/[id]]', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
