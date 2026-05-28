import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { getPortalContext, isImpersonating } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const ctx = await getPortalContext()
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isRealtor = ctx.actor.roles.includes('realtor')
    const isAdmin = ctx.actor.roles.includes('admin')
    if (!isRealtor && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Write-block under impersonation — admins viewing as a realtor must NOT
    // submit referrals that appear to come from the realtor.
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
    const md = (user?.publicMetadata ?? {}) as { realtor_name?: string; realtor_firm?: string }
    const fullName = user?.fullName || `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || ctx.actor.email

    const webhookUrl = process.env.REALTOR_REFERRAL_WEBHOOK_URL
    if (webhookUrl) {
      const webhookRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          realtorName: md.realtor_name || fullName,
          realtorFirm: md.realtor_firm || '',
          realtorEmail: ctx.actor.email,
          realtorClerkId: ctx.actor.userId,
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
        console.error('[Realtor Referral] n8n webhook returned', webhookRes.status)
      }
    } else {
      // Webhook not yet configured — log for now
      console.log('[Realtor Referral] Webhook URL not set. Referral data:', {
        realtorName: md.realtor_name || fullName,
        realtorFirm: md.realtor_firm || '',
        realtorEmail: ctx.actor.email,
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
    console.error('[Realtor Referral Error]', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
