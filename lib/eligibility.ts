// Lender & program eligibility for every ranked surface.
//
// PORTS the published fox-underwriting derivation (src/skills/extract/
// eligibility.ts, the eligibility-as-data session 2026-07-12) verbatim. WHY the
// portal derives instead of just reading the workbench columns: migration 0032
// added borrower_requirement / client_commitment / channel_requirement /
// transaction_types / eligibility_unknown / eligibility_source to rate_quotes,
// but the backfill has NOT populated the approved book — verified live
// 2026-07-12, 949 approved rows, ZERO with any eligibility column set (even
// Scotia variant='physician' rows carry borrower_requirement=null). Ranking on
// the empty columns would treat every restricted rate as available, which is
// the exact live bug (a physician-only 3.40% hid the real best-available). So
// the portal DERIVES eligibility from `variant`+`programNotes`+slug by the same
// published rule, and PREFERS the workbench columns the moment they are
// populated (effectiveEligibility below, keyed on eligibility_source presence).
//
// Keep the derivation block in lockstep with fox-underwriting; the golden tests
// in tests/eligibility.test.ts mirror src/skills/extract/eligibility.test.ts.

import { PROVINCE_MIRROR, UNKNOWN_FACT, type Provinces, type ProvinceFact } from '@/config/lender-provinces'

export type { Provinces, ProvinceFact } from '@/config/lender-provinces'

// ─── Ported derivation (verbatim from fox-underwriting) ─────────────────────
export type BorrowerRequirement = 'physician' | 'net_worth' | 'new_to_canada' | 'business_for_self'
export type ClientCommitment = 'banking_bundle' | 'quick_close_45d' | 'quick_close_60d' | 'quick_close_90d'
export type ChannelRequirement = 'exclusive_partner'
export type TransactionType = 'purchase' | 'transfer' | 'refinance' | 'renewal' | 'switch'

export interface DerivedEligibility {
  borrower_requirement: BorrowerRequirement | null
  client_commitment: ClientCommitment | null
  channel_requirement: ChannelRequirement | null
  transaction_types: TransactionType[] | null
  eligibility_unknown: boolean
  eligibility_source: string
}

/** Strip STRUCTURAL suffixes (LTV bands, credit-score tiers, amortization,
 * product class) to leave the base program stem — pricing dimensions the
 * scenario already handles, never eligibility restrictions. */
export function baseStem(variant: string | null): string {
  if (!variant) return ''
  let s = variant.toLowerCase()
  s = s.replace(/-(25|30)yr\b/g, '') // amortization
  s = s.replace(/-?uninsurable\b/g, '') // product class
  s = s.replace(/-?ltv[<>]?=?<?\d+(?:\.\d+)?(?:-\d+)?/g, '') // ltv<=65, ltv65-70, ltv>70.01, ltv<50, ltv75
  s = s.replace(/-?beacon-?/g, '-') // drop the "beacon" word, keep a joiner
  s = s.replace(/-<?\d{3}(?:[-+]\d{0,3})?/g, '') // -500-549, -680+, -<580, -640+, -720-900
  s = s.replace(/-+/g, '-').replace(/^-|-$/g, '') // tidy joiners
  return s
}

const STRUCTURAL_STEMS = new Set([
  '', 'basic', 'value-flex', 'fusion', 'axis', 'exact', 'xtend', 'convertible',
  'standard', 'near-prime', 'near-prime-flex', 'rate-option-plus', 'pre-approval',
  'promo', 'promo-special', 'rental', 'second-home-rental',
])
const BORROWER_STEMS: Record<string, BorrowerRequirement> = {
  physician: 'physician',
  'high-net-worth': 'net_worth',
  newcomer: 'new_to_canada',
  'newcomer-kcb': 'new_to_canada',
  'non-traditional-income': 'business_for_self',
  'stated-income': 'business_for_self',
}
const CLIENT_STEMS: Record<string, ClientCommitment> = {
  'mortgage-plus': 'banking_bundle',
  '45-day-quick-close': 'quick_close_45d',
  '60-day-quick-close': 'quick_close_60d',
  '90-day-close': 'quick_close_90d',
}
const CHANNEL_STEMS: Record<string, ChannelRequirement> = {
  'partner-exclusive': 'exclusive_partner',
  pmpp: 'exclusive_partner',
}
const TXN_STEMS: Record<string, TransactionType[]> = {
  'promo-purchase-transfer': ['purchase', 'transfer'],
  safeguard: ['refinance'],
}
const UNKNOWN_STEMS = new Set(['frontline', 'special-homeline'])
const EXCLUSIVE_PARTNER_LENDERS = new Set(['unionlink'])

