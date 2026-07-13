// Rates v3 (Session 10): a tabbed surface. Scenario (who wins this deal,
// default), Lenders (where a lender sits today), Promos (what's live and
// expiring), and All quotes (the dense table with superseded history). The
// server resolves the approved book, the pending-sheet and intel signals for
// the coverage map, and each approved quote's sheet-review provenance once,
// so the client tabs render without extra round trips. Every rate carries its
// sheet date; approved quotes only anywhere a rate is quotable.

import { requirePermission } from '@/lib/authz'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import {
  getAgentIdByEmail,
  getIntelItems,
  getPendingSheetReviews,
  getRateQuotesFull,
  getSheetProvenance,
  type SheetProvenance,
  type UwResult,
} from '@/lib/underwriting'
import { lenderCoverage } from '@/lib/lender-browse'
import { torontoTodayYMD } from '@/lib/dates'
import RatesTabs from '@/components/admin/RatesTabs'

export const dynamic = 'force-dynamic'

function val<T>(r: UwResult<T> | null): T | null {
  return r && r.configured && r.ok ? r.data : null
}

export default async function RatesPage() {
  await requirePermission('rates.view')

  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  const agentId = agentRes.configured && agentRes.ok ? agentRes.data : null

  if (!agentId) {
    return (
      <div className="max-w-5xl">
        <Header />
        <div className="mt-6 bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500 font-body">
            {!agentRes.configured
              ? 'Workbench not connected. Rates reads approved quotes through the read-only role.'
              : 'Workbench is configured but not answering. See Status for details.'}
          </p>
        </div>
      </div>
    )
  }

  const [quotesR, pendingR, intelR] = await Promise.all([
    getRateQuotesFull(agentId),
    getPendingSheetReviews(agentId),
    getIntelItems(agentId),
  ])
  const quotes = val(quotesR) ?? []
  const pendingSheets = val(pendingR) ?? []
  const intelItems = val(intelR) ?? []

  const todayYMD = torontoTodayYMD()
  const coverage = lenderCoverage(
    quotes,
    pendingSheets.map(p => ({ lenderSlug: p.lenderSlug, quoteCount: p.quoteCount })),
    intelItems.map(i => ({
      lenderSlugGuess: i.lenderSlugGuess,
      docClassGuess: i.docClassGuess,
      status: i.status,
      receivedAt: i.receivedAt,
      fileName: i.fileName,
    })),
    todayYMD,
  )
  // Captured rates sheets the ingest could not name a lender for: visible on
  // the Lenders tab so they are never silently unbucketed.
  const unattributed = intelItems
    .filter(i => i.lenderSlugGuess == null && i.docClassGuess === 'rates')
    .map(i => ({ fileName: i.fileName, receivedAt: i.receivedAt }))

  // Approval provenance for every approved quote's sheet review, resolved
  // once server-side so the scenario product detail renders it without extra
  // round trips.
  const reviewIds = Array.from(
    new Set(
      quotes
        .filter(q => q.status === 'approved' && q.approvedVia?.startsWith('sheet:'))
        .map(q => q.approvedVia!.slice(6)),
    ),
  )
  const provenanceR = await getSheetProvenance(agentId, reviewIds)
  const provenance: Record<string, SheetProvenance> = val(provenanceR) ?? {}

  return (
    <div className="max-w-5xl">
      <Header />
      <RatesTabs quotes={quotes} provenance={provenance} coverage={coverage} todayYMD={todayYMD} unattributed={unattributed} />
    </div>
  )
}

function Header() {
  return (
    <div>
      <h1 className="font-heading text-navy text-2xl font-bold">Rates</h1>
      <p className="text-gray-500 font-body text-sm mt-1">
        Describe a deal and see which lenders win it, browse where each lender sits today, and track
        the promo book, all from rate sheets Michael approved through the audited gate.
      </p>
    </div>
  )
}
