// Partner detail: referral performance (Session 7, server component).
// Referred files with stages and outcomes, referral cadence over the
// trailing year, portal engagement recency, and the health signals the
// list ranks by. Read-only: this informs the touch, it is not the touch.
// No messaging or send capability exists here by design.

import Link from 'next/link'
import { COMP_MODEL } from '@/config/comp'
import { isFundedStage, isTerminalStage } from '@/config/pipeline'
import { PARTNER_TIER_THRESHOLDS, type PartnerTier } from '@/config/partner-tiers'
import { getAllDealsRevenue } from '@/lib/zoho-admin'
import { getPartnerEngagementMap } from '@/lib/partner-engagement'
import {
  partnerReferralStats,
  partnerTier,
  referralCadence,
} from '@/lib/partners-health'
import { dealRevenue, monthLabel, type RevenueDeal } from '@/lib/revenue'
import { fmtMoneyCompact, fmtShortDate, torontoTodayYMD } from '@/lib/dates'

const TIER_CHIP: Record<PartnerTier, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'bg-lime/20 text-navy border border-lime/50' },
  cooling: { label: 'Cooling', cls: 'bg-amber-100 text-amber-800 border border-amber-200' },
  dormant: { label: 'Dormant', cls: 'bg-gray-100 text-gray-500 border border-gray-200' },
}

function stageBadge(stage: string): { label: string; cls: string } {
  if (isFundedStage(stage)) return { label: stage, cls: 'bg-lime/20 text-navy' }
  if (isTerminalStage(stage)) return { label: stage, cls: 'bg-gray-100 text-gray-500' }
  return { label: stage, cls: 'bg-navy/10 text-navy' }
}

function EstChipSmall() {
  return (
    <span
      data-estimate
      title="Estimated through the comp model (config/comp.ts); the recorded Total_Commission is used wherever it exists."
      className="text-[10px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 cursor-help"
    >
      est
    </span>
  )
}

