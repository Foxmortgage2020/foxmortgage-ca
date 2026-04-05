import { NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { getFPClients } from '@/lib/zoho'

export async function GET() {
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

    const fpEmail = user.emailAddresses[0]?.emailAddress
    if (!fpEmail) {
      return NextResponse.json({ error: 'No email on account.' }, { status: 400 })
    }

    const clients = await getFPClients(fpEmail)
    return NextResponse.json({ clients })
  } catch (error) {
    console.error('[GET /api/portal/fp/clients]', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
