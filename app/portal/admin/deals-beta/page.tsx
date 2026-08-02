// Deals (Beta) — the phase board over the September record layer.
//
// WHAT THIS IS FOR. Michael judges a shape by using it, not by reading a spec.
// This page puts the `rec` record layer beside his live setup so he can decide
// whether it survives contact with his actual week. The live Deals area at
// /portal/admin/underwriting is untouched and stays his daily driver.
//
// THE SHAPE IS READ, NEVER DECLARED. rec.phases carries each phase's unit,
// whether it counts dollars, whether it has steps and what level its rows are;
// rec.deal_stages carries the columns, the gates and each stage's probability;
// rec.phase_returns carries the loop; rec.attract_sources carries Attract's
// sources; rec.card_tags carries the tag rules; rec.milestone_types carries
// the milestone vocabulary. The record layer renamed `advise`/`fund` to
// `underwriting`/`fulfilment` and grew Monitor from five steps to seven, and
// no branch in this repo needed to know.
//
// READ ONLY, STRUCTURALLY. Every read goes through lib/underwriting.ts, whose
// entire query surface is an HTTP GET as the portal_readonly Postgres role.
// That role holds SELECT and nothing else: an INSERT against rec.deals answers
// 403 / 42501 (verified live). Phase, view and column-collapse all ride
// searchParams through links, so there is no form, no handler and no drag
// target on this page and it ships no client JavaScript.

import { requirePermission } from '@/lib/authz'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { isDemoMode } from '@/lib/demo'
import {
  getAgentIdByEmail,
  getRecAttractSources,
  getRecCardTags,
  getRecDealClients,
  getRecDealMilestones,
  getRecConditions,
  getRecDeals,
  getRecMilestoneTypes,
  getRecPhaseReturns,
  getRecPhases,
  getRecStageEvents,
  getRecStages,
} from '@/lib/underwriting'
import { boardDeals, buildInsights, defaultPhaseCode, orderedPhases } from '@/lib/phase-model'
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
  searchParams?: { phase?: string; view?: string; collapsed?: string; deal?: string }
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

  const [
    phasesRes,
    stagesRes,
    dealsRes,
    eventsRes,
    clientsRes,
    returnsRes,
    sourcesRes,
    tagsRes,
    milestoneTypesRes,
    milestonesRes,
    conditionsRes,
  ] = await Promise.all([
    getRecPhases(),
    getRecStages(),
    getRecDeals(agentId),
    getRecStageEvents(agentId),
    getRecDealClients(agentId),
    getRecPhaseReturns(),
    getRecAttractSources(),
    getRecCardTags(),
    getRecMilestoneTypes(),
    getRecDealMilestones(agentId),
    getRecConditions(agentId),
  ])

  // A read that fails is stated, never rendered as an empty board. An empty
  // board and a broken read look identical, and only one of them is true.
  const all = [
    phasesRes,
    stagesRes,
    dealsRes,
    eventsRes,
    clientsRes,
    returnsRes,
    sourcesRes,
    tagsRes,
    milestoneTypesRes,
    milestonesRes,
    conditionsRes,
  ]
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

  const ok = <T,>(r: (typeof all)[number], fallback: T): T =>
    r.configured && r.ok ? (r.data as unknown as T) : fallback

  const phases = ok(phasesRes, [] as any[])
  const stages = ok(stagesRes, [] as any[])
  const deals = ok(dealsRes, [] as any[])
  const events = ok(eventsRes, [] as any[])
  const clients = ok(clientsRes, [] as any[])
  const returns = ok(returnsRes, [] as any[])
  const sources = ok(sourcesRes, [] as any[])
  const tags = ok(tagsRes, [] as any[])
  const milestoneTypes = ok(milestoneTypesRes, [] as any[])
  const milestones = ok(milestonesRes, [] as any[])
  const conditions = ok(conditionsRes, [] as any[])

  const archive = searchParams?.view === 'archive'
  // The requested phase must be one the record layer configures; an unknown
  // value falls back rather than rendering an empty unnamed phase. This is what
  // absorbed the advise -> underwriting rename without a broken page.
  // One instant for the whole render: the insights strip, every card and the
  // preview all measure against the same clock.
  const nowISO = new Date().toISOString()

  const known = new Set(orderedPhases(phases).map(p => p.code))
  const requested = searchParams?.phase
  const activePhase = requested && known.has(requested) ? requested : defaultPhaseCode(phases)

  return (
    <Shell>
      <DealsBetaBoard
        phases={phases}
        stages={stages}
        deals={deals}
        boardDeals={boardDeals(stages, deals)}
        events={events}
        clients={clients}
        returns={returns}
        sources={sources}
        tags={tags}
        milestoneTypes={milestoneTypes}
        milestones={milestones}
        conditions={conditions}
        insights={buildInsights(deals, stages, events, nowISO)}
        activePhase={activePhase}
        archive={archive}
        collapsedRaw={searchParams?.collapsed ?? null}
        selectedRef={searchParams?.deal ?? null}
        // Resolved on the server so every card measures against one instant,
        // and so the model itself never reads a clock.
        nowISO={nowISO}
      />
    </Shell>
  )
}
