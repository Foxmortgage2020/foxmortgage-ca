// Deals (Beta) — the phase board over the September record layer.
//
// WHAT THIS IS FOR. Michael judges a shape by using it, not by reading a spec.
// This page puts the `rec` record layer beside his live setup so he can decide
// whether it survives contact with his actual week, before the September
// migration commits to one. The live Deals area at /portal/admin/underwriting
// is untouched and stays his daily driver.
//
// FIVE PHASES as of B0c (2026-08-02): Attract, Intake, Advise, Fund, Monitor.
// The shape is READ, not declared — rec.phases carries each phase's unit,
// whether it counts dollars, whether it has steps at all, and what level its
// rows are; rec.deal_stages carries the columns and which are gates;
// rec.phase_returns carries the loop; rec.attract_sources carries Attract's
// sources. Adding a phase or a stage there changes this page with no code
// change here.
//
// READ ONLY, STRUCTURALLY. Every read goes through lib/underwriting.ts, whose
// entire query surface is an HTTP GET as the portal_readonly Postgres role.
// That role holds SELECT and nothing else: an INSERT against rec.deals answers
// 403 / 42501 "permission denied for table deals" (verified live). There is no
// form, no button that posts, and no drag target on this page.

import { requirePermission } from '@/lib/authz'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { isDemoMode } from '@/lib/demo'
import {
  getAgentIdByEmail,
  getRecAttractSources,
  getRecDealClients,
  getRecDeals,
  getRecPhaseReturns,
  getRecPhases,
  getRecStageEvents,
  getRecStages,
} from '@/lib/underwriting'
import { defaultPhaseCode, orderedPhases } from '@/lib/phase-model'
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
        The five-phase model over the September record layer, read-only and running beside your live
        Deals page. Nothing here writes.
      </p>
      {children}
    </main>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-6 rounded-[9px] border border-cool-200 bg-white p-4 text-sm text-cool-700">
      {children}
    </p>
  )
}

export default async function DealsBetaPage({
  searchParams,
}: {
  searchParams?: { phase?: string; view?: string }
}) {
  await requirePermission('deals.view')

  // Demo mode swaps every workbench fetcher for fixtures, and there is no
  // fictional record layer to swap in. Say that rather than render an empty
  // board that reads as "the migration produced nothing".
  if (isDemoMode()) {
    return (
      <Shell>
        <Notice>
          This page reads the live record layer directly, so it has no demo equivalent. Leave demo
          mode to see it.
        </Notice>
      </Shell>
    )
  }

  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  if (!agentRes.configured) {
    return (
      <Shell>
        <Notice>The workbench is not connected, so the record layer cannot be read.</Notice>
      </Shell>
    )
  }
  if (!agentRes.ok) {
    return (
      <Shell>
        <Notice>Could not resolve the workbench agent, so the record layer cannot be read.</Notice>
      </Shell>
    )
  }
  const agentId = agentRes.data

  const [phasesRes, stagesRes, dealsRes, eventsRes, clientsRes, returnsRes, sourcesRes] =
    await Promise.all([
      getRecPhases(),
      getRecStages(),
      getRecDeals(agentId),
      getRecStageEvents(agentId),
      getRecDealClients(agentId),
      getRecPhaseReturns(),
      getRecAttractSources(),
    ])

  // A read that fails is stated, never rendered as an empty board. An empty
  // board and a broken read look identical, and only one of them is true.
  const all = [phasesRes, stagesRes, dealsRes, eventsRes, clientsRes, returnsRes, sourcesRes]
  if (all.some(r => !r.configured || !r.ok)) {
    return (
      <Shell>
        <Notice>
          The record layer did not answer. This is a read failure, not an empty pipeline — nothing
          here is a count of zero.
        </Notice>
      </Shell>
    )
  }

  const phases = phasesRes.configured && phasesRes.ok ? phasesRes.data : []
  const stages = stagesRes.configured && stagesRes.ok ? stagesRes.data : []
  const deals = dealsRes.configured && dealsRes.ok ? dealsRes.data : []
  const events = eventsRes.configured && eventsRes.ok ? eventsRes.data : []
  const clients = clientsRes.configured && clientsRes.ok ? clientsRes.data : []
  const returns = returnsRes.configured && returnsRes.ok ? returnsRes.data : []
  const sources = sourcesRes.configured && sourcesRes.ok ? sourcesRes.data : []

  const archive = searchParams?.view === 'archive'
  // The requested phase must be one the record layer actually configures; an
  // unknown value falls back rather than rendering an empty unnamed phase.
  const known = new Set(orderedPhases(phases).map(p => p.code))
  const requested = searchParams?.phase
  const activePhase =
    requested && known.has(requested) ? requested : defaultPhaseCode(phases)

  return (
    <Shell>
      <DealsBetaBoard
        phases={phases}
        stages={stages}
        deals={deals}
        events={events}
        clients={clients}
        returns={returns}
        sources={sources}
        activePhase={activePhase}
        archive={archive}
        // Resolved on the server so every card measures against one instant,
        // and so the model itself never reads a clock.
        nowISO={new Date().toISOString()}
      />
    </Shell>
  )
}
