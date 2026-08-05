// The Deals (Beta) FILE PAGE (handoff 42) — the container file-level features
// move into over the sessions that follow. It moves none of them yet.
//
// WHY IT EXISTS. The board is where Michael scans his week; a file is where
// forty minutes go. Until now the beta had no file-level surface at all: one
// route, no `[id]` segment, and a preview panel that showed a card's worth of
// detail. A feature built for a file therefore had nowhere on this board to
// live, which is how the committed-terms card ended up on the live deal room.
//
// KEYED ON THE REC DEAL. `[dealId]` is a rec.deals id, because this is the
// record layer's surface. The workbench room, where one exists, is resolved
// through lib/beta-file.ts resolveRoom — `workbench_deal_id` first, then an
// unambiguous file_ref, and NULL rather than a guess. Roughly 150 of the 160
// rec deals have no workbench room at all: that is the historical book, and it
// is a fact about the file rather than an error.
//
// GATED ON `deals.view`, the key the board already uses. This session adds no
// authority key.
//
// STAGE IS READ-ONLY HERE, DELIBERATELY. No advance control, no phase-complete
// button, nothing that writes a transition. public.deals.stage and
// rec.deals.stage_code carry different vocabularies and consolidating them is
// separate work; advancing a stage before that is settled would write into an
// unresolved fork.
//
// THE WRITE GUARANTEE. This surface may now write, but only one way: through an
// existing gate proxy, with a human actor. No direct database write, no new
// write path, no service-role key. tests/beta-file.test.ts enforces it across
// the whole deals-beta tree. This page adds no write at all — it is a container.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/authz'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { isDemoMode } from '@/lib/demo'
import {
  getAgentIdByEmail,
  getDealsSummary,
  getRecDealClients,
  getRecDealMilestones,
  getRecDealProperties,
  getRecDeals,
  getRecMilestoneTypes,
  getRecMortgages,
  getRecPhases,
  getRecStageEvents,
  getRecStages,
} from '@/lib/underwriting'
import { findPhase } from '@/lib/phase-model'
import {
  FILE_TABS,
  existingMortgage,
  originatingMortgage,
  resolveRoom,
  resolveTab,
  subjectProperty,
  type FlagLike,
  type TabKey,
} from '@/lib/beta-file'
import FileTabs from '@/components/admin/deals-beta/FileTabs'
import FileOverview from '@/components/admin/deals-beta/FileOverview'
import FileFlagStrip from '@/components/admin/deals-beta/FileFlagStrip'
import TabEmpty from '@/components/admin/deals-beta/TabEmpty'

export const dynamic = 'force-dynamic'

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="p-4 sm:p-6">{children}</main>
}

function Unavailable({ message }: { message: string }) {
  return (
    <Shell>
      <Link href="/portal/admin/deals-beta" className="text-sm text-cool-600 hover:text-navy">
        ‹ Back to the board
      </Link>
      <div className="mt-4 rounded-[9px] border border-amber-200 bg-amber-50 p-5">
        <p className="text-sm font-ui text-amber-800">{message}</p>
      </div>
    </Shell>
  )
}

