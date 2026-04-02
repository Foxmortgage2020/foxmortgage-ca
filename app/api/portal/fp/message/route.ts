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
    const { body: messageBody, context, clientId } = body

    if (!messageBody?.trim()) {
      return NextResponse.json({ error: 'Message body is required.' }, { status: 400 })
    }

    const webhookUrl = process.env.FP_MESSAGE_WEBHOOK_URL
    if (webhookUrl) {
      const webhookRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fpName: user.fullName || `${user.firstName} ${user.lastName}`.trim(),
          fpEmail: user.emailAddresses[0]?.emailAddress,
          fpClerkId: user.id,
          messageBody,
          context: context || 'general',
          clientId: clientId || null,
          sentAt: new Date().toISOString(),
        }),
      })

      if (!webhookRes.ok) {
        console.error('[FP Message] n8n webhook returned', webhookRes.status)
      }
    } else {
      // Webhook not yet configured — log for now
      console.log('[FP Message] Webhook URL not set. Message data:', {
        fpName: user.fullName,
        fpEmail: user.emailAddresses[0]?.emailAddress,
        messageBody,
        context: context || 'general',
        clientId: clientId || null,
        sentAt: new Date().toISOString(),
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[FP Message Error]', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
