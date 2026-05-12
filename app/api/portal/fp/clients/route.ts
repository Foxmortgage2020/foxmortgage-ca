import { NextResponse } from 'next/server'
import { getPortalContext } from '@/lib/auth'
import { getFPClients, ZohoError } from '@/lib/zoho'

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

    const fpZohoId = ctx.effectiveFpId
    if (!fpZohoId) {
      return NextResponse.json({ error: 'No Zoho Partner ID linked to account.' }, { status: 400 })
    }

    const clients = await getFPClients(fpZohoId)
    return NextResponse.json({ clients })
  } catch (error) {
    console.error('[GET /api/portal/fp/clients]', error)
    if (error instanceof ZohoError) {
      return NextResponse.json(
        { error: 'Zoho CRM query failed.', zohoStatus: error.status, zohoBody: error.body.substring(0, 500) },
        { status: 502 },
      )
    }
    const message = error instanceof Error ? error.message : 'Something went wrong.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
