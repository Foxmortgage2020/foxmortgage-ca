import { NextRequest, NextResponse } from 'next/server'
import { getPortalContext, isImpersonating } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const ctx = await getPortalContext()
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isInvestor = ctx.actor.roles.includes('investor')
    const isAdmin = ctx.actor.roles.includes('admin')
    if (!isInvestor && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Write-block under impersonation — pre-emptive even though the route is
    // a stub today. When this is wired to Zoho, the block prevents an admin
    // viewing as an investor from filing support tickets as that investor.
    if (await isImpersonating()) {
      return NextResponse.json(
        {
          error: 'ImpersonationReadOnly',
          message: 'This action is blocked because you are viewing this portal in impersonation mode. Exit impersonation to take admin actions.',
        },
        { status: 403 },
      )
    }

    const body = await req.json()
    const { name, email, subject, message } = body

    if (!email || !name) {
      return NextResponse.json({ error: 'Name and email required' }, { status: 400 })
    }

    // TODO: Wire to Zoho CRM when credentials are added
    console.log('[Investor Support]', { name, email, subject, message, timestamp: new Date().toISOString() })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Investor Support Error]', error)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
