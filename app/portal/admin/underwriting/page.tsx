// Underwriting (Phase B1) — the work queue. The bridge sweep runs on load
// (never stale while Michael looks), then the board renders every live room
// by state: Intake -> Evidence -> Conditions -> Ready to submit -> With
// lender. Funded and dormant rooms live behind a filter toggle. A quiet
// strip above the board lists active Zoho files below Submitted — not yet
// bridged — each with "Start underwriting early". Test rooms are excluded
// structurally at the fetcher boundary (lib/test-rooms.ts), not here.
//
// Phase A component standards: lime = decision (nothing on this page uses
// it unless a card waits on Michael specifically — today none do), amber =
// review (days idle over threshold, unmapped stage), tabular numerals,
// plain-verb actions.

import Link from 'next/link'
import { can, requirePermission } from '@/lib/authz'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { computePipeline, getAllDealsSlim, type SlimDeal } from '@/lib/zoho-admin'
import {
  getAgentIdByEmail,
  getConditionCountsByDeal,
  getDealsSummary,
  getOpenConditionCounts,
  type WorkbenchDeal,
} from '@/lib/underwriting'
import {
  BOARD_COLUMNS,
  boardColumnFor,
  computeBridgePlan,
  daysIdle,
  DAYS_IDLE_AMBER,
  nextStepForRoom,
} from '@/lib/underwriting-bridge'
import { boardPhaseGroups, columnForDisplayStage } from '@/config/lifecycle'
import { closingPillAmber, type ConditionCount } from '@/lib/conditions-status'
import { daysUntil } from '@/lib/compliance-logic'
import { runBridgeSweep } from '@/lib/underwriting-sweep'
import { isDemoMode } from '@/lib/demo'
import { fmtMoneyCompact, fmtShortDate, torontoTodayYMD } from '@/lib/dates'
import StartEarlyButton from '@/components/admin/StartEarlyButton'

export const dynamic = 'force-dynamic'

function val<T>(r: { configured: boolean } & ({ ok: true; data: T } | { ok: false }) | null): T | null {
  return r && r.configured && 'ok' in r && r.ok ? (r as { data: T }).data : null
}

// Phase sections keep the seven columns' relative widths on wide screens and
// stack phase by phase below xl. Keyed by a section's column count.
const PHASE_GROW: Record<number, string> = {
  1: 'xl:grow xl:basis-0',
  2: 'xl:grow-[2] xl:basis-0',
  3: 'xl:grow-[3] xl:basis-0',
}
const PHASE_GRID: Record<number, string> = {
  1: 'grid grid-cols-1 gap-3',
  2: 'grid grid-cols-1 sm:grid-cols-2 gap-3',
  3: 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3',
}

