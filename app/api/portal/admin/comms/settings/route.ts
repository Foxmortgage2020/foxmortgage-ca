// The client-comms settings surface reads its state here (comms.decide, admin).
// Returns the master switch (fail-closed: absent row = OFF), the caps, the CASL
// mailing address, and the suppression list — all read-only from the workbench
// via portal_readonly. Writes go through the gate at .../gates/comms/settings.
import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { getAgentIdByEmail, getCommsSettings } from '@/lib/underwriting'
import { deriveCommsSettings } from '@/lib/comms'

export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await apiPermission('comms.decide')
  if (!gate.ok) {
    return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  }
  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  const agentId = agentRes.configured && agentRes.ok ? agentRes.data : null
  if (!agentRes.configured) {
    return NextResponse.json({ ok: true, configured: false })
  }
  if (!agentId) {
    return NextResponse.json({ ok: false, message: 'Workbench is configured but not answering.' }, { status: 503 })
  }
  const res = await getCommsSettings(agentId)
  if (!res.configured) return NextResponse.json({ ok: true, configured: false })
  if (!res.ok) return NextResponse.json({ ok: false, message: res.error }, { status: 502 })
  const derived = deriveCommsSettings(res.data.settings)
  return NextResponse.json({
    ok: true,
    configured: true,
    commsEnabled: derived.commsEnabled,
    hasSettingsRow: derived.hasSettingsRow,
    mailingAddress: derived.mailingAddress,
    maxPerDay: derived.maxPerDay,
    maxPerWeek: derived.maxPerWeek,
    suppressions: res.data.suppressions,
  })
}
