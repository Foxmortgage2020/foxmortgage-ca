import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'

export async function POST(req: NextRequest) {
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

    const webhookUrl = process.env.FP_REFERRAL_WEBHOOK_URL
    if (webhookUrl) {
      const webhookRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fpName: user.fullName || `${user.firstName} ${user.lastName}`.trim(),
          fpEmail: user.emailAddresses[0]?.emailAddress,
          fpClerkId: user.id,
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
        console.error('[FP Referral] n8n webhook returned', webhookRes.status)
      }
    } else {
      // Webhook not yet configured — log for now
      console.log('[FP Referral] Webhook URL not set. Referral data:', {
        fpName: user.fullName,
        fpEmail: user.emailAddresses[0]?.emailAddress,
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
    console.error('[FP Referral Error]', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
