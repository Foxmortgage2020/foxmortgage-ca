// Beyond funding (B3) — the lifecycle's last phase as a page: the Renewal
// Radar and the Strategic Mortgage Monitoring opportunity board as tabs
// over one summary strip. Both engines are REPARENTED unchanged (no
// fetcher, gate, or logic changes; each tab still runs its own
// requirePermission). The stepper's Beyond funding link and the Deals
// list's funded rows land here; the nav badge sums what the two badges
// showed separately (lib/desk.ts).
//
// The strip computes from the SAME loaders the tabs read, the Home desk
// pattern: renewal windows from bucketRenewals over the live Zoho read,
// opportunity buckets from analyzeMortgage over the latest monitoring
// export against the approved book (headline counts only — the board's
// override- and claim-aware figures live on its own tab). Demo resolves
// the borrower-side sources from fixtures and empty stores.

import { redirect } from 'next/navigation'
import { can, getSessionUser } from '@/lib/authz'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { getAgentIdByEmail, getRateQuotesFull } from '@/lib/underwriting'
import { getRenewalDeals } from '@/lib/zoho-admin'
import { bucketRenewals } from '@/lib/renewals'
import { rawRowsForUpload, recentUploads, smmStoreConfigured } from '@/lib/smm-store'
import { collapseCoBorrowers, parseSmmRow } from '@/lib/smm'
import { analyzeMortgage, bookQuoteFromRow } from '@/lib/smm-analysis'
import type { BookQuote } from '@/lib/smm-match'
import { isDemoMode } from '@/lib/demo'
import { fmtMoneyCompact, torontoTodayYMD } from '@/lib/dates'
import SummaryStrip, { type StripTile } from '@/components/admin/ds/SummaryStrip'
import TabBar from '@/components/admin/ds/TabBar'
import RenewalsTab from '@/components/admin/beyond/RenewalsTab'
import OpportunitiesTab from '@/components/admin/beyond/OpportunitiesTab'

export const dynamic = 'force-dynamic'

const TAB_KEYS = ['renewals', 'opportunities'] as const
type BeyondTabKey = (typeof TAB_KEYS)[number]

export default async function BeyondFundingPage({
  searchParams,
}: {
  searchParams: { tab?: string }
}) {
  const user = await getSessionUser()
  if (!user) redirect('/portal/sign-in')

  // Per-tab access mirrors the two merged pages' own permission keys
  // exactly — composition, never widening.
  const allowed = TAB_KEYS.filter(k =>
    k === 'renewals' ? can(user, 'renewals.view') : can(user, 'opportunities.view'),
  )
  if (allowed.length === 0) redirect('/portal')

  const requested = searchParams.tab
  const active: BeyondTabKey =
    requested && (TAB_KEYS as readonly string[]).includes(requested) && allowed.includes(requested as BeyondTabKey)
      ? (requested as BeyondTabKey)
      : allowed[0]

  const todayYMD = torontoTodayYMD()
  const tiles: StripTile[] = []

  // Renewal windows (the radar's own bucketing over the live Zoho read).
  if (can(user, 'renewals.view')) {
    try {
      const renewals = await getRenewalDeals()
      const buckets = bucketRenewals(renewals.withMaturity, todayYMD)
      tiles.push({
        key: 'action',
        label: 'renewals to action',
        value: String(buckets.action.count),
        sub: fmtMoneyCompact(buckets.action.volume),
      })
      tiles.push({
        key: 'lapsed',
        label: 'lapsed renewals',
        value: String(buckets.lapsed.count),
        sub: fmtMoneyCompact(buckets.lapsed.volume),
        tone: buckets.lapsed.count > 0 ? 'caution' : undefined,
      })
      tiles.push({
        key: 'watching',
        label: 'watching further out',
        value: String(buckets.monitoring.count + buckets.watching.count),
      })
    } catch {
      // A failed Zoho read renders no renewal tiles; the tab states it.
    }
  }

  // Opportunity buckets (headline counts over the latest export, the desk
  // pattern; the board's override-aware figures live on its tab).
  if (can(user, 'opportunities.view') && smmStoreConfigured()) {
    try {
      const uploadsR = await recentUploads(3)
      const uploads = uploadsR.configured && uploadsR.ok ? uploadsR.data : []
      const cur = uploads.find(u => !u.superseded) ?? uploads[0] ?? null
      if (cur) {
        const rowsR = await rawRowsForUpload(cur.id)
        if (rowsR.configured && rowsR.ok) {
          const { mortgages } = collapseCoBorrowers(rowsR.data.map(parseSmmRow))
          const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
          const agentId = agentRes.configured && agentRes.ok ? agentRes.data : null
          // Lender data stays real in demo (Session 9 contract), but the
          // demo export is empty, so this branch never runs there.
          const quotesR = agentId && !isDemoMode() ? await getRateQuotesFull(agentId) : null
          const book: BookQuote[] =
            quotesR && quotesR.configured && quotesR.ok ? quotesR.data.map(bookQuoteFromRow) : []
          let actNow = 0
          let review = 0
          for (const m of mortgages) {
            const { analysis } = analyzeMortgage(m.primary, book, todayYMD)
            if (analysis.bucket === 'act_now') actNow++
            if (analysis.bucket === 'review') review++
          }
          tiles.push({ key: 'act_now', label: 'opportunities to act on', value: String(actNow) })
          tiles.push({
            key: 'review',
            label: 'files in review',
            value: String(review),
            tone: review > 0 ? 'caution' : undefined,
          })
        }
      }
    } catch {
      // A store outage renders no opportunity tiles; the tab states it.
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-4">
        <h1 className="font-heading text-navy text-2xl font-bold tracking-tight">Beyond funding</h1>
        <p className="mt-1 font-ui text-[13px] text-cool-700">
          Funded clients on the radar: renewals by maturity window and the monitoring opportunity
          board.
        </p>
      </div>
      {tiles.length > 0 && <SummaryStrip tiles={tiles} />}
      <TabBar
        tabs={allowed.map(k => ({
          key: k,
          label: k === 'renewals' ? 'Renewals' : 'Opportunities',
          href: `/portal/admin/beyond?tab=${k}`,
        }))}
        active={active}
      />
      {active === 'renewals' && <RenewalsTab />}
      {active === 'opportunities' && <OpportunitiesTab />}
    </div>
  )
}