export default async function BetaFilePage({
  params,
  searchParams,
}: {
  params: { dealId: string }
  searchParams?: { tab?: string }
}) {
  await requirePermission('deals.view')

  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  const agentId = agentRes.configured && agentRes.ok ? agentRes.data : null
  if (!agentId) {
    return <Unavailable message="The workbench is not connected right now. See Status for details." />
  }

  const [dealsR, stagesR, phasesR, eventsR, clientsR, milestonesR, typesR, mortgagesR, propsR, roomsR] =
    await Promise.all([
      getRecDeals(agentId),
      getRecStages(),
      getRecPhases(),
      getRecStageEvents(agentId),
      getRecDealClients(agentId),
      getRecDealMilestones(agentId),
      getRecMilestoneTypes(),
      getRecMortgages(agentId),
      getRecDealProperties(agentId),
      // The workbench side, read only to resolve this file's room link.
      getDealsSummary(agentId),
    ])

  if (!dealsR.configured || !dealsR.ok) {
    return <Unavailable message="The record layer did not answer for this file. Reload to retry." />
  }

  const deal = dealsR.data.find(d => d.id === params.dealId)
  if (!deal) notFound()

  const stages = stagesR.configured && stagesR.ok ? stagesR.data : []
  const phases = phasesR.configured && phasesR.ok ? phasesR.data : []
  const events = eventsR.configured && eventsR.ok ? eventsR.data : []
  const clients = clientsR.configured && clientsR.ok ? clientsR.data : []
  const milestones = milestonesR.configured && milestonesR.ok ? milestonesR.data : []
  const types = typesR.configured && typesR.ok ? typesR.data : []
  const mortgages = mortgagesR.configured && mortgagesR.ok ? mortgagesR.data : []
  const propertyLinks = propsR.configured && propsR.ok ? propsR.data : []
  const rooms = roomsR.configured && roomsR.ok ? roomsR.data : []

  const stage = stages.find(s => s.code === deal.stage_code) ?? null
  const phase = findPhase(phases, stage?.phase ?? null)
  const mortgage = originatingMortgage(deal, mortgages)
  const existing = existingMortgage(deal, mortgages)
  const property = subjectProperty(
    deal,
    propertyLinks.map(l => ({ deal_id: l.deal_id, property_id: l.property_id, role: l.role })),
    propertyLinks.map(l => ({
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

  const room = resolveRoom(deal, rooms.map(r => ({ id: r.id, file_ref: r.fileRef ?? null })))
  const roomHref = room ? `/portal/admin/deals/${room.workbenchDealId}` : null

  // No flag mechanism exists in the record layer yet; the strip is built and
  // stays empty rather than being omitted (see lib/beta-file.ts).
  const flags: FlagLike[] = []

  const active: TabKey = resolveTab(searchParams?.tab)
  const tabDef = FILE_TABS.find(t => t.key === active) ?? FILE_TABS[0]
  const base = `/portal/admin/deals-beta/${encodeURIComponent(deal.id)}`
  const hrefFor = (tab: TabKey) => (tab === 'overview' ? base : `${base}?tab=${tab}`)

  return (
    <Shell>
      <Link
        href={`/portal/admin/deals-beta${deal.file_ref ? `?deal=${encodeURIComponent(deal.file_ref)}` : ''}`}
        className="text-sm text-cool-600 hover:text-navy"
      >
        ‹ Back to the board
      </Link>

      <header className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="font-heading text-xl text-navy">{deal.file_ref ?? 'File with no reference'}</h1>
        <span className="rounded-full border border-cool-300 px-2 py-0.5 text-[11px] font-semibold text-cool-600">
          Beta
        </span>
        {roomHref ? (
          <Link href={roomHref} className="text-sm text-cool-600 underline hover:text-navy">
            Open the Deals file page
          </Link>
        ) : (
          <span className="text-[11px] text-cool-500 font-ui">No Deals file page for this file</span>
        )}
        {isDemoMode() && (
          <span className="text-[11px] text-cool-500 font-ui">Demo mode — fictional data</span>
        )}
      </header>

      <FileFlagStrip flags={flags} />

      <div className="mt-4">
        <FileTabs active={active} hrefFor={hrefFor} phaseCode={phase?.code ?? null} />
      </div>

      {active === 'overview' ? (
        <FileOverview
          // Spread so the concrete row satisfies phase-model's DealLike, which
          // carries an index signature an interface does not implicitly gain.
          deal={{ ...deal }}
          stage={stage}
          phase={phase}
          events={events}
          clients={clients}
          milestoneTypes={types}
          milestones={milestones}
          mortgage={mortgage}
          existing={existing}
          property={property}
          nowISO={new Date().toISOString()}
        />
      ) : (
        <TabEmpty tab={tabDef} roomHref={roomHref} />
      )}
    </Shell>
  )
}
