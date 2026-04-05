import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { getFPClientDetail } from '@/lib/zoho'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await currentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const metadata = user.publicMetadata as { roles?: string[] }
    const roles = metadata?.roles || []
    if (!roles.includes('financial-planner') && !roles.includes('admin')) {
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

    return NextResponse.json({ client })
  } catch (error) {
    console.error('[GET /api/portal/fp/clients/[id]]', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
