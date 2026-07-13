// Lender & program eligibility for every ranked surface.
//
// The workbench is the classifier; the portal is a reader. fox-underwriting's
// eligibility derivation (src/skills/extract/eligibility.ts) populates the five
// structured columns on rate_quotes — borrower_requirement, client_commitment,
// channel_requirement, transaction_types, eligibility_unknown — plus the
// eligibility_source provenance, at extraction time and via the backfill
// (verified run 2026-07-13: 947 of 949 approved rows carried
// eligibility_source; the only nulls were the five test-portal artifacts,
// since SUPERSEDED — the approved book is 947 rows across 23 lenders, every
// row classified). This module reads those
// columns through portal_readonly and derives NOTHING: the portal-side port of
// the derivation was deleted the day the backfill was confirmed, per guardrail
// 1 (deterministic code calculates in one place).
//
// FAIL-CLOSED, two conditions: a quote with eligibility_unknown = true OR
// eligibility_source IS NULL is treated as carrying an undisclosed restriction.
// It is excluded from default ranking (show-restricted reveals it, flagged) and
// it NEVER reaches a client-facing document — not even pinned, because a
// restriction nobody can name is a restriction nobody can confirm the client
// meets. A null source is exactly what an unclassified row arriving from Roam
// looks like before the workbench classifies it.

import { PROVINCE_MIRROR, UNKNOWN_FACT, type Provinces, type ProvinceFact } from '@/config/lender-provinces'

export type { Provinces, ProvinceFact } from '@/config/lender-provinces'

// The workbench vocabulary (migration 0032 check constraints). The portal never
// invents values; anything outside these is workbench drift a type cast would
// hide, so the reader below narrows with guards, not casts.
export type BorrowerRequirement = 'physician' | 'net_worth' | 'new_to_canada' | 'business_for_self'
export type ClientCommitment = 'banking_bundle' | 'quick_close_45d' | 'quick_close_60d' | 'quick_close_90d'
export type ChannelRequirement = 'exclusive_partner'
export type TransactionType = 'purchase' | 'transfer' | 'refinance' | 'renewal' | 'switch'

/** The five eligibility columns as they ride a quote row, plus the slug the
 * province gate keys on. Strings arrive as the row stores them; evaluateQuote
 * reads them verbatim (the workbench check constraints own the vocabulary). */