export function deriveEligibility(
  variant: string | null,
  lenderSlug: string,
  programNotes: string | null,
): DerivedEligibility {
  const stem = baseStem(variant)
  const borrower = BORROWER_STEMS[stem] ?? null
  let client = CLIENT_STEMS[stem] ?? null
  if (stem === 'physician') client = 'banking_bundle' // Scotia physician is a Mortgage Plus deal
  const channel = CHANNEL_STEMS[stem] ?? (EXCLUSIVE_PARTNER_LENDERS.has(lenderSlug) ? 'exclusive_partner' : null)
  const txn = TXN_STEMS[stem] ?? null
  const recognized =
    borrower != null || client != null || channel != null || txn != null ||
    STRUCTURAL_STEMS.has(stem) || UNKNOWN_STEMS.has(stem)
  const eligibility_unknown = UNKNOWN_STEMS.has(stem) || !recognized
  const parts = [`variant:${variant ?? '(none)'}`]
  if ((borrower || client) && programNotes) parts.push(`notes:${programNotes.slice(0, 160)}`)
  const eligibility_source = parts.join(' | ')
  return {
    borrower_requirement: borrower,
    client_commitment: client,
    channel_requirement: channel,
    transaction_types: txn,
    eligibility_unknown,
    eligibility_source,
  }
}

// ─── Attempt-and-fallback: prefer populated workbench columns ───────────────
// A quote carries the workbench eligibility columns (all optional on the portal
// row). When eligibility_source is present the workbench derived it — trust it.
// Otherwise the portal derives, so the bug is fixed before the backfill lands.
export interface QuoteEligibilityFields {
  lenderSlug: string
  variant: string | null
  programNotes: string | null
  borrowerRequirement?: BorrowerRequirement | null
  clientCommitment?: ClientCommitment | null
  channelRequirement?: ChannelRequirement | null
  transactionTypes?: TransactionType[] | null
  eligibilityUnknown?: boolean | null
  eligibilitySource?: string | null
}

export function effectiveEligibility(q: QuoteEligibilityFields): DerivedEligibility {
  if (q.eligibilitySource) {
    return {
      borrower_requirement: q.borrowerRequirement ?? null,
      client_commitment: q.clientCommitment ?? null,
      channel_requirement: q.channelRequirement ?? null,
      transaction_types: q.transactionTypes ?? null,
      eligibility_unknown: q.eligibilityUnknown ?? false,
      eligibility_source: q.eligibilitySource,
    }
  }
  return deriveEligibility(q.variant, q.lenderSlug, q.programNotes)
}

/** True when the workbench has populated structured eligibility for the book
 * (so the portal-side derivation can retire). Pass any approved quote. */
export function eligibilityIsWorkbenchServed(q: QuoteEligibilityFields): boolean {
  return Boolean(q.eligibilitySource)
}

// ─── Province eligibility ───────────────────────────────────────────────────
export type ProvinceStatus = 'eligible' | 'ineligible' | 'unknown'

export interface ProvinceResolution {
  status: ProvinceStatus
  provinces: Provinces
  source: string
  asOf: string
}

/** Resolve a lender's availability in the subject province. `live` (from the
 * Gates registry) wins when supplied; else the server-side mirror; else the
 * fail-closed unknown default. */
export function resolveProvince(
  lenderSlug: string,
  subjectProvince = 'ON',
  live?: Map<string, ProvinceFact> | null,
): ProvinceResolution {
  const fact: ProvinceFact = live?.get(lenderSlug) ?? PROVINCE_MIRROR[lenderSlug] ?? UNKNOWN_FACT
  const p = fact.provinces
  let status: ProvinceStatus
  if (p === 'national') status = 'eligible'
  else if (p === 'unknown') status = 'unknown'
  else status = p.includes(subjectProvince) ? 'eligible' : 'ineligible'
  return { status, provinces: p, source: fact.source, asOf: fact.asOf }
}

// ─── Channel access (practice fact; Michael-confirmed) ──────────────────────
// The workbench channel_access registry is not yet populated, so held channels
// are a portal fact grounded in Michael's confirmation. UnionLink's
// exclusive-partner channel is HELD (Michael confirmed 2026-07-12). Any
// exclusive-partner lender NOT held is excluded everywhere, permanently.
export const HELD_CHANNELS: Record<string, { held: boolean; asOf: string; note: string }> = {
  unionlink: { held: true, asOf: '2026-07-12', note: 'Exclusive-partner channel access confirmed by Michael, 2026-07-12.' },
}

