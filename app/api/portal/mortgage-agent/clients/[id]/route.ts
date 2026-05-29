import { NextRequest, NextResponse } from 'next/server'
import { getPortalContext } from '@/lib/auth'
import { getMortgageAgentClientDetail, relationshipTagFor } from '@/lib/zoho'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getPortalContext()
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isMortgageAgent = ctx.actor.roles.includes('mortgage_agent')
    const isAdmin = ctx.actor.roles.includes('admin')
    if (!isMortgageAgent && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = params
    if (!id) {
      return NextResponse.json({ error: 'Deal ID required.' }, { status: 400 })
    }

    const client = await getMortgageAgentClientDetail(id)
    if (!client) {
      return NextResponse.json({ error: 'Client not found.' }, { status: 404 })
    }

    // Ownership check — the requested deal must be attributed to the actor's
    // effective mortgage-agent id via Referral_Partner (the same field the
    // client list query filters on). For a non-impersonating admin (no
    // mortgage_agent_zoho_id), effectiveMortgageAgentId is null and the check
    // correctly fails — admins should impersonate to view a specific agent's
    // client.
    if (client.referralPartnerId !== ctx.effectiveMortgageAgentId) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You do not have access to this client.' },
        { status: 403 },
      )
    }

    // Attach the per-deal relationship tag ("Referred by you") so the client
    // file renders the same chip the list shows. Computed server-side.
    client.relationshipTag = relationshipTagFor(client, ctx.effectiveMortgageAgentId)

    // Surface whether the partner message write-path is live so the client
    // file can render a real send box vs a read-only "Message Michael" state.
    // Server-derived from the existing webhook env var — no client-readable env.
    const messagingEnabled = !!process.env.MORTGAGE_AGENT_MESSAGE_WEBHOOK_URL

    return NextResponse.json({ client, messagingEnabled })
  } catch (error) {
    console.error('[GET /api/portal/mortgage-agent/clients/[id]]', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
