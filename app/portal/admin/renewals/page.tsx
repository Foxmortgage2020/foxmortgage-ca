// The Renewal Radar. Every funded deal with a maturity date, bucketed by
// window. Read-only from Zoho; status writes go through the confirmed-action
// route. The buckets are the product: Lapsed is an alarm, not a status.
//
// Reconciles live (2026-07-12): Lapsed 18 files, Action 8 / $4,368,600,
// Monitoring 0, Watching 22, Resolved 0; renewal book $17.95M under
// management; 6 funded deals have no maturity date.

import Link from 'next/link'
import { can, requirePermission } from '@/lib/authz'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { getRenewalDeals } from '@/lib/zoho-admin'
import { getAgentIdByEmail, getDealsSummary, getRateQuotesFull } from '@/lib/underwriting'
import {
  RENEWAL_ACTIONS,
  bestApprovedFixed,
  bucketRenewals,
  daysToMaturity,
  hasNoOutcome,
  paymentShock,
  renewalBook,
  type ApprovedFixedQuote,
  type RenewalDeal,
} from '@/lib/renewals'
import { isDemoMode } from '@/lib/demo'
import { fmtMoney, fmtMoneyCompact, fmtShortDate, torontoTodayYMD } from '@/lib/dates'
import RenewalCard from '@/components/admin/RenewalCard'

export const dynamic = 'force-dynamic'

const zohoDealUrl = (id: string) => `https://crm.zoho.com/crm/org906105026/tab/Potentials/${id}`
const prepHrefFor = (d: RenewalDeal) =>
  `/portal/admin/agent?prep=${encodeURIComponent(d.contactName ?? d.dealName)}`
const ALL_ACTIONS = Object.values(RENEWAL_ACTIONS)

