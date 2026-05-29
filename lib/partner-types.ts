// Central config for every partner type Fox Mortgage supports across
// the portal + onboarding stack. Single source of truth — adding a new
// partner type (e.g. Accountant, Insurance Advisor as a portal user) is
// a one-entry change here; the partner onboarding flow, role ladder,
// admin impersonate gate, and metadata-key picker all read from this.
//
// Investor is included for completeness but `usesPartnerOnboarding:
// false` — investors have their own onboarding flow (multi-step hub,
// state machine, investor-specific email copy) at /onboard/investor.
// The partner onboarding flow at /onboard/partner explicitly refuses
// to act on investor records and routes the admin to the existing
// investor route instead.

export type PartnerKind = 'fp' | 'realtor' | 'lawyer' | 'mortgage_agent' | 'investor'

export interface PartnerTypeConfig {
  /** Internal kind tag — used as the discriminator in code. */
  kind: PartnerKind

  /**
   * Exact Zoho `Partner_Type` picklist value. Case-sensitive on the
   * Zoho side — keep these aligned with the live picklist.
   */
  zohoPartnerType: string

  /**
   * Zoho `Partner_Type` value for the "prospect" variant (where it
   * exists). FP and Realtor have prospect variants today. The lookup
   * helper resolves prospect → base kind so a "Realtor Prospect"
   * record is treated as a realtor for portal/onboarding purposes.
   */
  zohoProspectType?: string

  /**
   * Clerk `publicMetadata` key that stores the Zoho Partner record id
   * for this kind. Reading the wrong key on signup silently breaks
   * the portal — the gate-lift investigation (May 28) found the
   * investor route hardcoded `zoho_partner_id` which would mis-tag
   * every other partner type. This config makes the choice explicit.
   */
  clerkMetadataKey: string

  /**
   * Clerk `publicMetadata.roles[]` value for this kind. The portal
   * role ladder at app/portal/page.tsx routes by this value.
   */
  clerkRole: string

  /**
   * Zoho Deals (Potentials) lookup fields that attribute a Deal to this
   * partner. The per-portal client list / dashboard / detail queries match
   * a deal when the partner's Zoho id appears in ANY of these fields (an OR
   * union), e.g. `((Realtor:equals:{id})or(Referral_Partner:equals:{id}))`.
   *
   * Deals carry more than one partner at once: a referrer (Referral_Partner)
   * plus the professional attached in their role (Realtor / Lawyer). A
   * partner should see a file whether they referred it OR are attached to it
   * in their professional role — so realtor/lawyer match BOTH their role
   * field and Referral_Partner. FP and mortgage agent have no dedicated
   * Deals lookup and attribute through Referral_Partner only.
   */
  dealMatchFields: string[]

  /** Post-signup redirect / "your portal" URL for this kind. */
  portalDashboard: string

  /**
   * Whether this kind uses the shared partner onboarding flow at
   * /onboard/partner. Investors have a separate, multi-step flow at
   * /onboard/investor and are intentionally NOT routed through the
   * partner flow.
   */
  usesPartnerOnboarding: boolean
}

