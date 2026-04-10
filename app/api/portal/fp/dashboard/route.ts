import { NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { getFPDashboardPayload } from '@/lib/zoho'

export async function GET() {
  try {
    const user = await currentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const metadata = user.publicMetadata as { roles?: string[]; fp_zoho_id?: string }
    const roles = metadata?.roles || []
    if (!roles.includes('financial-planner') && !roles.includes('admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const fpZohoId = metadata?.fp_zoho_id
    if (!fpZohoId) {
      return NextResponse.json({ error: 'No Zoho Partner ID linked to account.' }, { status: 400 })
    }

    // Single minimal-field Zoho call — never throws. Always returns a valid
    // payload so the dashboard can render its stat grid (with zeros if empty).
    const payload = await getFPDashboardPayload(fpZohoId)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('[GET /api/portal/fp/dashboard]', error)
    const message = error instanceof Error ? error.message : 'Something went wrong.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
