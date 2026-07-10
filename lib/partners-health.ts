// Partner health math (Session 7) — pure functions, no I/O, unit-tested
// in tests/partners.test.ts. Attribution counts from conversion onward:
// a deal belongs to a partner through Referral_Partner on the Potentials
// record, which Michael links at conversion. Pre-conversion attribution
// is structurally incomplete (the Leads module has no partner fields; the
// Jul 9 hotfix records the gap and form_submissions holds the interim raw
// attribution) and the Partners page states that once.

import {
  PARTNER_TIER_THRESHOLDS,
  REFERRAL_PARTNER_TYPES,
  TIER_ORDER,
  type PartnerTier,
} from '@/config/partner-tiers'
import type { CompModel } from '@/config/comp'
import { dealRevenue, monthAdd, type RevenueDeal } from '@/lib/revenue'

function daysBetween(fromYMD: string, toYMD: string): number {
  const [fy, fm, fd] = fromYMD.split('-').map(Number)
  const [ty, tm, td] = toYMD.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

export function isReferralPartnerType(partnerType: string | null): boolean {
  return partnerType != null && (REFERRAL_PARTNER_TYPES as readonly string[]).includes(partnerType)
}

// Tier from referral recency. Null tier = not graded (funding-only
// partner types); never-referred referral partners grade dormant.
export function partnerTier(
  partnerType: string | null,
  lastReferralYMD: string | null,
  todayYMD: string,
  thresholds = PARTNER_TIER_THRESHOLDS,
): PartnerTier | null {
  if (!isReferralPartnerType(partnerType)) return null
  if (!lastReferralYMD) return 'dormant'
  const days = daysBetween(lastReferralYMD, todayYMD)
  if (days <= thresholds.activeWithinDays) return 'active'
  if (days <= thresholds.coolingWithinDays) return 'cooling'
  return 'dormant'
}

export interface PartnerReferralStats {
  referralsTotal: number
  referralsT12: number
  lastReferral: string | null
  fundedCount: number
  fundedVolume: number
  // Funded over all attributed referrals to date. Open files count
  // against until they close; the page says "x of y funded" beside it.
  conversionPct: number | null
  revenueActual: number
  revenueModeled: number
  // How many funded files priced from the model vs a real commission row.
  revenueActualCount: number
  revenueModeledCount: number
}

export function partnerReferralStats(
  attributedDeals: RevenueDeal[],
  todayYMD: string,
  model: CompModel,
  isFunded: (stage: string) => boolean,
): PartnerReferralStats {
  const t12Start = monthAdd(todayYMD.slice(0, 7), -11)
  let lastReferral: string | null = null
  let referralsT12 = 0
  let fundedCount = 0
  let fundedVolume = 0
  let revenueActual = 0
  let revenueModeled = 0
  let revenueActualCount = 0
  let revenueModeledCount = 0

  for (const d of attributedDeals) {
    if (d.createdTime) {
      if (lastReferral === null || d.createdTime > lastReferral) lastReferral = d.createdTime
      if (d.createdTime.slice(0, 7) >= t12Start) referralsT12 += 1
    }
    if (isFunded(d.stage)) {
      fundedCount += 1
      fundedVolume += d.amount
      const rev = dealRevenue(d, model)
      if (rev.basis === 'actual') {
        revenueActual += rev.amount
        revenueActualCount += 1
      } else {
        revenueModeled += rev.amount
        revenueModeledCount += 1
      }
    }
  }

  return {
    referralsTotal: attributedDeals.length,
    referralsT12,
    lastReferral,
    fundedCount,
    fundedVolume,
    conversionPct:
      attributedDeals.length > 0 ? (fundedCount / attributedDeals.length) * 100 : null,
    revenueActual,
    revenueModeled,
    revenueActualCount,
    revenueModeledCount,
  }
}

// Monday-attention ordering: tiered partners first (active before cooling
// before dormant), volume breaks ties inside a tier; untier-ed partners
// (Investors and unknown types) after, by attributed volume.
export function comparePartnersForAttention(
  a: { tier: PartnerTier | null; fundedVolume: number; referralsT12: number },
  b: { tier: PartnerTier | null; fundedVolume: number; referralsT12: number },
): number {
  if (a.tier !== null && b.tier === null) return -1
  if (a.tier === null && b.tier !== null) return 1
  if (a.tier !== null && b.tier !== null && a.tier !== b.tier) {
    return TIER_ORDER[a.tier] - TIER_ORDER[b.tier]
  }
  if (b.fundedVolume !== a.fundedVolume) return b.fundedVolume - a.fundedVolume
  return b.referralsT12 - a.referralsT12
}

// Referral cadence for the detail page: attributed deals per month over
// the trailing window, oldest first, empty months included.
export interface CadenceMonth {
  month: string
  count: number
}

export function referralCadence(
  attributedDeals: RevenueDeal[],
  todayYMD: string,
  monthsBack = 12,
): CadenceMonth[] {
  const currentMonth = todayYMD.slice(0, 7)
  const startMonth = monthAdd(currentMonth, -(monthsBack - 1))
  const months = new Map<string, number>()
  for (let i = 0; i < monthsBack; i++) months.set(monthAdd(startMonth, i), 0)
  for (const d of attributedDeals) {
    if (!d.createdTime) continue
    const ym = d.createdTime.slice(0, 7)
    if (months.has(ym)) months.set(ym, (months.get(ym) ?? 0) + 1)
  }
  return Array.from(months.entries()).map(([month, count]) => ({ month, count }))
}
