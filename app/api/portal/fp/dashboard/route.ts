import { NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { getFPClients, getFPDashboardStats } from '@/lib/zoho'

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

    // Fetch KPIs and recent clients in parallel
    const [stats, clients] = await Promise.all([
      getFPDashboardStats(fpZohoId),
      getFPClients(fpZohoId),
    ])

    // Build recent activity from the 4 most recently active deals
    const recent = [...clients]
      .sort((a, b) => {
        const da = a.lastActivity ? new Date(a.lastActivity).getTime() : 0
        const db = b.lastActivity ? new Date(b.lastActivity).getTime() : 0
        return db - da
      })
      .slice(0, 4)
      .map(c => ({
        client: c.contactName || c.dealName,
        dealId: c.id,
        stage: c.stage,
        lastActivity: c.lastActivity,
        savingsIdentified: c.savingsIdentified,
      }))

    return NextResponse.json({ stats, recent })
  } catch (error) {
    console.error('[GET /api/portal/fp/dashboard]', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
