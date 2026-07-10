// Rates — the browser over the approved quote set (Session 4), built
// entirely from granted workbench tables, plus promo countdowns from the
// knowledge base. The digest strip computes week-over-week movement only
// where the data supports it; otherwise it shows sheet dates instead of a
// fake trend.

import Link from 'next/link'
import { requirePermission } from '@/lib/authz'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import {
  getAgentIdByEmail,
  getPendingSheetReviews,
  getRateQuoteBrowser,
  type UwResult,
} from '@/lib/underwriting'
import { computeLenderDigests } from '@/lib/rates'
import RatesBrowser from '@/components/admin/RatesBrowser'
import PromoCountdowns from '@/components/admin/PromoCountdowns'
import { fmtShortDate } from '@/lib/dates'

export const dynamic = 'force-dynamic'

function val<T>(r: UwResult<T> | null): T | null {
  return r && r.configured && r.ok ? r.data : null
}

export default async function RatesPage({
  searchParams,
}: {
  searchParams: { lender?: string }
}) {
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
              ? 'Workbench not connected. The rates browser reads approved quotes through the read-only role.'
              : 'Workbench is configured but not answering. See Status for details.'}
          </p>
        </div>
      </div>
    )
  }

  const [quotesR, pendingR] = await Promise.all([
    getRateQuoteBrowser(agentId),
    getPendingSheetReviews(agentId),
  ])
  const quotes = val(quotesR) ?? []
  const pendingSheets = val(pendingR) ?? []
  const digests = computeLenderDigests(quotes)

  return (
    <div className="max-w-5xl">
      <Header />

      {/* Digest strip */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {digests.map(d => (
          <div key={d.lenderSlug} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm font-body font-semibold text-navy">{d.lenderSlug}</p>
            <p className="text-xs text-gray-500 font-body mt-1">
              {d.approvedCount} approved quote{d.approvedCount === 1 ? '' : 's'}
            </p>
            <p className="text-xs text-gray-500 font-body">
              newest sheet {d.newestApprovedAsOf ? fmtShortDate(d.newestApprovedAsOf) : 'undated'}
            </p>
            {d.medianDelta !== null ? (
              <p
                className={`text-xs font-body font-semibold mt-1 ${
                  d.medianDelta > 0 ? 'text-red-600' : d.medianDelta < 0 ? 'text-green-700' : 'text-gray-500'
                }`}
              >
                median {d.medianDelta > 0 ? '+' : ''}
                {d.medianDelta} vs sheet {d.previousAsOf ? fmtShortDate(d.previousAsOf) : ''}
              </p>
            ) : (
              <p className="text-xs text-gray-400 font-body mt-1">one sheet date; no movement to compute</p>
            )}
          </div>
        ))}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm font-body font-semibold text-navy">Pending sheet reviews</p>
          <p className="font-heading text-2xl font-bold text-navy mt-1">{pendingSheets.length}</p>
          <Link href="/portal/admin/approvals" className="text-xs font-semibold text-navy underline hover:text-lime">
            Approvals desk
          </Link>
        </div>
      </div>

      {/* Promo countdowns from the knowledge base */}
      <div className="mt-6 bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-navy font-bold text-base">Promo countdowns</h2>
          <Link href="/portal/admin/knowledge" className="text-xs font-semibold text-navy hover:text-lime">
            Knowledge &rarr;
          </Link>
        </div>
        <PromoCountdowns />
      </div>

      {/* The browser */}
      <div className="mt-6">
        <RatesBrowser quotes={quotes} initialLender={searchParams.lender?.trim() || undefined} />
      </div>
    </div>
  )
}

function Header() {
  return (
    <div>
      <h1 className="font-heading text-navy text-2xl font-bold">Rates</h1>
      <p className="text-gray-500 font-body text-sm mt-1">
        The approved quote set from the workbench, with superseded history behind a toggle and
        offer expiries from the knowledge base.
      </p>
    </div>
  )
}