export function channelHeld(lenderSlug: string, channel: ChannelRequirement | null): boolean {
  if (!channel) return true // no channel requirement
  const entry = HELD_CHANNELS[lenderSlug]
  return entry?.held === true
}

// ─── Plain-language requirement sentences ───────────────────────────────────
// The workbench registry may serve a per-lender `programs` definition (verbatim
// from knowledge); today none is populated. These are the portal fallbacks so a
// restricted card always names its requirement in a sentence, never a bare code.
// A live `programs` definition is preferred by requirementSentence() when given.
export const REQUIREMENT_SENTENCE: Record<string, string> = {
  physician:
    'Physician program: the borrower must be a licensed physician, resident, or dentist practising in Canada.',
  net_worth:
    "High-net-worth program: the borrower must meet the lender's net-worth threshold.",
  new_to_canada:
    "New-to-Canada program: the borrower must be a newcomer meeting the lender's newcomer criteria.",
  business_for_self:
    'Business-for-self program: the borrower must qualify under stated or non-traditional income.',
  banking_bundle:
    'Banking bundle: the client must move their day-to-day banking to the lender (a bundled product).',
  quick_close_45d: 'Quick close: the mortgage must close within 45 days.',
  quick_close_60d: 'Quick close: the mortgage must close within 60 days.',
  quick_close_90d: 'Quick close: the mortgage must close within 90 days.',
  exclusive_partner:
    "Exclusive-partner channel: available only through Fox Mortgage's partner channel access.",
  eligibility_unknown:
    'This rate carries a restriction the rate sheet does not spell out; confirm eligibility with the lender before quoting.',
}

export function requirementSentence(code: string, liveDefinition?: string | null): string {
  return liveDefinition ?? REQUIREMENT_SENTENCE[code] ?? `Restricted program (${code}).`
}

// ─── The composite verdict every ranked surface consumes ────────────────────
export type EligibilityCategory =
  | 'eligible'
  | 'province_ineligible' // structurally cannot lend in the subject province
  | 'province_unknown' // availability not confirmed (internal-only; excluded from client docs)
  | 'channel_unavailable' // Fox does not hold the lender's restricted channel
  | 'transaction_mismatch' // the quote's transaction_types rule this transaction out
  | 'program_restricted' // borrower/commitment/unknown requirement, unlockable

export interface ScenarioQualifiers {
  /** Borrower profile toggles the user turned on. */
  borrowerProfiles?: BorrowerRequirement[]
  /** Client-commitment toggles the user turned on. */
  commitments?: ClientCommitment[]
  /** The scenario's transaction (from purpose), or null for no transaction filter. */
  transaction?: TransactionType | null
  /** Quote ids Michael manually pinned (a restricted pin bypasses its program gate). */
  pinnedIds?: Set<string>
}

export interface EligibilityVerdict {
  category: EligibilityCategory
  province: ProvinceResolution
  /** Requirement codes active on this quote (borrower/commitment/channel/unknown). */
  requirementCodes: string[]
  /** Plain-language requirement sentences for the active restrictions. */
  requirementSentences: string[]
  /** Human-readable reasons this quote is excluded (empty when eligible). */
  reasons: string[]
  /** True when a program restriction was unlocked by a qualifier or a pin. */
  unlocked: boolean
}

const REQ_LABEL: Record<string, string> = {
  physician: 'Physician program',
  net_worth: 'High net worth',
  new_to_canada: 'New to Canada',
  business_for_self: 'Business for self',
  banking_bundle: 'Move banking to the lender',
  quick_close_45d: 'Close within 45 days',
  quick_close_60d: 'Close within 60 days',
  quick_close_90d: 'Close within 90 days',
  exclusive_partner: 'Exclusive-partner channel',
  eligibility_unknown: 'Undisclosed restriction',
}

/**
 * Evaluate one quote against the subject province, the scenario's transaction,
 * and the qualifiers the user has toggled (plus any manual pin). Structural
 * exclusions (province ineligible, channel unavailable, transaction mismatch)
 * are never unlockable. Program restrictions are unlocked by the matching
 * qualifier or an explicit pin. Province-unknown is NOT a ranking exclusion
 * (internal surfaces show it flagged); the client-doc layer excludes it.
 */
