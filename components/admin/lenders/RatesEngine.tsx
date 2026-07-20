// The Rates engine (Rates v3) — reparented as three tabs of the Lenders page's
// single tab row (2026-07-20 consolidation): Scenario (who wins this deal),
// Rates (where a lender sits today / the dense table, behind a By-lender/All-
// quotes toggle), and Promos (what's live and expiring). The book is fetched
// once through a short server cache (getRateQuotesFull), so switching tabs or
// changing a scenario select re-renders without re-reading ~1,257 rows. Every
// rate carries its sheet date; approved quotes only anywhere a rate is quotable.

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
import RatesScenario from '@/components/admin/RatesScenario'
import RatesBook from '@/components/admin/RatesBook'
import RatesPromos from '@/components/admin/RatesPromos'

function val<T>(r: UwResult<T> | null): T | null {
  return r && r.configured && r.ok ? r.data : null
}

export default async function RatesEngine({ tab }: { tab: 'scenario' | 'rates' | 'promos' }) {
  await requirePermission('rates.view')

  // Promos reads its own offer feed (client-side); it needs no book.
  if (tab === 'promos') {
    return (
      <div>
        <Header />
        <div className="mt-5">
          <RatesPromos />
        </div>
      </div>
    )
  }

  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  const agentId = agentRes.configured && agentRes.ok ? agentRes.data : null
  if (!agentId) {
    return (
      <div>
        <Header />
        <div className="mt-4 bg-white border border-cool-200 rounded-[9px] p-5">
          <p className="text-sm text-cool-600 font-ui">
            {!agentRes.configured
              ? 'Workbench not connected. Rates reads approved quotes through the read-only role.'
              : 'Workbench is configured but not answering. See Status for details.'}
          </p>
        </div>
      </div>
    )
  }

  const todayYMD = torontoTodayYMD()

  if (tab === 'scenario') {
    // Scenario needs the book (cached) and the approval provenance behind each
    // approved quote's sheet review, resolved once for the product detail.
    const quotesR = await getRateQuotesFull(agentId)
    const quotes = val(quotesR) ?? []
    const reviewIds = Array.from(
      new Set(
        quotes
          .filter(q => q.status === 'approved' && q.approvedVia?.startsWith('sheet:'))
          .map(q => q.approvedVia!.slice(6)),
      ),
    )
    const provenance: Record<string, SheetProvenance> =
      val(await getSheetProvenance(agentId, reviewIds)) ?? {}
    return (
      <div>
        <Header />
        <div className="mt-5">
          <RatesScenario quotes={quotes} provenance={provenance} />
        </div>
      </div>
    )
  }

  // tab === 'rates': the book plus the coverage signals (pending sheets + intel)
  // and the unattributed rates sheets, for the By-lender / All-quotes view.
  const [quotesR, pendingR, intelR] = await Promise.all([
    getRateQuotesFull(agentId),
    getPendingSheetReviews(agentId),
    getIntelItems(agentId),
  ])
  const quotes = val(quotesR) ?? []
  const pendingSheets = val(pendingR) ?? []
  const intelItems = val(intelR) ?? []
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
  const unattributed = intelItems
    .filter(i => i.lenderSlugGuess == null && i.docClassGuess === 'rates')
    .map(i => ({ fileName: i.fileName, receivedAt: i.receivedAt }))

  return (
    <div>
      <Header />
      <div className="mt-5">
        <RatesBook quotes={quotes} coverage={coverage} todayYMD={todayYMD} unattributed={unattributed} />
      </div>
    </div>
  )
}

function Header() {
  return (
    <p className="font-ui text-sm text-cool-600">
      Describe a deal and see which lenders win it, browse where each lender sits today, and track
      the promo book, all from rate sheets Michael approved through the audited gate.
    </p>
  )
}
