// Deals (B2b, Direction 2 — "the control room") — the daily driver. The
// bridge sweep runs on load (never stale while Michael looks), then every
// live room renders as a LIST by default (phase spine, closing-date order,
// the single lime on the top-most actionable row) with the board behind a
// per-user toggle. Both views read the SAME rows from lib/deals-surface.ts
// over the same B2a position source (Zoho display stage through
// config/lifecycle; the room's own stage only as the loud fallback) — this
// session moves nothing.
//
// The nav label and this title renamed Underwriting -> Deals (B2b Task 2);
// the route path is unchanged and the word Underwriting now means only the
// lifecycle phase. Test rooms are excluded structurally at the fetcher
// boundary (lib/test-rooms.ts), not here.

import Link from 'next/link'
import { can, requirePermission } from '@/lib/authz'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { computePipeline, getAllDealsSlim, type SlimDeal } from '@/lib/zoho-admin'
import {
  getAgentIdByEmail,
  getConditionCountsByDeal,
  getDealsSummary,
  type WorkbenchDeal,
} from '@/lib/underwriting'
import {
  boardColumnFor,
  computeBridgePlan,
  daysIdle,
} from '@/lib/underwriting-bridge'
import { columnForDisplayStage } from '@/config/lifecycle'
import { buildDealRows, countLine, type DealSurfaceInput } from '@/lib/deals-surface'
import { resolveClosingDate } from '@/lib/closing-date'
import type { ConditionCount } from '@/lib/conditions-status'
import { daysUntil } from '@/lib/compliance-logic'
import { runBridgeSweep } from '@/lib/underwriting-sweep'
import { isDemoMode } from '@/lib/demo'
import { fmtMoneyCompact, fmtShortDate, torontoTodayYMD } from '@/lib/dates'
import StartEarlyButton from '@/components/admin/StartEarlyButton'
import DealsView from '@/components/admin/deals/DealsView'
import DealsList from '@/components/admin/deals/DealsList'
import DealsBoard from '@/components/admin/deals/DealsBoard'

export const dynamic = 'force-dynamic'