export function evaluateQuote(
  quote: QuoteEligibilityFields & { id?: string },
  subjectProvince: string,
  qualifiers: ScenarioQualifiers,
  live?: Map<string, ProvinceFact> | null,
  livePrograms?: Record<string, string> | null,
): EligibilityVerdict {
  const province = resolveProvince(quote.lenderSlug, subjectProvince, live)
  const elig = effectiveEligibility(quote)
  const pinned = quote.id != null && qualifiers.pinnedIds?.has(quote.id) === true

  const requirementCodes: string[] = []
  const requirementSentences: string[] = []
  const pushReq = (code: string) => {
    requirementCodes.push(code)
    requirementSentences.push(requirementSentence(code, livePrograms?.[code]))
  }

  // 1. Province — structural, never unlockable.
  if (province.status === 'ineligible') {
    return {
      category: 'province_ineligible',
      province,
      requirementCodes,
      requirementSentences,
      reasons: [`Not licensed in ${subjectProvince} (available in ${Array.isArray(province.provinces) ? province.provinces.join(', ') : province.provinces}).`],
      unlocked: false,
    }
  }

  // 2. Channel — structural, never unlockable (about Michael, not the borrower).
  if (elig.channel_requirement && !channelHeld(quote.lenderSlug, elig.channel_requirement)) {
    pushReq(elig.channel_requirement)
    return {
      category: 'channel_unavailable',
      province,
      requirementCodes,
      requirementSentences,
      reasons: ['Fox Mortgage does not hold this lender’s exclusive-partner channel.'],
      unlocked: false,
    }
  }

  // 3. Transaction — structural for the current transaction, never unlockable.
  if (elig.transaction_types && qualifiers.transaction && !elig.transaction_types.includes(qualifiers.transaction)) {
    return {
      category: 'transaction_mismatch',
      province,
      requirementCodes,
      requirementSentences,
      reasons: [`Valid only for ${elig.transaction_types.join(', ')}, not ${qualifiers.transaction}.`],
      unlocked: false,
    }
  }

  // 4. Program restrictions — collect the active ones, then decide unlock.
  const activeRestrictions: string[] = []
  if (elig.borrower_requirement) activeRestrictions.push(elig.borrower_requirement)
  if (elig.client_commitment) activeRestrictions.push(elig.client_commitment)
  if (elig.eligibility_unknown) activeRestrictions.push('eligibility_unknown')

  if (activeRestrictions.length > 0) {
    for (const code of activeRestrictions) pushReq(code)
    const borrowerOk =
      !elig.borrower_requirement || (qualifiers.borrowerProfiles ?? []).includes(elig.borrower_requirement)
    const commitmentOk =
      !elig.client_commitment || (qualifiers.commitments ?? []).includes(elig.client_commitment)
    const unknownOk = !elig.eligibility_unknown // never auto-unlocked by a qualifier
    const unlockedByQualifiers = borrowerOk && commitmentOk && unknownOk
    if (pinned || unlockedByQualifiers) {
      return {
        category: 'eligible',
        province,
        requirementCodes,
        requirementSentences,
        reasons: [],
        unlocked: true,
      }
    }
    return {
      category: 'program_restricted',
      province,
      requirementCodes,
      requirementSentences,
      reasons: activeRestrictions.map(c => REQ_LABEL[c] ?? c),
      unlocked: false,
    }
  }

  // 5. Eligible (province may still be 'unknown' — a flag, not an exclusion).
  return { category: 'eligible', province, requirementCodes, requirementSentences, reasons: [], unlocked: false }
}

/** Ranking inclusion for INTERNAL surfaces: eligible quotes plus
 * province-unknown (shown flagged). Excludes structural ineligibility and
 * un-unlocked program restrictions (unless showRestricted). */
export function includedInRanking(v: EligibilityVerdict, showRestricted = false): boolean {
  if (v.category === 'eligible') return true
  if (v.category === 'program_restricted') return showRestricted
  return false // province_ineligible / channel_unavailable / transaction_mismatch
}

/** Inclusion for CLIENT-FACING documents: eligible AND province-confirmed
 * (province_unknown is excluded, per the fail-closed rule). A pinned restricted
 * product is eligible only if its pin was confirmed (caller enforces the
 * confirmation record; this checks the eligibility shape). */
export function includedInClientDoc(v: EligibilityVerdict): boolean {
  return v.category === 'eligible' && v.province.status === 'eligible'
}
