// Partner health tiers (Session 7). The thresholds are the editable
// policy: a partner is active while their most recent referral (the
// created date of their newest attributed deal) is inside activeWithinDays,
// cooling inside coolingWithinDays, dormant beyond that or never. Tune the
// numbers here; the tier math itself is pure and unit-tested in
// tests/partners.test.ts. Seeded sensibly, marked for Michael to confirm
// like the comp model bps rows.

export const PARTNER_TIERS_VERSION = 1

export const PARTNER_TIER_THRESHOLDS = {
  activeWithinDays: 90,
  coolingWithinDays: 270,
  confirmed: false, // flip once Michael confirms the thresholds
}

export type PartnerTier = 'active' | 'cooling' | 'dormant'

// Sort order for the Monday-attention ranking: active first, then cooling,
// then dormant; funding-only partners (Investors) carry no referral tier
// and sort after tiered partners.
export const TIER_ORDER: Record<PartnerTier, number> = {
  active: 0,
  cooling: 1,
  dormant: 2,
}

// Partner types whose relationship is referral-shaped. Investors fund
// deals (attributed via Investor_Name, a different field); grading them on
// referral recency would mislabel every one dormant, so they carry no tier.
export const REFERRAL_PARTNER_TYPES = [
  'Realtor',
  'Lawyer',
  'Financial Planner',
  'Mortgage Agent',
] as const