export default async function DealsPage({
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

  const [dealsRes, roomsR, condChecklistR] = await Promise.all([
    getAllDealsSlim()
      .then(d => ({ ok: true as const, data: d }))
      .catch(() => ({ ok: false as const, data: null })),
    agentId ? getDealsSummary(agentId) : null,
    agentId ? getConditionCountsByDeal(agentId) : null,
  ])
  const deals: SlimDeal[] | null = dealsRes.ok ? dealsRes.data : null
  const rooms: WorkbenchDeal[] = roomsR && roomsR.configured && roomsR.ok ? roomsR.data : []
  // Per-deal collected/outstanding over approved commitment conditions (B2).
  const condChecklist = (condChecklistR && condChecklistR.configured && condChecklistR.ok ? condChecklistR.data : {}) as Record<string, ConditionCount>

  const dealByZohoId = new Map((deals ?? []).map(d => [d.id, d]))
  const pipeline = deals ? computePipeline(deals, todayYMD) : null
  const plan =
    deals && pipeline
      ? computeBridgePlan({ activeDeals: pipeline.activeDeals, allDeals: deals, rooms })
      : null
  const notYetBridged = plan?.notYetBridged ?? []

  // Funded stays on the board only while recent (B2): a room funded months
  // ago is not today's work. Older funded joins dormant behind the toggle.
  const FUNDED_RECENT_DAYS = 30
  const staleFunded = (r: WorkbenchDeal) =>
    boardColumnFor(r.stage).column === 'funded' && daysIdle(r.updatedAt, todayYMD) > FUNDED_RECENT_DAYS
  const live = rooms.filter(r => r.status === 'active' && !staleFunded(r))
  const parked = rooms.filter(r => r.status !== 'active' || staleFunded(r))

  // The B2a position source, unchanged: Zoho display stage through the
  // lifecycle map; the room's own stage only as the loud fallback.
  const inputs: DealSurfaceInput[] = live.map(r => {
    const z = r.zohoPotentialId ? dealByZohoId.get(r.zohoPotentialId) : null
    const zohoColumn = z ? columnForDisplayStage(z.stage) : null
    const roomPosition = boardColumnFor(r.stage)
    const positionFromRoom = zohoColumn === null
    // One closing-date rule (B8b Task 0): workbench first, Zoho fallback. This
    // was Zoho-FIRST, so a stale Zoho date could win over the fresh
    // Finmo-synced workbench date and disagree with the client's own page.
    const closing = resolveClosingDate(r.closingDate, z?.closingDate ?? null)
    return {
      roomId: r.id,
      fileRef: r.fileRef,
      zohoDealName: z?.dealName ?? null,
      zohoStage: z?.stage ?? null,
      transactionType: z?.transactionType ?? null,
      roomStage: r.stage,
      column: zohoColumn ?? roomPosition.column,
      mapped: !positionFromRoom || roomPosition.mapped,
      positionFromRoom,
      amount: z && z.amount > 0 ? z.amount : null,
      closing,
      closeDays: closing ? daysUntil(closing, todayYMD) : null,
      checklist: condChecklist[r.id] ?? null,
      idleDays: daysIdle(r.updatedAt, todayYMD),
    }
  })
  const rows = buildDealRows(inputs)

  const canProvisionEarly = can(user, 'underwriting.provision') && !isDemoMode()

  return (
    <div className="max-w-6xl">
      {!sweep.ok && (
        <p className="mb-4 rounded bg-caution-bg border border-caution/40 px-2.5 py-1.5 text-xs font-ui text-caution">
          The bridge could not run ({sweep.error ?? 'unknown'}). The page shows the last known
          rooms; new Zoho files may not appear until it recovers.
        </p>
      )}
      {sweep.ok && sweep.provisioned.length > 0 && (
        <p className="mb-4 text-xs font-ui text-cool-600">
          The bridge just created {sweep.provisioned.length}{' '}
          {sweep.provisioned.length === 1 ? 'room' : 'rooms'}: {sweep.provisioned.join(', ')}.
        </p>
      )}

      <DealsView
        userKey={user.userId}
        title="Deals"
        countLine={countLine(rows)}
        list={<DealsList rows={rows} />}
        board={<DealsBoard rows={rows} />}
      />

      {/* Not yet bridged: tomorrow's files, visible before they arrive. */}
      <div
        id="not-yet-bridged"
        className="mt-6 rounded-[9px] bg-white border border-cool-200 px-4 py-3"
      >
        <p className="font-heading text-[10px] font-bold uppercase tracking-[1.6px] text-cool-500">
          Not yet bridged
        </p>
        {notYetBridged.length === 0 ? (
          <p className="mt-1 text-sm font-ui text-cool-600">
            Nothing below Submitted right now. New applications appear here before they reach
            underwriting.
          </p>
        ) : (
          <ul className="mt-1.5 divide-y divide-cool-100">
            {notYetBridged.map(d => (
              <li key={d.id} className="py-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-ui text-sm font-medium text-ink">{d.dealName}</span>
                <span className="inline-block rounded-full bg-cool-100 px-2 py-0.5 text-[11px] font-ui font-semibold text-cool-700">
                  {d.stage}
                </span>
                <span className="font-ui text-sm text-cool-600 tabular-nums">
                  {d.amount > 0 ? fmtMoneyCompact(d.amount) : ''}
                </span>
                <span className="flex-1" />
                {canProvisionEarly && <StartEarlyButton zohoId={d.id} />}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Older funded + dormant rooms, present but out of the way. */}
      <div className="mt-6">
        <Link
          href={showParked ? '/portal/admin/underwriting' : '/portal/admin/underwriting?show=all'}
          className="font-ui text-[13px] font-semibold text-ink underline decoration-cool-250 decoration-2 underline-offset-4 hover:decoration-navy"
        >
          {showParked
            ? 'Hide funded and dormant rooms'
            : `Show funded and dormant rooms (${parked.length})`}
        </Link>
        {showParked && (
          <ul className="mt-3 divide-y divide-cool-100 rounded-[9px] bg-white border border-cool-200 px-4">
            {parked.length === 0 && (
              <li className="py-3 text-sm font-ui text-cool-600">None yet.</li>
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
                  <span className="inline-block rounded-full bg-cool-100 px-2 py-0.5 text-[11px] font-ui font-semibold text-cool-700">
                    {r.stage === 'funded' ? 'funded' : r.status}
                  </span>
                  <span className="font-ui text-xs text-cool-500">
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
