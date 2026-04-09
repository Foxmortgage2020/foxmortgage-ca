import { NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { getFPClients } from '@/lib/zoho'

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

    const clients = await getFPClients(fpZohoId)
    return NextResponse.json({ clients })
  } catch (error) {
    console.error('[GET /api/portal/fp/clients]', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
