// Unassigned calls (CC-03, 2026-07-29). The queue of calls the pipeline could
// not identify, with the context that actually jogs a memory — the stored
// summary and the redacted transcript — which the Zoho record does not show.
//
// Read-only server component: the list comes through the portal_readonly
// wrapper. Every write happens in the client component, through the Gates API.

import { requirePermission } from '@/lib/authz'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { getAgentIdByEmail, getUnresolvedCalls } from '@/lib/underwriting'
import CallResolver from '@/components/admin/CallResolver'

export const dynamic = 'force-dynamic'

export default async function UnassignedCallsPage() {
  await requirePermission('calls.resolve')

  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  const agentId = agentRes.configured && agentRes.ok ? agentRes.data : null
  const res = agentId ? await getUnresolvedCalls(agentId) : null

  if (!res || !res.configured) {
    return (
      <main className="p-6">
        <h1 className="font-heading text-navy text-xl">Unassigned calls</h1>
        <p className="mt-3 text-sm text-cool-600">
          The workbench is not connected, so the call queue cannot be read.
        </p>
      </main>
    )
  }
  if (!res.ok) {
    return (
      <main className="p-6">
        <h1 className="font-heading text-navy text-xl">Unassigned calls</h1>
        <p className="mt-3 text-sm text-cool-600">
          The call queue could not be read right now. {res.error}
        </p>
      </main>
    )
  }

  return (
    <main className="p-6">
      <h1 className="font-heading text-navy text-xl">Unassigned calls</h1>
      <p className="mt-1 text-sm text-cool-600">
        Calls the pipeline could not put a name to. Say who it was in your own words; you will see
        what that produced before anything is written.
      </p>
      <CallResolver calls={res.data} />
    </main>
  )
}
