// Deals (Beta) — the four-phase board over the September record layer.
//
// WHAT THIS IS FOR. Michael judges a shape by using it, not by reading a spec.
// This page puts the `rec` record layer beside his live setup so he can decide
// whether it survives contact with his actual week, before the September
// migration commits to one. The live Deals area at /portal/admin/underwriting
// is untouched and stays his daily driver.
//
// READ ONLY, STRUCTURALLY. Every read goes through lib/underwriting.ts, whose
// entire query surface is an HTTP GET as the portal_readonly Postgres role.
// That role holds SELECT and nothing else: an INSERT against rec.deals answers
// 403 / 42501 "permission denied for table deals" (verified live 2026-08-01).
// There is no form, no button that posts, and no drag target on this page.
//
// Model and rules: lib/four-phase.ts, from fox-underwriting
// docs/design/four-phase-model-handoff.md section 5.

import { requirePermission } from '@/lib/authz'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { isDemoMode } from '@/lib/demo'
import {
  getAgentIdByEmail,
  getRecConsentCount,
  getRecDealClients,
  getRecDeals,
  getRecStageEvents,
  getRecStages,
} from '@/lib/underwriting'
import { isPhaseKey, type PhaseKey } from '@/lib/four-phase'
import DealsBetaBoard from '@/components/admin/DealsBetaBoard'

export const dynamic = 'force-dynamic'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-heading text-navy text-xl">Deals</h1>
        <span className="rounded-full border border-navy/25 bg-navy/5 px-2.5 py-0.5 text-[11px] font-heading font-semibold uppercase tracking-[1.2px] text-navy">
          Beta
        </span>
      </div>
      <p className="mt-1 max-w-3xl text-sm text-cool-700">
        The four-phase model over the September record layer, read-only and running beside your live
        Deals page. Nothing here writes.
      </p>
      {children}
    </main>
  )
}

export default async function DealsBetaPage({
  searchParams,
}: {
  searchParams?: { phase?: string }
}) {
  await requirePermission('deals.view')

  // Demo mode swaps every workbench fetcher for fixtures, and there is no
  // fictional record layer to swap in. Say that rather than render an empty
  // board that reads as "the migration produced nothing".
  if (isDemoMode()) {
    return (
      <Shell>
        <p className="mt-6 rounded-[9px] border border-cool-200 bg-white p-4 text-sm text-cool-700">
          This page reads the live record layer directly, so it has no demo equivalent. Leave demo
          mode to see it.
        </p>
      </Shell>
    )
  }

  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  if (!agentRes.configured) {
    return (
      <Shell>
        <p className="mt-6 rounded-[9px] border border-cool-200 bg-white p-4 text-sm text-cool-700">
          The workbench is not connected, so the record layer cannot be read.
        </p>
      </Shell>
    )
  }
  if (!agentRes.ok) {
    return (
      <Shell>
        <p className="mt-6 rounded-[9px] border border-cool-200 bg-white p-4 text-sm text-cool-700">
          Could not resolve the workbench agent, so the record layer cannot be read.
        </p>
      </Shell>
    )
  }
  const agentId = agentRes.data

  const [stagesRes, dealsRes, eventsRes, clientsRes, consentsRes] = await Promise.all([
    getRecStages(),
    getRecDeals(agentId),
    getRecStageEvents(agentId),
    getRecDealClients(agentId),
    getRecConsentCount(),
  ])

  // A read that fails is stated, never rendered as an empty board. An empty
  // board and a broken read look identical, and only one of them is true.
  const failed = [stagesRes, dealsRes, eventsRes, clientsRes].some(r => !r.configured || !r.ok)
  if (failed) {
    return (
      <Shell>
        <p className="mt-6 rounded-[9px] border border-cool-200 bg-white p-4 text-sm text-cool-700">
          The record layer did not answer. This is a read failure, not an empty pipeline — nothing
          here is a count of zero.
        </p>
      </Shell>
    )
  }

  const stages = stagesRes.configured && stagesRes.ok ? stagesRes.data : []
  const deals = dealsRes.configured && dealsRes.ok ? dealsRes.data : []
  const events = eventsRes.configured && eventsRes.ok ? eventsRes.data : []
  const clients = clientsRes.configured && clientsRes.ok ? clientsRes.data : []
  const consentRows = consentsRes.configured && consentsRes.ok ? consentsRes.data : null

  const phase: PhaseKey = isPhaseKey(searchParams?.phase) ? searchParams.phase : 'advise'

  return (
    <Shell>
      <DealsBetaBoard
        stages={stages}
        deals={deals}
        events={events}
        clients={clients}
        consentRows={consentRows}
        phase={phase}
        // Resolved on the server so every card measures against one instant,
        // and so the model itself never reads a clock.
        nowISO={new Date().toISOString()}
      />
    </Shell>
  )
}