export default async function UnderwritingPage({
  searchParams,
}: {
  searchParams: { show?: string }
}) {
  const user = await requirePermission('deals.view')
  const showParked = searchParams.show === 'all'
  const todayYMD = torontoTodayYMD()

  // The sweep first, so what renders below already includes what it built.
  // A bridge outage degrades to the honest note, never a crash.
  const sweep = await runBridgeSweep()

  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  const agentId = agentRes.configured && agentRes.ok ? agentRes.data : null

  const [dealsRes, roomsR, condCountsR, condChecklistR] = await Promise.all([
    getAllDealsSlim()
      .then(d => ({ ok: true as const, data: d }))
      .catch(() => ({ ok: false as const, data: null })),
    agentId ? getDealsSummary(agentId) : null,
    agentId ? getOpenConditionCounts(agentId) : null,
    agentId ? getConditionCountsByDeal(agentId) : null,
  ])
  const deals: SlimDeal[] | null = dealsRes.ok ? dealsRes.data : null
  const rooms: WorkbenchDeal[] = roomsR && roomsR.configured && roomsR.ok ? roomsR.data : []
  const condCounts = (condCountsR && condCountsR.configured && condCountsR.ok ? condCountsR.data : {}) as Record<string, number>
  // Phase B2: per-deal collected/outstanding over approved commitment
  // conditions, for the conditions-column card line and its closing pill.
  const condChecklist = (condChecklistR && condChecklistR.configured && condChecklistR.ok ? condChecklistR.data : {}) as Record<string, ConditionCount>

  const dealByZohoId = new Map((deals ?? []).map(d => [d.id, d]))
  const pipeline = deals ? computePipeline(deals, todayYMD) : null
  const plan =
    deals && pipeline
      ? computeBridgePlan({ activeDeals: pipeline.activeDeals, allDeals: deals, rooms })
      : null
  const notYetBridged = plan?.notYetBridged ?? []

  // Phase B2: funded is its own board column, but it must not grow without
  // bound — a room funded months ago is not today's work. Signal used: days
  // since last movement (updated_at, the only always-present timestamp; a
  // funded room's last movement is when it funded). Recently-funded rooms stay
  // on the board; older funded joins dormant behind the toggle.
  const FUNDED_RECENT_DAYS = 30
  const staleFunded = (r: WorkbenchDeal) =>
    boardColumnFor(r.stage).column === 'funded' && daysIdle(r.updatedAt, todayYMD) > FUNDED_RECENT_DAYS
  const live = rooms.filter(r => r.status === 'active' && !staleFunded(r))
  const parked = rooms.filter(r => r.status !== 'active' || staleFunded(r))

  const cardFor = (r: WorkbenchDeal) => {
    const z = r.zohoPotentialId ? dealByZohoId.get(r.zohoPotentialId) : null
    // Zoho is the system of record for stage (B2a): every card positions by
    // the linked deal's display stage through the lifecycle map. The room's
    // own stage is the fallback ONLY when no Zoho stage could be read, and
    // the card says so — never a silent bucket.
    const zohoColumn = z ? columnForDisplayStage(z.stage) : null
    const roomPosition = boardColumnFor(r.stage)
    const positionFromRoom = zohoColumn === null
    const column = zohoColumn ?? roomPosition.column
    const mapped = !positionFromRoom || roomPosition.mapped
    const idle = daysIdle(r.updatedAt, todayYMD)
    const closing = z?.closingDate ?? r.closingDate
    return {
      room: r,
      column,
      mapped,
      positionFromRoom,
      idle,
      clientLine: z ? z.dealName : r.fileRef,
      amount: z && z.amount > 0 ? z.amount : null,
      closing,
      conds: condCounts[r.id] ?? null,
      checklist: condChecklist[r.id] ?? null,
      closeDays: closing ? daysUntil(closing, todayYMD) : null,
    }
  }
  const cards = live.map(cardFor)
  const byColumn = new Map(BOARD_COLUMNS.map(c => [c.key, cards.filter(x => x.column === c.key)]))

  const canProvisionEarly = can(user, 'underwriting.provision') && !isDemoMode()

  return (
    <div className="max-w-6xl">
      <div className="mb-5">
        <h1 className="font-ui text-ink-navy text-2xl font-bold">Underwriting</h1>
        <p className="text-muted font-ui text-sm mt-1">
          Every live file, positioned by its Zoho stage and grouped by lifecycle phase.
        </p>
        {!sweep.ok && (
          <p className="mt-2 rounded bg-caution-bg border border-caution/40 px-2.5 py-1.5 text-xs font-ui text-caution">
            The bridge could not run ({sweep.error ?? 'unknown'}). The board shows the last known
            rooms; new Zoho files may not appear until it recovers.
          </p>
        )}
        {sweep.ok && sweep.provisioned.length > 0 && (
          <p className="mt-2 text-xs font-ui text-muted">
            The bridge just created {sweep.provisioned.length}{' '}
            {sweep.provisioned.length === 1 ? 'room' : 'rooms'}: {sweep.provisioned.join(', ')}.
          </p>
        )}
      </div>

      {/* Not yet bridged: tomorrow's files, visible before they arrive. */}
      <div
        id="not-yet-bridged"
        className="mb-5 rounded-[10px] bg-white border border-hairline shadow-card px-4 py-3"
      >
        <p className="font-ui text-[10px] font-bold uppercase tracking-[1.6px] text-muted-2">
          Not yet bridged
        </p>
        {notYetBridged.length === 0 ? (
          <p className="mt-1 text-sm font-ui text-muted">
            Nothing below Submitted right now. New applications appear here before they reach
            underwriting.
          </p>
        ) : (
          <ul className="mt-1.5 divide-y divide-hairline">
            {notYetBridged.map(d => (
              <li key={d.id} className="py-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-ui text-sm font-medium text-ink">{d.dealName}</span>
                <span className="inline-block rounded-full bg-fog px-2 py-0.5 text-[11px] font-ui font-semibold text-muted">
                  {d.stage}
                </span>
                <span className="font-ui text-sm text-muted tabular-nums">
                  {d.amount > 0 ? fmtMoneyCompact(d.amount) : ''}
                </span>
                <span className="flex-1" />
                {canProvisionEarly && <StartEarlyButton zohoId={d.id} />}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* The board — the same seven columns (Phase B2) under four lifecycle
          phase headers (B1). Column keys, mapping, and cards are unchanged;
          only the grouping and labels moved. On wide screens the sections
          keep the columns' relative widths (1 : 3 : 1 : 2); below xl the
          board stacks phase by phase. */}
      <div className="flex flex-col gap-6 xl:flex-row xl:gap-4">
        {boardPhaseGroups(BOARD_COLUMNS).map(group => (
          <section key={group.key} className={`min-w-0 ${PHASE_GROW[group.columns.length]}`}>
            <p className="mb-2.5 border-b border-hairline pb-1.5 font-ui text-[10px] font-bold uppercase tracking-[1.6px] text-ink-navy">
              {group.label}
            </p>
            <div className={PHASE_GRID[group.columns.length]}>
        {group.columns.map(col => {
          const colCards = byColumn.get(col.key) ?? []
          return (
            <div key={col.key} className="min-w-0">
              <p className="px-1 pb-2 font-ui text-[11px] font-bold uppercase tracking-wide text-muted flex items-baseline gap-1.5">
                {/* A single-column phase already says its name in the phase
                    header; repeating it here is clutter (B1 clutter pass). */}
                {col.label !== group.label && col.label}
                <span className="tabular-nums text-muted-2">{colCards.length}</span>
              </p>
              <div className="space-y-2.5">
                {colCards.length === 0 && (
                  <p className="px-1 text-xs font-ui text-muted-2">Empty.</p>
                )}
                {colCards.map(c => (
                  <Link
                    key={c.room.id}
                    href={`/portal/admin/deals/${c.room.id}`}
                    className="block rounded-[10px] bg-white border border-hairline shadow-card px-3 py-2.5 hover:border-ink-navy/30 motion-safe:transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-navy"
                  >
                    <p className="font-ui text-[13px] font-semibold text-ink leading-snug break-words">
                      {c.clientLine}
                    </p>
                    <p className="mt-0.5 font-ui text-xs text-muted tabular-nums">
                      {c.amount ? fmtMoneyCompact(c.amount) : 'amount not recorded'}
                      {c.closing ? ` · closes ${fmtShortDate(c.closing)}` : ''}
                    </p>
                    <p className="mt-1 font-ui text-xs text-muted">
                      {c.column === 'conditions' && c.checklist
                        ? `${c.checklist.outstanding} of ${c.checklist.total} ${
                            c.checklist.total === 1 ? 'condition' : 'conditions'
                          } outstanding${
                            c.closeDays !== null && c.closeDays >= 0
                              ? ` · closes in ${c.closeDays} ${c.closeDays === 1 ? 'day' : 'days'}`
                              : ''
                          }`
                        : nextStepForRoom(c.column, c.conds)}
                    </p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {c.column === 'conditions' && c.checklist && c.closeDays !== null && (
                        <span
                          className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-ui font-semibold tabular-nums ${
                            closingPillAmber(c.closeDays, c.checklist.outstanding)
                              ? 'bg-caution-bg text-caution'
                              : 'bg-fog text-muted-2'
                          }`}
                          title="Days to the recorded closing date"
                        >
                          {c.closeDays >= 0 ? `closes in ${c.closeDays}d` : `closed ${Math.abs(c.closeDays)}d ago`}
                        </span>
                      )}
                      <span
                        className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-ui font-semibold tabular-nums ${
                          c.idle >= DAYS_IDLE_AMBER
                            ? 'bg-caution-bg text-caution'
                            : 'bg-fog text-muted-2'
                        }`}
                        title="Days since last movement on the room (no per-state history exists yet)"
                      >
                        {c.idle}d idle
                      </span>
                      {c.positionFromRoom && (
                        <span
                          className="inline-block rounded-full bg-fog px-1.5 py-0.5 text-[10px] font-ui font-semibold text-muted-2"
                          title="No linked Zoho stage could be read, so this card sits where the workbench room's own stage puts it."
                        >
                          position from the room, not Zoho
                        </span>
                      )}
                      {!c.mapped && (
                        <span className="inline-block rounded bg-caution-bg px-1.5 py-0.5 text-[10px] font-ui font-semibold text-caution">
                          stage &quot;{c.room.stage ?? 'none'}&quot; unmapped
                        </span>
                      )}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
            </div>
          </section>
        ))}
      </div>

      {/* Older funded + dormant rooms, present but out of the way (recently
          funded rooms live on the board). */}
      <div className="mt-6">
        <Link
          href={showParked ? '/portal/admin/underwriting' : '/portal/admin/underwriting?show=all'}
          className="font-ui text-[13px] font-semibold text-ink underline decoration-hairline decoration-2 underline-offset-4 hover:decoration-ink-navy"
        >
          {showParked
            ? 'Hide funded and dormant rooms'
            : `Show funded and dormant rooms (${parked.length})`}
        </Link>
        {showParked && (
          <ul className="mt-3 divide-y divide-hairline rounded-[10px] bg-white border border-hairline shadow-card px-4">
            {parked.length === 0 && (
              <li className="py-3 text-sm font-ui text-muted">None yet.</li>
            )}
            {parked.map(r => {
              const z = r.zohoPotentialId ? dealByZohoId.get(r.zohoPotentialId) : null
              return (
                <li key={r.id} className="py-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <Link
                    href={`/portal/admin/deals/${r.id}`}
                    className="font-ui text-sm font-medium text-ink hover:underline"
                  >
                    {z ? z.dealName : r.fileRef}
                  </Link>
                  <span className="inline-block rounded-full bg-fog px-2 py-0.5 text-[11px] font-ui font-semibold text-muted">
                    {r.stage === 'funded' ? 'funded' : r.status}
                  </span>
                  <span className="font-ui text-xs text-muted-2">
                    last movement {fmtShortDate(r.updatedAt.slice(0, 10))}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
