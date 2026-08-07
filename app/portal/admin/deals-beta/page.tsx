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
  getRecDealProperties,
} from '@/lib/underwriting'
import { boardDeals, buildInsights } from '@/lib/phase-model'
import { indexWithdrawals, partitionWithdrawn } from '@/lib/rec-withdrawal'
import { propertyAddress, resolveRoom, subjectProperty } from '@/lib/beta-file'
import {
  RADIUS,
  STROKE,
  SURFACE,
  TEXT,
  TYPE,
  radius,
  typeStyle,
} from '@/lib/design-tokens'
import { BOARD_FONT_CLASS } from '@/lib/board-fonts'
import { openPhaseCode } from '@/lib/board-layout'
import DealsBetaBoard from '@/components/admin/DealsBetaBoard'

export const dynamic = 'force-dynamic'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    // THE BLUE-GREY CANVAS IS GONE. Michael named it, and it was the first
    // thing to go: a warm off-white lets the white panels read as panels
    // instead of as slightly different blue-grey.
    <main
      className={`min-h-screen ${BOARD_FONT_CLASS}`}
      style={{ background: SURFACE.canvas, padding: '20px 28px 28px' }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <h1 style={{ ...typeStyle(TYPE.pageTitle), color: TEXT.navy }}>Deals</h1>
        <span
          style={{
            ...typeStyle(TYPE.beta),
            color: TEXT.dim,
            border: `${STROKE.hairline}px solid ${SURFACE.border}`,
            borderRadius: radius(RADIUS.small),
            padding: '3px 6px',
          }}
        >
          BETA
        </span>
      </div>
      {/* NO STANDING PARAGRAPH HERE (handoff 60). It explained the three-level
          structure and named the page's one write, and Michael's ruling is that
          it is documentation a person reads once and then scrolls past forever.
          The strip of figures below is the real orientation.

          WHAT WENT WITH IT, recorded rather than quietly dropped: this was the
          only place on screen that said what this page writes. The guarantee
          itself is unchanged and still enforced by tests/beta-file.test.ts,
          which allows a write only through an existing gate proxy with a human
          actor. The sentence was a description of that rule, not the rule. */}
      {children}
    </main>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="mt-6"
      style={{
        ...typeStyle(TYPE.pageSubtitle),
        color: TEXT.dim,
        background: SURFACE.panel,
        border: `${STROKE.hairline}px solid ${SURFACE.border}`,
        borderRadius: radius(RADIUS.card),
        padding: '16px',
      }}
    >
      {children}
    </p>
  )
}

export default async function DealsBetaPage({
  searchParams,
}: {
  // `open` carries which PHASE is expanded (handoff 58) and `show` which
  // finished STAGE has been unfolded to reveal its files (handoff 61). Both
  // ride the URL rather than component state, which is what keeps this page a
  // server component with no client JS on the board itself. `phase` and
  // `collapsed` were retired in handoff 57 and both still answer 200.
  searchParams?: { view?: string; deal?: string; open?: string; show?: string }
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
    propsRes,
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
    // The subject property behind each file, for the card's context tier. Read
    // through the same rec.deal_properties join the file page uses.
    getRecDealProperties(agentId),
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
    propsRes,
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
  const propertyLinks = ok(propsRes, [] as any[])

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
  const nostageView = searchParams?.view === 'nostage'
  const canWithdraw = can(user, 'rec.withdraw') && !isDemoMode()
  // One instant for the whole render: the insights strip, every card and every
  // countdown measure against the same clock.
  const nowISO = new Date().toISOString()
  // Today in Toronto, because the practice is. Derived from the same instant,
  // so no two cards on the screen can disagree about what day it is.
  const todayYMD = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(nowISO))

  // The subject property per file, by the SAME rule the file page uses: the
  // link whose role is 'subject', falling back to the sole link when a role is
  // absent. A file with none renders the absent value rather than a blank row.
  const linksByDeal = new Map<string, any[]>()
  for (const l of propertyLinks as any[]) {
    const list = linksByDeal.get(l.deal_id) ?? []
    list.push(l)
    linksByDeal.set(l.deal_id, list)
  }
  const addressByDeal: Record<string, string> = {}
  for (const [dealId, links] of Array.from(linksByDeal.entries())) {
    const p = subjectProperty(
      { id: dealId },
      links.map((l: any) => ({ deal_id: l.deal_id, property_id: l.property_id, role: l.role })),
      links.map((l: any) => ({
        id: l.property_id,
        address_line1: l.address_line1,
        street_number: l.street_number,
        street_name: l.street_name,
        unit: l.unit,
        city: l.city,
        province: l.province,
        postal_code: l.postal_code,
        occupancy: l.occupancy,
        property_type: l.property_type,
        tenure: l.tenure,
        annual_taxes: l.annual_taxes,
        condo_fees_monthly: l.condo_fees_monthly,
      })),
    )
    const addr = propertyAddress(p)
    if (addr) addressByDeal[dealId] = addr
  }

  // Which phase is expanded. Validated against the record layer, and an
  // unknown value opens nothing rather than falling back to an arbitrary one.
  const openPhase = openPhaseCode(searchParams?.open, phases as any[])

  // Which finished stage has been unfolded (handoff 61). Validated the same
  // way and for the same reason: an unrecognised code unfolds NOTHING rather
  // than guessing at a stage, so a stale or hand-typed link degrades to the
  // ordinary collapsed board instead of revealing an arbitrary column.
  const shownStage =
    searchParams?.show && stages.some(s => s.code === searchParams.show)
      ? searchParams.show
      : null

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
        archive={archive}
        withdrawnView={withdrawnView}
        nostageView={nostageView}
        withdrawals={withdrawals}
        withdrawnDeals={withdrawnDeals}
        roomDealIds={roomDealIds}
        canWithdraw={canWithdraw}
        addressByDeal={addressByDeal}
        openPhase={openPhase}
        shownStage={shownStage}
        selectedRef={searchParams?.deal ?? null}
        // Resolved on the server so every card measures against one instant,
        // and so the model itself never reads a clock.
        nowISO={nowISO}
        todayYMD={todayYMD}
      />
    </Shell>
  )
}
