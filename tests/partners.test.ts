// Partner health tests (Session 7). What these prove: the tier thresholds
// grade referral recency the way config/partner-tiers.ts states (active,
// cooling, dormant, never-referred as dormant), investors carry no tier
// rather than a false dormant, the attention ordering is health then
// volume, the stats keep actual and modeled revenue separate, and the
// cadence walk includes empty months.

import { describe, expect, it } from 'vitest'
import { PARTNER_TIER_THRESHOLDS, PARTNER_TIERS_VERSION } from '@/config/partner-tiers'
import { isFundedStage } from '@/config/pipeline'
import { COMP_MODEL_VERSION, type CompModel } from '@/config/comp'
import {
  comparePartnersForAttention,
  isReferralPartnerType,
  partnerReferralStats,
  partnerTier,
  referralCadence,
} from '@/lib/partners-health'
import type { RevenueDeal } from '@/lib/revenue'

const TODAY = '2026-07-10'

const MODEL: CompModel = {
  version: COMP_MODEL_VERSION,
  rows: [],
  defaultBps: { bps: 100, confirmed: true },
  networkSplit: { value: 0.15, confirmed: true },
  agentSplit: 1.0,
}

function deal(overrides: Partial<RevenueDeal>): RevenueDeal {
  return {
    id: 'x',
    dealName: 'TEST',
    stage: 'Collecting Documentation',
    amount: 500_000,
    closingDate: null,
    createdTime: null,
    totalCommission: 0,
    bps: null,
    vbBps: null,
    splitToNetwork: null,
    lenderName: null,
    lenderClassification: null,
    referralPartnerId: 'p1',
    referralPartnerName: 'Test Partner',
    rateType: null,
    termYears: null,
    mortgageType: null,
    transactionType: null,
    mortgageRate: null,
    ...overrides,
  }
}

describe('partner tiers', () => {
  it('grades referral recency against the configured thresholds', () => {
    expect(partnerTier('Realtor', '2026-06-01', TODAY)).toBe('active')
    expect(partnerTier('Realtor', '2026-04-11', TODAY)).toBe('active') // day 90
    expect(partnerTier('Realtor', '2026-04-10', TODAY)).toBe('cooling') // day 91
    expect(partnerTier('Realtor', '2025-10-14', TODAY)).toBe('cooling') // inside 270
    expect(partnerTier('Realtor', '2025-01-01', TODAY)).toBe('dormant')
    expect(partnerTier('Lawyer', null, TODAY)).toBe('dormant') // never referred
  })

  it('investors carry no referral tier rather than a false dormant', () => {
    expect(partnerTier('Investor', null, TODAY)).toBeNull()
    expect(partnerTier('Investor', '2026-07-01', TODAY)).toBeNull()
    expect(isReferralPartnerType('Investor')).toBe(false)
    expect(isReferralPartnerType('Financial Planner')).toBe(true)
  })

  it('thresholds are the seeded v1 values awaiting confirm', () => {
    expect(PARTNER_TIERS_VERSION).toBe(1)
    expect(PARTNER_TIER_THRESHOLDS.activeWithinDays).toBe(90)
    expect(PARTNER_TIER_THRESHOLDS.coolingWithinDays).toBe(270)
    expect(PARTNER_TIER_THRESHOLDS.confirmed).toBe(false)
  })
})

describe('partner referral stats', () => {
  it('keeps actual and modeled revenue separate and counts conversion honestly', () => {
    const deals = [
      deal({ id: 'a', createdTime: '2026-05-01', stage: 'Funded', amount: 400_000, closingDate: '2026-06-01', totalCommission: 5_000 }),
      deal({ id: 'b', createdTime: '2026-06-15', stage: 'Funded', amount: 600_000, closingDate: '2026-07-01' }),
      deal({ id: 'c', createdTime: '2026-07-01', stage: 'Collecting Documentation' }),
      deal({ id: 'd', createdTime: '2024-01-05', stage: 'Mortgage Lost' }),
    ]
    const s = partnerReferralStats(deals, TODAY, MODEL, isFundedStage)
    expect(s.referralsTotal).toBe(4)
    expect(s.referralsT12).toBe(3)
    expect(s.lastReferral).toBe('2026-07-01')
    expect(s.fundedCount).toBe(2)
    expect(s.fundedVolume).toBe(1_000_000)
    expect(s.conversionPct).toBe(50)
    expect(s.revenueActual).toBe(5_000)
    expect(s.revenueActualCount).toBe(1)
    // 600,000 x 100/10,000 x 0.85 = 5,100 modeled
    expect(s.revenueModeled).toBeCloseTo(5_100, 2)
    expect(s.revenueModeledCount).toBe(1)
  })

  it('an empty attribution set yields zeros and a null conversion, never NaN', () => {
    const s = partnerReferralStats([], TODAY, MODEL, isFundedStage)
    expect(s.referralsTotal).toBe(0)
    expect(s.conversionPct).toBeNull()
    expect(s.lastReferral).toBeNull()
  })
})

describe('attention ordering', () => {
  it('sorts health first, then funded volume, with untiered partners last', () => {
    const rows = [
      { name: 'dormant-big', tier: 'dormant' as const, fundedVolume: 5_000_000, referralsT12: 0 },
      { name: 'active-small', tier: 'active' as const, fundedVolume: 100_000, referralsT12: 2 },
      { name: 'investor', tier: null, fundedVolume: 9_000_000, referralsT12: 0 },
      { name: 'active-big', tier: 'active' as const, fundedVolume: 900_000, referralsT12: 1 },
      { name: 'cooling', tier: 'cooling' as const, fundedVolume: 2_000_000, referralsT12: 1 },
    ]
    const sorted = [...rows].sort(comparePartnersForAttention).map(r => r.name)
    expect(sorted).toEqual(['active-big', 'active-small', 'cooling', 'dormant-big', 'investor'])
  })
})

describe('referral cadence', () => {
  it('walks the trailing window with empty months present', () => {
    const cadence = referralCadence(
      [deal({ createdTime: '2026-06-15' }), deal({ createdTime: '2026-06-20' }), deal({ createdTime: '2025-09-01' })],
      TODAY,
    )
    expect(cadence).toHaveLength(12)
    expect(cadence[0].month).toBe('2025-08')
    expect(cadence.find(c => c.month === '2026-06')?.count).toBe(2)
    expect(cadence.find(c => c.month === '2025-09')?.count).toBe(1)
    expect(cadence.find(c => c.month === '2026-01')?.count).toBe(0)
  })
})
