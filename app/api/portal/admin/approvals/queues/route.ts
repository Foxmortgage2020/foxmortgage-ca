// Fresh approvals queue snapshot for post-decision reconciliation. The
// desk updates optimistically, then refetches here so the UI always ends
// on what the workbench actually holds.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { getApprovalsData } from '@/lib/approvals-data'
import { getAgentIdByEmail } from '@/lib/underwriting'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'

export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await apiPermission('approvals.view')
  if (!gate.ok) {
    return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  }
  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  if (!agentRes.configured || !agentRes.ok) {
    return NextResponse.json({ ok: false, message: 'Workbench not available' }, { status: 503 })
  }
  const data = await getApprovalsData(agentRes.data)
  return NextResponse.json({ ok: true, data })
}
