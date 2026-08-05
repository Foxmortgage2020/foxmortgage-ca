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
// READS ARE READ ONLY, STRUCTURALLY. Every read goes through
// lib/underwriting.ts, whose entire query surface is an HTTP GET as the
// portal_readonly Postgres role. That role holds SELECT and nothing else: an
// INSERT against rec.deals answers 403 / 42501 (verified live). Phase, view and
// column-collapse still ride searchParams through links, so navigating this
// board is a soft navigation with no client state.
//
// THIS PAGE IS NO LONGER FREE OF CLIENT JAVASCRIPT, and the old wording here
// claimed it was. Handoff 50 added the Remove control, which is a client leaf
// with a handler, a textarea and a POST. It writes ONE thing, through an
// existing gate proxy, with a human actor from the verified session, and it
// deletes nothing. The page itself is still a server component and everything
// around the control still has no handler and no drag target. The rest of the
// old sentence stood, so only the false half was replaced: an untrue guarantee
// is worse than none, which is the same reason the rendered subtitle below
// stopped saying "Nothing here writes".

import { can, requirePermission } from '@/lib/authz'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { isDemoMode } from '@/lib/demo'
import {
  getAgentIdByEmail,
  getDealsSummary,
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
  getRecWithdrawals,
} from '@/lib/underwriting'
import { boardDeals, buildInsights, defaultPhaseCode, orderedPhases } from '@/lib/phase-model'
import { indexWithdrawals, partitionWithdrawn } from '@/lib/rec-withdrawal'
import { resolveRoom } from '@/lib/beta-file'
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
      {/* THIS SENTENCE USED TO SAY "Nothing here writes", AND THAT STOPPED
          BEING TRUE. The Remove control writes one thing, through a gate, with
          a human on it. An untrue guarantee is worse than none, so the sentence
          now names exactly what the one write is rather than denying it. */}
      <p className="mt-1 max-w-3xl text-sm text-cool-700">
        The five-phase model over the September record layer, running beside your live Deals page.
        The only thing this page changes is whether a record stays in the book, and that is a
        recorded decision rather than a deletion.
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
  const user = await requirePermission('deals.view')

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
    withdrawalsRes,
    roomsRes,
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
    // Handoff 50. WITHOUT THIS READ THE REMOVE CONTROL COULD NOT SHIP: a
    // withdrawn record would look identical to a live one on the board and
    // could never be reversed, which is exactly why handoff 48 stopped.
    getRecWithdrawals(agentId),
    // The workbench side, read only to decide which records have an open file.
    // A withdrawal on one of those is refused, so this is not decoration.
    getDealsSummary(agentId),
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
    withdrawalsRes,
    roomsRes,
  ]
  if (all.some(r => !r.configured || !r.ok)) {
    return (
      <Shell>
        <Notice>
          The record layer did not answer. This is a read failure, not an empty pipeline. Nothing
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
  const withdrawals = ok(withdrawalsRes, [] as any[])
  const rooms = ok(roomsRes, [] as any[])

  // ── Withdrawn records leave the working book ──────────────────────────────
  // Out of the phase columns, out of the Archive, and out of the insights. A
  // weighted total that kept counting a record Michael removed would be a
  // forecast that lies. The Withdrawn switch carries its own count beside Board
  // and Archive so the two numbers are always on the same screen: a book that
  // shrinks can be read against the reason it shrank, and the count renders at
  // zero too, so the explanation exists before it is needed.
  const index = indexWithdrawals(withdrawals)
  const split = partitionWithdrawn(deals as any[], index)
  const liveDeals = split.live
  const withdrawnDeals = split.withdrawn

  // Which records have an open workbench file, by the SAME rule the file page
  // and the withdrawal route use. Never a third definition, and never a value
  // the browser could assert.
  const publicDeals = rooms.map((r: any) => ({ id: r.id, file_ref: r.fileRef ?? null }))
  const roomDealIds = (liveDeals as any[])
    .filter(d => resolveRoom({ id: d.id, file_ref: d.file_ref, workbench_deal_id: d.workbench_deal_id }, publicDeals))
    .map(d => d.id as string)

  const archive = searchParams?.view === 'archive'
  const withdrawnView = searchParams?.view === 'withdrawn'
  const canWithdraw = can(user, 'rec.withdraw') && !isDemoMode()
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
        deals={liveDeals}
        boardDeals={boardDeals(stages, liveDeals)}
        events={events}
        clients={clients}
        returns={returns}
        sources={sources}
        tags={tags}
        milestoneTypes={milestoneTypes}
        milestones={milestones}
        conditions={conditions}
        insights={buildInsights(liveDeals, stages, events, nowISO)}
        activePhase={activePhase}
        archive={archive}
        withdrawnView={withdrawnView}
        withdrawals={withdrawals}
        withdrawnDeals={withdrawnDeals}
        roomDealIds={roomDealIds}
        canWithdraw={canWithdraw}
        collapsedRaw={searchParams?.collapsed ?? null}
        selectedRef={searchParams?.deal ?? null}
        // Resolved on the server so every card measures against one instant,
        // and so the model itself never reads a clock.
        nowISO={nowISO}
      />
    </Shell>
  )
}