export const PARTNER_TYPE_CONFIGS: Record<PartnerKind, PartnerTypeConfig> = {
  fp: {
    kind: 'fp',
    zohoPartnerType: 'Financial Planner',
    zohoProspectType: 'Financial Planner Prospect',
    clerkMetadataKey: 'fp_zoho_id',
    clerkRole: 'financial-planner',
    // No dedicated Financial_Planner lookup on Deals — FPs attribute via
    // Referral_Partner only.
    dealMatchFields: ['Referral_Partner'],
    portalDashboard: '/portal/fp/dashboard',
    usesPartnerOnboarding: true,
  },
  realtor: {
    kind: 'realtor',
    zohoPartnerType: 'Realtor',
    zohoProspectType: 'Realtor Prospect',
    clerkMetadataKey: 'realtor_zoho_id',
    clerkRole: 'realtor',
    // A realtor sees a deal whether they referred it (Referral_Partner) or are
    // attached on it as the buyer's realtor (Realtor) or the seller's realtor
    // (Seller_s_Realtor). Deals routinely carry a different referrer than the
    // attached realtor — e.g. an FP refers the deal and a realtor is attached —
    // so we match the UNION of all three fields. Portal type is still decided
    // by Partner_Type / Clerk role, not these.
    dealMatchFields: ['Realtor', 'Seller_s_Realtor', 'Referral_Partner'],
    portalDashboard: '/portal/realtor/dashboard',
    usesPartnerOnboarding: true,
  },
  lawyer: {
    kind: 'lawyer',
    zohoPartnerType: 'Lawyer',
    clerkMetadataKey: 'lawyer_zoho_id',
    clerkRole: 'lawyer',
    // See realtor note — a lawyer sees a deal whether they referred it
    // (Referral_Partner) or are the attached lawyer on it (Lawyer lookup).
    dealMatchFields: ['Lawyer', 'Referral_Partner'],
    portalDashboard: '/portal/lawyer/dashboard',
    usesPartnerOnboarding: true,
  },
  mortgage_agent: {
    kind: 'mortgage_agent',
    zohoPartnerType: 'Mortgage Agent',
    clerkMetadataKey: 'mortgage_agent_zoho_id',
    clerkRole: 'mortgage_agent',
    // No dedicated Mortgage_Agent lookup on Deals — mortgage agents attribute
    // via Referral_Partner only (same as FP). Note: the mortgage-agent data
    // layer delegates to the realtor functions, so these match fields are
    // passed explicitly to keep it from inheriting the Realtor field.
    dealMatchFields: ['Referral_Partner'],
    portalDashboard: '/portal/mortgage-agent/dashboard',
    usesPartnerOnboarding: true,
  },
  investor: {
    kind: 'investor',
    zohoPartnerType: 'Investor',
    clerkMetadataKey: 'zoho_partner_id',
    clerkRole: 'investor',
    // Investors don't appear on a Deal lookup — they hold positions, not
    // borrower relationships. No deal-match fields; the investor portal
    // resolves positions via a separate code path and never calls the
    // partner deal-union queries.
    dealMatchFields: [],
    portalDashboard: '/portal/investor/dashboard',
    usesPartnerOnboarding: false,
  },
}

/**
 * Resolve a Zoho `Partner_Type` picklist string to its config.
 * Case-insensitive. Resolves "Realtor Prospect" / "Financial Planner
 * Prospect" to their base kind. Returns null for unknown types (e.g.
 * 'Insurance Advisor', 'Underwriter', 'Lender' which don't have
 * portals today).
 */
export function getPartnerConfigByZohoType(
  partnerType: string | null | undefined,
): PartnerTypeConfig | null {
  if (!partnerType) return null
  const needle = partnerType.trim().toLowerCase()
  if (!needle) return null
  for (const config of Object.values(PARTNER_TYPE_CONFIGS)) {
    if (config.zohoPartnerType.toLowerCase() === needle) return config
    if (config.zohoProspectType && config.zohoProspectType.toLowerCase() === needle) {
      return config
    }
  }
  return null
}

/** Resolve a config by internal kind. Convenience accessor. */
export function getPartnerConfigByKind(kind: PartnerKind): PartnerTypeConfig {
  return PARTNER_TYPE_CONFIGS[kind]
}

/**
 * Resolve a config by Clerk role string (e.g. 'realtor',
 * 'financial-planner', 'lawyer', 'investor'). Used by the portal
 * role ladder and admin impersonate route. Returns null if the role
 * is not one we recognize (e.g. 'admin', or arbitrary strings).
 */
export function getPartnerConfigByClerkRole(
  role: string | null | undefined,
): PartnerTypeConfig | null {
  if (!role) return null
  for (const config of Object.values(PARTNER_TYPE_CONFIGS)) {
    if (config.clerkRole === role) return config
  }
  return null
}
