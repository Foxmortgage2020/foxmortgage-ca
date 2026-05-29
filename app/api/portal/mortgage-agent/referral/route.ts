import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { getPortalContext, isImpersonating } from '@/lib/auth'

export async function POST(req: NextRequest) {
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

    // Write-block under impersonation — admins viewing as a mortgage agent must
    // NOT submit referrals that appear to come from the agent.
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
    const {
      clientName,
      clientEmail,
      clientPhone,
      propertyType,
      estimatedValue,
      closingDate,
      mortgageType,
      notes,
    } = body

    if (!clientName || !clientEmail) {
      return NextResponse.json({ error: 'Client name and email are required.' }, { status: 400 })
    }

    // Read actor profile fields ONLY (display/payload). The auth and
    // impersonation gate above this point uses getPortalContext().
    // Do not derive partner identity from this call — it returns the
    // signed-in user, never the impersonated partner.
    const user = await currentUser()
    const md = (user?.publicMetadata ?? {}) as { mortgage_agent_name?: string; mortgage_agent_firm?: string }
    const fullName = user?.fullName || `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || ctx.actor.email

    const webhookUrl = process.env.MORTGAGE_AGENT_REFERRAL_WEBHOOK_URL
    if (webhookUrl) {
      const webhookRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentName: md.mortgage_agent_name || fullName,
          agentFirm: md.mortgage_agent_firm || '',
          agentEmail: ctx.actor.email,
          agentClerkId: ctx.actor.userId,
          clientName,
          clientEmail,
          clientPhone: clientPhone || '',
          propertyType: propertyType || '',
          estimatedValue: estimatedValue || '',
          closingDate: closingDate || '',
          mortgageType: mortgageType || '',
          notes: notes || '',
          submittedAt: new Date().toISOString(),
        }),
      })

      if (!webhookRes.ok) {
        console.error('[Mortgage Agent Referral] n8n webhook returned', webhookRes.status)
      }
    } else {
      // Webhook not yet configured — log for now
      console.log('[Mortgage Agent Referral] Webhook URL not set. Referral data:', {
        agentName: md.mortgage_agent_name || fullName,
        agentFirm: md.mortgage_agent_firm || '',
        agentEmail: ctx.actor.email,
        clientName,
        clientEmail,
        clientPhone,
        propertyType,
        estimatedValue,
        closingDate,
        mortgageType,
        notes,
        submittedAt: new Date().toISOString(),
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Mortgage Agent Referral Error]', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