export interface QuoteEligibilityFields {
  lenderSlug: string
  borrowerRequirement?: string | null
  clientCommitment?: string | null
  channelRequirement?: string | null
  transactionTypes?: string[] | null
  eligibilityUnknown?: boolean | null
  /** Workbench classification provenance. NULL means the row was never
   * classified — fail-closed to an undisclosed restriction. */
  eligibilitySource?: string | null
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

export function channelHeld(lenderSlug: string, channel: string | null): boolean {
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
  unclassified:
    'This rate has not been classified by the workbench yet; confirm its eligibility before quoting.',
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
  /** Quote ids Michael manually pinned (a restricted pin bypasses its program
   * gate for INTERNAL ranking; undisclosed restrictions still never reach a
   * client document — see includedInClientDoc). */
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
  /** True when the restriction cannot be named (eligibility_unknown, or an
   * unclassified row whose eligibility_source is null). An unnameable
   * restriction cannot be confirmed, so this hard-blocks client documents even
   * through a pin. */
  undisclosedRestriction: boolean
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
  unclassified: 'Not yet classified',
}

const BORROWER_VALUES: readonly string[] = ['physician', 'net_worth', 'new_to_canada', 'business_for_self']
const COMMITMENT_VALUES: readonly string[] = ['banking_bundle', 'quick_close_45d', 'quick_close_60d', 'quick_close_90d']

/**
 * Evaluate one quote against the subject province, the scenario's transaction,
 * and the qualifiers the user has toggled (plus any manual pin) — reading the
 * workbench eligibility columns verbatim. Structural exclusions (province
 * ineligible, channel unavailable, transaction mismatch) are never unlockable.
 * Named program restrictions are unlocked by the matching qualifier or an
 * explicit pin. eligibility_unknown and a NULL eligibility_source are
 * fail-closed: restricted, never qualifier-unlocked, and never on a client
 * document. Province-unknown is NOT a ranking exclusion (internal surfaces show
 * it flagged); the client-doc layer excludes it.
 */
export function evaluateQuote(
  quote: QuoteEligibilityFields & { id?: string },
  subjectProvince: string,
  qualifiers: ScenarioQualifiers,
  live?: Map<string, ProvinceFact> | null,
  livePrograms?: Record<string, string> | null,
): EligibilityVerdict {
  const province = resolveProvince(quote.lenderSlug, subjectProvince, live)
  const pinned = quote.id != null && qualifiers.pinnedIds?.has(quote.id) === true
  const borrower = quote.borrowerRequirement ?? null
  const commitment = quote.clientCommitment ?? null
  const channel = quote.channelRequirement ?? null
  const transactions = quote.transactionTypes ?? null
  const unclassified = quote.eligibilitySource == null
  const unknownRestriction = quote.eligibilityUnknown === true || unclassified

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
      undisclosedRestriction: unknownRestriction,
    }
  }

  // 2. Channel — structural, never unlockable (about Michael, not the borrower).
  if (channel && !channelHeld(quote.lenderSlug, channel)) {
    pushReq(channel)
    return {
      category: 'channel_unavailable',
      province,
      requirementCodes,
      requirementSentences,
      reasons: ['Fox Mortgage does not hold this lender’s exclusive-partner channel.'],
      unlocked: false,
      undisclosedRestriction: unknownRestriction,
    }
  }

  // 3. Transaction — structural for the current transaction, never unlockable.
  if (transactions && transactions.length > 0 && qualifiers.transaction && !transactions.includes(qualifiers.transaction)) {
    return {
      category: 'transaction_mismatch',
      province,
      requirementCodes,
      requirementSentences,
      reasons: [`Valid only for ${transactions.join(', ')}, not ${qualifiers.transaction}.`],
      unlocked: false,
      undisclosedRestriction: unknownRestriction,
    }
  }

  // 4. Program restrictions — collect the active ones, then decide unlock.
  const activeRestrictions: string[] = []
  if (borrower) activeRestrictions.push(borrower)
  if (commitment) activeRestrictions.push(commitment)
  if (quote.eligibilityUnknown === true) activeRestrictions.push('eligibility_unknown')
  if (unclassified) activeRestrictions.push('unclassified')

  if (activeRestrictions.length > 0) {
    for (const code of activeRestrictions) pushReq(code)
    const borrowerOk =
      !borrower ||
      (BORROWER_VALUES.includes(borrower) && (qualifiers.borrowerProfiles ?? []).includes(borrower as BorrowerRequirement))
    const commitmentOk =
      !commitment ||
      (COMMITMENT_VALUES.includes(commitment) && (qualifiers.commitments ?? []).includes(commitment as ClientCommitment))
    // An undisclosed restriction is never unlocked by a qualifier: there is
    // nothing to qualify FOR.
    const unlockedByQualifiers = borrowerOk && commitmentOk && !unknownRestriction
    if (pinned || unlockedByQualifiers) {
      return {
        category: 'eligible',
        province,
        requirementCodes,
        requirementSentences,
        reasons: [],
        unlocked: true,
        undisclosedRestriction: unknownRestriction,
      }
    }
    return {
      category: 'program_restricted',
      province,
      requirementCodes,
      requirementSentences,
      reasons: activeRestrictions.map(c => REQ_LABEL[c] ?? c),
      unlocked: false,
      undisclosedRestriction: unknownRestriction,
    }
  }

  // 5. Eligible (province may still be 'unknown' — a flag, not an exclusion).
  return {
    category: 'eligible',
    province,
    requirementCodes,
    requirementSentences,
    reasons: [],
    unlocked: false,
    undisclosedRestriction: false,
  }
}

/** Ranking inclusion for INTERNAL surfaces: eligible quotes plus
 * province-unknown (shown flagged). Excludes structural ineligibility and
 * un-unlocked program restrictions (unless showRestricted). */
export function includedInRanking(v: EligibilityVerdict, showRestricted = false): boolean {
  if (v.category === 'eligible') return true
  if (v.category === 'program_restricted') return showRestricted
  return false // province_ineligible / channel_unavailable / transaction_mismatch
}

/** Inclusion for CLIENT-FACING documents: eligible, province-CONFIRMED
 * (province_unknown is excluded, per the fail-closed rule), and carrying NO
 * undisclosed restriction — a pin can unlock a NAMED requirement for a client
 * doc (the confirmation record is enforced by the route), but a restriction
 * nobody can name can never be confirmed, so eligibility_unknown and
 * unclassified (null eligibility_source) rows are hard-blocked here. */
export function includedInClientDoc(v: EligibilityVerdict): boolean {
  return v.category === 'eligible' && v.province.status === 'eligible' && !v.undisclosedRestriction
}