export default async function PartnerReferralSection({
  partnerId,
  partnerType,
  email,
}: {
  partnerId: string
  partnerType: string | null
  email: string | null
}) {
  const todayYMD = torontoTodayYMD()
  let attributed: RevenueDeal[] = []
  let dealsOk = true
  try {
    attributed = (await getAllDealsRevenue()).filter(d => d.referralPartnerId === partnerId)
  } catch {
    dealsOk = false
  }
  const engagement = await getPartnerEngagementMap([{ id: partnerId, email }])
  const eng = engagement.map.get(partnerId)

  const stats = partnerReferralStats(attributed, todayYMD, COMP_MODEL, isFundedStage)
  const tier = partnerTier(partnerType, stats.lastReferral, todayYMD)
  const cadence = referralCadence(attributed, todayYMD)
  const maxCadence = Math.max(1, ...cadence.map(c => c.count))
  const sorted = [...attributed].sort((a, b) => (b.createdTime ?? '').localeCompare(a.createdTime ?? ''))

  return (
    <section className="mb-8">
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <h2 className="font-heading text-xl font-bold text-navy">Referral performance</h2>
        {tier && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TIER_CHIP[tier].cls}`}>
            {TIER_CHIP[tier].label}
          </span>
        )}
        {tier && (
          <span className="text-[11px] text-gray-400 font-body">
            active inside {PARTNER_TIER_THRESHOLDS.activeWithinDays} days, cooling inside{' '}
            {PARTNER_TIER_THRESHOLDS.coolingWithinDays}
            {PARTNER_TIER_THRESHOLDS.confirmed ? '' : ' (thresholds await confirm)'}
          </span>
        )}
      </div>

      {!dealsOk && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 font-body mb-4">
          The Zoho deals read failed; referral stats show empty this load. Reload for the full
          picture.
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="font-heading text-xl text-navy">{stats.referralsT12}</p>
          <p className="text-gray-500 text-xs font-body">Referrals, trailing 12</p>
          <p className="text-gray-400 text-[11px] font-body mt-0.5">
            last {stats.lastReferral ? fmtShortDate(stats.lastReferral) : 'never'}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="font-heading text-xl text-navy">
            {stats.fundedCount} of {stats.referralsTotal}
          </p>
          <p className="text-gray-500 text-xs font-body">Funded, all time</p>
          <p className="text-gray-400 text-[11px] font-body mt-0.5">
            {stats.conversionPct !== null ? `${Math.round(stats.conversionPct)}% conversion; open files count against` : 'no referrals attributed'}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="font-heading text-xl text-navy">
            {stats.fundedVolume > 0 ? fmtMoneyCompact(stats.fundedVolume) : 'none'}
          </p>
          <p className="text-gray-500 text-xs font-body">Funded volume attributed</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="font-heading text-xl text-navy">
            {stats.revenueActual > 0 && fmtMoneyCompact(stats.revenueActual)}
            {stats.revenueActual > 0 && stats.revenueModeled > 0 && ' + '}
            {stats.revenueModeled > 0 && fmtMoneyCompact(stats.revenueModeled)}
            {stats.revenueActual === 0 && stats.revenueModeled === 0 && 'none'}
          </p>
          <p className="text-gray-500 text-xs font-body">
            Revenue attributed {stats.revenueModeled > 0 && <EstChipSmall />}
          </p>
          {stats.revenueModeled > 0 && (
            <p className="text-gray-400 text-[11px] font-body mt-0.5">
              {stats.revenueActualCount} recorded, {stats.revenueModeledCount} modeled
            </p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <p className="text-xs font-semibold text-navy mb-2">Referral cadence, trailing 12 months</p>
        <div className="flex items-end gap-1 h-16">
          {cadence.map(c => (
            <div key={c.month} className="flex-1 flex flex-col items-center justify-end h-full" title={`${monthLabel(c.month)}: ${c.count}`}>
              <span className="text-[10px] font-body text-gray-500 leading-none mb-0.5">
                {c.count > 0 ? c.count : ''}
              </span>
              <div
                className={`w-full rounded-t ${c.count > 0 ? 'bg-lime' : 'bg-gray-100'}`}
                style={{ height: `${Math.max(4, (c.count / maxCadence) * 70)}%` }}
              />
              <span className="text-[9px] font-body text-gray-400 mt-0.5 leading-none">
                {monthLabel(c.month).slice(0, 3)}
              </span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 font-body mt-2">
          Portal sign-in:{' '}
          {!engagement.ok
            ? 'not read this load (Clerk read failed)'
            : !eng?.hasAccount
              ? 'no portal account'
              : eng.lastSignInAt
                ? new Date(eng.lastSignInAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
                : 'has an account, never signed in'}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-xs font-semibold text-navy mb-2">Referred files</p>
        {sorted.length === 0 ? (
          <p className="text-sm text-gray-400 font-body py-4 text-center">
            No files carry this partner as Referral_Partner yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400 text-xs uppercase tracking-wider text-left">
                  <th className="py-2 pr-3 font-medium">File</th>
                  <th className="py-2 pr-3 font-medium">Stage</th>
                  <th className="py-2 pr-3 font-medium">Referred</th>
                  <th className="py-2 pr-3 font-medium">Amount</th>
                  <th className="py-2 pr-3 font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody className="font-body">
                {sorted.map(d => {
                  const badge = stageBadge(d.stage)
                  const rev = isFundedStage(d.stage) ? dealRevenue(d, COMP_MODEL) : null
                  return (
                    <tr key={d.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 pr-3 text-navy font-medium">
                        <Link href={`/portal/admin/deals?q=${encodeURIComponent(d.dealName)}`} className="hover:underline">
                          {d.dealName}
                        </Link>
                      </td>
                      <td className="py-2 pr-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-gray-500">{d.createdTime ? fmtShortDate(d.createdTime) : 'n/a'}</td>
                      <td className="py-2 pr-3 text-gray-700">{d.amount > 0 ? fmtMoneyCompact(d.amount) : ''}</td>
                      <td className="py-2 pr-3 text-gray-700">
                        {rev ? (
                          rev.basis === 'actual' ? (
                            fmtMoneyCompact(rev.amount)
                          ) : (
                            <span>
                              {fmtMoneyCompact(rev.amount)} <EstChipSmall />
                            </span>
                          )
                        ) : (
                          ''
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
