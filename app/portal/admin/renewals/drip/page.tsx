// The Renewal Drip approval desk (2026-07-16). Per-message approval: each
// pending touch renders its full draft with per-sentence provenance; Approve
// sends (mode-gated workbench-side, ships off), Edit supersedes, Skip cancels
// one touch. Sequence states listed below the queue. Demo mode: canned
// fixtures, zero reads, every write DemoWriteBlocked.

import Link from 'next/link'
import { can, requirePermission } from '@/lib/authz'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { getAgentIdByEmail, getRenewalDripQueue, getRenewalSequenceStates } from '@/lib/underwriting'
import { isDemoMode } from '@/lib/demo'
import RenewalDripQueue from '@/components/admin/RenewalDripQueue'

export const dynamic = 'force-dynamic'

export default async function RenewalDripPage() {
  const user = await requirePermission('renewals.view')
  const canDecide = can(user, 'renewal.decide')
  const demo = isDemoMode()

  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  const agentId = agentRes.configured && agentRes.ok ? agentRes.data : null
  const queueRes = agentId ? await getRenewalDripQueue(agentId) : demo ? await getRenewalDripQueue('demo') : null
  const statesRes = agentId ? await getRenewalSequenceStates(agentId) : demo ? await getRenewalSequenceStates('demo') : null
  const queue = queueRes && queueRes.configured && queueRes.ok ? queueRes.data : []
  const states = statesRes && statesRes.configured && statesRes.ok ? statesRes.data : []
  const active = states.filter((s) => s.status === 'active')

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-xl font-display font-bold text-cool-800">Renewal Drip</h1>
          <Link href="/portal/admin/renewals" className="text-xs font-semibold text-cool-600 underline decoration-cool-300 hover:decoration-cool-600">
            Renewal Radar
          </Link>
        </div>
        <p className="mt-1 text-sm text-cool-500 font-ui">
          Every message is drafted from the client&rsquo;s own record and waits here for your approval. Nothing sends on its own.
        </p>
      </div>

      <section>
        <h2 className="text-sm font-display font-bold text-cool-800 mb-2">Waiting for your approval ({queue.length})</h2>
        <RenewalDripQueue items={queue} canDecide={canDecide} demo={demo} />
      </section>

      <section>
        <h2 className="text-sm font-display font-bold text-cool-800 mb-2">Active sequences ({active.length})</h2>
        {active.length === 0 ? (
          <p className="text-sm text-cool-500 font-ui">No clients are enrolled yet. The daily tick enrolls funded deals as they enter the 150-day window.</p>
        ) : (
          <div className="rounded-lg border border-cool-200 bg-white divide-y divide-cool-100">
            {active.map((s) => (
              <div key={s.sequenceId} className="flex items-center justify-between gap-2 px-4 py-2 text-sm font-ui">
                <span className="font-semibold text-cool-800">{s.clientName ?? s.zohoDealId}</span>
                <span className="text-xs text-cool-500">matures {s.maturityDate}</span>
                <span className="text-xs text-cool-500">
                  {s.nextTouch ? `next: ${s.nextTouch.skeletonId.replace('touch-', '')}d · ${s.nextTouch.scheduledFor ?? ''} (${s.nextTouch.status.replace('_', ' ')})` : 'no upcoming touch'}
                </span>
                <span className="text-xs text-cool-400">{s.sentCount} sent</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
