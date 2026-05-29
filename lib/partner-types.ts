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
   * Zoho Deals (Potentials) lookup field that links a Deal to this
   * partner type. Used by the per-portal client list query
   * (`criteria=({field}:equals:{partnerId})`).
   */
  dealLookupField: string

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
    dealLookupField: 'Referral_Partner',
    portalDashboard: '/portal/fp/dashboard',
    usesPartnerOnboarding: true,
  },
  realtor: {
    kind: 'realtor',
    zohoPartnerType: 'Realtor',
    zohoProspectType: 'Realtor Prospect',
    clerkMetadataKey: 'realtor_zoho_id',
    clerkRole: 'realtor',
    // All referring partners (realtor/lawyer/FP) are attributed via the
    // single Referral_Partner lookup in Zoho; the type-specific Realtor /
    // Lawyer lookups are never populated for referral attribution, so the
    // portal filters on Referral_Partner like the FP portal does. Portal
    // type is still decided by Partner_Type / Clerk role, not this field.
    dealLookupField: 'Referral_Partner',
    portalDashboard: '/portal/realtor/dashboard',
    usesPartnerOnboarding: true,
  },
  lawyer: {
    kind: 'lawyer',
    zohoPartnerType: 'Lawyer',
    clerkMetadataKey: 'lawyer_zoho_id',
    clerkRole: 'lawyer',
    // See realtor note — filters on Referral_Partner, the field that
    // actually carries referral attribution for every partner type.
    dealLookupField: 'Referral_Partner',
    portalDashboard: '/portal/lawyer/dashboard',
    usesPartnerOnboarding: true,
  },
  mortgage_agent: {
    kind: 'mortgage_agent',
    zohoPartnerType: 'Mortgage Agent',
    clerkMetadataKey: 'mortgage_agent_zoho_id',
    clerkRole: 'mortgage_agent',
    // Same referral-partner attribution as realtor/lawyer/FP — see realtor
    // note. All referring partners are linked to Deals via the single
    // Referral_Partner lookup; portal type is decided by Partner_Type /
    // Clerk role, not this field.
    dealLookupField: 'Referral_Partner',
    portalDashboard: '/portal/mortgage-agent/dashboard',
    usesPartnerOnboarding: true,
  },
  investor: {
    kind: 'investor',
    zohoPartnerType: 'Investor',
    clerkMetadataKey: 'zoho_partner_id',
    clerkRole: 'investor',
    // Investors don't appear on a Deal lookup — they hold positions,
    // not borrower relationships. dealLookupField is intentionally a
    // sentinel that would never match a real deal field; callers
    // checking `usesPartnerOnboarding` should never reach this.
    dealLookupField: '__investor_no_deal_lookup__',
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