export default async function RenewalsPage() {
  const user = await requirePermission('renewals.view')
  const todayYMD = torontoTodayYMD()

  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  const agentId = agentRes.configured && agentRes.ok ? agentRes.data : null

  let renewals
  try {
    renewals = await getRenewalDeals()
  } catch {
    renewals = null
  }

  const [quotesR, wbDealsR] = await Promise.all([
    agentId ? getRateQuotesFull(agentId) : Promise.resolve(null),
    agentId ? getDealsSummary(agentId) : Promise.resolve(null),
  ])

  if (!renewals) {
    return (
      <div className="max-w-3xl">
        <Header />
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500 font-body">
            The Zoho read failed, so the radar cannot compute right now. Reload in a moment; nothing
            here caches a stale figure.
          </p>
        </div>
      </div>
    )
  }

  // Best approved fixed rate for the payment-shock benchmark (read-only role).
  const quotes: ApprovedFixedQuote[] =
    quotesR && quotesR.configured && quotesR.ok
      ? quotesR.data.map(q => ({
          rate: q.rate,
          rateType: q.rateType,
          termMonths: q.termMonths,
          asOfDate: q.asOfDate,
          status: q.status,
          lenderSlug: q.lenderSlug,
        }))
      : []
  const best = bestApprovedFixed(quotes)

  // Workbench deal room links, matched by Zoho id (same join Home uses).
  const wbByZohoId = new Map<string, string>()
  if (wbDealsR && wbDealsR.configured && wbDealsR.ok) {
    for (const d of wbDealsR.data) if (d.zohoPotentialId) wbByZohoId.set(d.zohoPotentialId, d.id)
  }

  const buckets = bucketRenewals(renewals.withMaturity, todayYMD)
  const book = renewalBook(renewals.withMaturity, todayYMD)
  const canDecide = can(user, 'renewals.decide') && !isDemoMode()

  const lapsedNoOutcome = buckets.lapsed.deals.filter(hasNoOutcome)
  const lapsedNoOutcomeVol = lapsedNoOutcome.reduce((s, d) => s + d.amount, 0)

  const cardProps = (d: RenewalDeal, tone: 'red' | 'amber' | 'gray' | 'green') => ({
    deal: d,
    shock: paymentShock(d, best),
    daysRemaining: d.maturityDate ? daysToMaturity(d.maturityDate, todayYMD) : null,
    tone,
    prepHref: prepHrefFor(d),
    dealHref: wbByZohoId.has(d.id) ? `/portal/admin/deals/${wbByZohoId.get(d.id)}` : null,
    zohoHref: zohoDealUrl(d.id),
    canDecide,
    actions: ALL_ACTIONS,
  })

  return (
    <div className="max-w-4xl space-y-6">
      <Header />

      {/* ── Missing maturity: the block that must reach empty ── */}
      {renewals.missingMaturity.length > 0 ? (
        <div className="border-2 border-red-300 bg-red-50 rounded-xl p-5">
          <h2 className="font-heading font-bold text-red-800 text-base">
            {renewals.missingMaturity.length} funded deal
            {renewals.missingMaturity.length === 1 ? '' : 's'} have no maturity date and cannot be
            tracked for renewal
          </h2>
          <p className="text-xs font-body text-red-700 mt-1 mb-3">
            Invisible to every part of this system until a maturity date is backfilled from the
            commitment. This block persists until it is empty.
          </p>
          <div className="space-y-1">
            {renewals.missingMaturity.map(d => (
              <div key={d.id} className="flex items-center justify-between gap-3 text-xs font-body border-t border-red-200 py-1.5">
                <span className="text-navy truncate">{d.contactName ?? d.dealName}</span>
                <span className="flex items-center gap-3 shrink-0">
                  <span className="text-gray-600">{fmtMoney(d.amount)}</span>
                  <a href={zohoDealUrl(d.id)} target="_blank" rel="noreferrer" className="text-red-700 font-semibold underline">
                    backfill in Zoho
                  </a>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="border border-green-200 bg-green-50 rounded-xl px-4 py-3">
          <p className="text-sm text-green-800 font-body">
            Every funded deal has a maturity date. The renewal system can see them all.
          </p>
        </div>
      )}

      {/* ── Renewal book KPI ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-heading font-bold text-navy text-base mb-3">Renewal book</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <BookStat label="Book under management" value={fmtMoney(book.underManagement.volume)} sub={`${book.underManagement.count} funded files not yet matured`} />
          <BookStat label="Maturing next 12 months" value={fmtMoney(book.maturingNext12.volume)} sub={`${book.maturingNext12.count} files`} />
          <BookStat label="Lapsed" value={fmtMoney(book.lapsed.volume)} sub={`${book.lapsed.count} files`} tone={book.lapsed.count > 0 ? 'bad' : undefined} />
        </div>
      </div>

      {/* ── Lapsed: the alarm. Non-collapsible, sorted by amount. ── */}
      <section>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <h2 className="font-heading font-bold text-red-700 text-lg">Lapsed</h2>
          <span className="text-sm font-body text-red-700 font-semibold">
            {buckets.lapsed.count} files · {fmtMoney(buckets.lapsed.volume)}
          </span>
        </div>
        <p className="text-xs font-body text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
          Matured with no recorded outcome. This is a system failure, not a status.{' '}
          {lapsedNoOutcome.length > 0 && (
            <>
              {lapsedNoOutcome.length} of these ({fmtMoney(lapsedNoOutcomeVol)}) have no renewal
              outcome recorded at all.
            </>
          )}
        </p>
        {buckets.lapsed.count === 0 ? (
          <p className="text-sm text-gray-400 font-body">No lapsed renewals. Every matured file has an outcome.</p>
        ) : (
          <div className="space-y-2">
            {buckets.lapsed.deals.map(d => (
              <RenewalCard key={d.id} {...cardProps(d, 'red')} />
            ))}
          </div>
        )}
      </section>

      {/* ── Action now (0-130 days) ── */}
      <BucketSection title="Action now" tone="amber" hint="Zero to 130 days to maturity. The 120-day rate-hold window opens inside this. Michael must engage." bucket={buckets.action} cardProps={cardProps} cardTone="amber" />

      {/* ── Monitoring (130-150 days) ── */}
      <BucketSection title="Monitoring" tone="gray" hint="130 to 150 days out. The Strategic Mortgage Monitoring drip should be running here." bucket={buckets.monitoring} cardProps={cardProps} cardTone="amber" />

      {/* ── Watching (150+ days): compact, visibility only ── */}
      <section>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="w-2.5 h-2.5 rounded-full bg-gray-300" />
          <h2 className="font-heading font-bold text-navy text-lg">Watching</h2>
          <span className="text-sm font-body text-gray-500">
            {buckets.watching.count} files · {fmtMoney(buckets.watching.volume)}
          </span>
        </div>
        <p className="text-xs font-body text-gray-400 mb-2">150+ days out. Visibility only, no action.</p>
        {buckets.watching.count === 0 ? (
          <p className="text-sm text-gray-400 font-body">Nothing further out on the book.</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-x-auto">
            {buckets.watching.deals.map(d => (
              <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-2 text-xs font-body min-w-[440px]">
                <span className="text-navy truncate flex-1">{d.contactName ?? d.dealName}</span>
                <span className="text-gray-500 w-20 text-right">{fmtMoneyCompact(d.amount)}</span>
                <span className="text-gray-500 w-24 text-right">{fmtShortDate(d.maturityDate)}</span>
                <span className="text-gray-400 w-16 text-right">
                  {d.maturityDate ? `${daysToMaturity(d.maturityDate, todayYMD)}d` : ''}
                </span>
                <a href={zohoDealUrl(d.id)} target="_blank" rel="noreferrer" className="text-navy hover:text-lime shrink-0">
                  Zoho
                </a>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Resolved ── */}
      <section>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
          <h2 className="font-heading font-bold text-navy text-lg">Resolved</h2>
          <span className="text-sm font-body text-gray-500">
            {buckets.resolved.count} files · {fmtMoney(buckets.resolved.volume)}
          </span>
        </div>
        {buckets.resolved.count === 0 ? (
          <p className="text-sm text-gray-400 font-body">
            No renewals resolved yet. An outcome lands here once a renewal is marked renewed elsewhere,
            no longer needed, or opted out.
          </p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
            {buckets.resolved.deals.map(d => (
              <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-2 text-xs font-body">
                <span className="text-navy truncate">{d.contactName ?? d.dealName}</span>
                <span className="flex items-center gap-3 shrink-0">
                  <span className="text-gray-500">{fmtMoneyCompact(d.amount)}</span>
                  <span className="text-green-700 font-semibold">{d.renewalStatus ?? 'opted out'}</span>
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] font-body text-gray-400 mt-2">
          A won renewal cannot be recorded yet: Zoho&apos;s Renewal_Status picklist has no retained
          value (its options are the contact-attempt sequence, renewed elsewhere, no longer needs a
          mortgage, and application sent). Adding a retained value is a Zoho follow-up.
        </p>
      </section>
    </div>
  )
}

function Header() {
  return (
    <div className="mb-1">
      <h1 className="font-heading text-navy text-2xl font-bold">Renewals</h1>
      <p className="text-gray-500 font-body text-sm mt-1">
        Every funded deal by maturity window. The payment shock is why a client answers the phone;
        the buckets are why none of them slips again.
      </p>
    </div>
  )
}

function BookStat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'bad' }) {
  return (
    <div className="border border-gray-100 rounded-lg px-3 py-2 bg-gray-50/50">
      <p className="text-[11px] font-body text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`font-heading font-bold text-lg ${tone === 'bad' ? 'text-red-600' : 'text-navy'}`}>{value}</p>
      <p className="text-[11px] font-body text-gray-500 mt-0.5">{sub}</p>
    </div>
  )
}

function BucketSection({
  title,
  tone,
  hint,
  bucket,
  cardProps,
  cardTone,
}: {
  title: string
  tone: 'amber' | 'gray'
  hint: string
  bucket: { deals: RenewalDeal[]; count: number; volume: number }
  cardProps: (d: RenewalDeal, t: 'red' | 'amber' | 'gray' | 'green') => any
  cardTone: 'amber' | 'gray'
}) {
  return (
    <section>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className={`w-2.5 h-2.5 rounded-full ${tone === 'amber' ? 'bg-amber-500' : 'bg-gray-300'}`} />
        <h2 className="font-heading font-bold text-navy text-lg">{title}</h2>
        <span className="text-sm font-body text-gray-500">
          {bucket.count} files · {fmtMoney(bucket.volume)}
        </span>
      </div>
      <p className="text-xs font-body text-gray-400 mb-3">{hint}</p>
      {bucket.count === 0 ? (
        <p className="text-sm text-gray-400 font-body">Nothing in this window right now.</p>
      ) : (
        <div className="space-y-2">
          {bucket.deals.map(d => (
            <RenewalCard key={d.id} {...cardProps(d, cardTone)} />
          ))}
        </div>
      )}
    </section>
  )
}
