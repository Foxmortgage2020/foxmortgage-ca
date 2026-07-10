// GET /api/portal/admin/agent/conversations (Agent session): the history
// list for the Ask Fox surface. A reviewable trail is the point.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { listConversations } from '@/lib/agent/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await apiPermission('agent.use')
  if (!gate.ok) {
    return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  }
  const res = await listConversations()
  if (!res.configured) {
    return NextResponse.json({ ok: false, message: 'Conversation store not configured.' }, { status: 503 })
  }
  if (!res.ok) {
    return NextResponse.json({ ok: false, message: res.error }, { status: 502 })
  }
  return NextResponse.json({ ok: true, data: res.data })
}
