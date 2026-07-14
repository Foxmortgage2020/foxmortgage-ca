// The single per-mortgage analysis used by BOTH the Opportunities board and the
// savings-analysis PDF route, so the document a client receives can never drift
// from the card Michael saw. Pure: parsed row + approved book in, Fox's analysis
// out.
//
// Part 1c (transaction type governs product class):
//  - A client who BREAKS mid-term (maturity > 120 days out, or unknown) is a
//    REFINANCE: uninsurable, so it prices against CONVENTIONAL quotes only, a
//    penalty applies, an 80% LTV cap hard-blocks, and it requalifies at the
//    stress test.
//  - A client at maturity (<= 120 days) is a SWITCH: the original insurance
//    class ports, no penalty, no requalification.
// Part 1 + 1b: the comparable is filtered to what the client can genuinely have
//  — province-eligible (BC credit unions out), unrestricted for an ordinary
//  borrower (physician / bundle / channel / undisclosed-restriction out,
//  fail-closed), and valid for the transaction (a refinance never sees a
//  purchase-only or refinance-only-elsewhere promo). Prices fixed AND floating
//  against the server prime mirror and picks the lowest effective rate.

import {
  analyzeOpportunity,
  clientRateFamily,
  comparableTermLabel,
  computeLtv,
  deriveTransaction,
  naturalComparisonHorizon,
  RATE_FAMILIES,
  rateFamilyRiskLine,
  tierRateMismatch,
  type FoxAnalysis,
  type GraduationOffer,
  type OverrideInfo,
  type SmmParsedRow,
  type TransactionKind,
} from '@/lib/smm'
import { monthlyPayment } from '@/lib/mortgage-engine'
import { graduationTargets, tierFor, type LenderTier } from '@/config/lender-tiers'
import { PRIME_MIRROR } from '@/config/prime'
import type { Comparable } from '@/lib/smm'
import { bestEligibleComparable, eligibleComparablesRanked, insuranceToProductClass, type BookQuote } from '@/lib/smm-match'
import { lenderMethodologyFor, methodologyFromClaim } from '@/lib/lenders'
import { lenderDisplayName } from '@/config/lenders'
import { primeFor } from '@/config/prime'
import { evaluateQuote, type TransactionType } from '@/lib/eligibility'
import type { RateQuoteFullRow } from '@/lib/underwriting'

/** Map a workbench quote row to the book shape the comparable filter consumes,
 * carrying the eligibility columns. One mapper for the board, the PDF route, and
 * the Home rail, so they price identically. */
export function bookQuoteFromRow(q: RateQuoteFullRow): BookQuote {
  return {
    rate: q.rate,
    rateType: q.rateType,
    termMonths: q.termMonths,
    productClass: q.productClass,
    asOfDate: q.asOfDate,
    status: q.status,
    lenderSlug: q.lenderSlug,
    primeVariance: q.primeVariance,
    borrowerRequirement: q.borrowerRequirement,
    clientCommitment: q.clientCommitment,
    channelRequirement: q.channelRequirement,
    transactionTypes: q.transactionTypes,
    eligibilityUnknown: q.eligibilityUnknown,
    eligibilitySource: q.eligibilitySource,
  }
}

export interface MortgageAnalysis {
  analysis: FoxAnalysis
  productClass: string
  transaction: TransactionKind
}

// ─── Override candidates (Task 3) ────────────────────────────────────────────
// The book-quote override is validated BY CONSTRUCTION: the card's picker is
// populated from this server-derived list (approved + eligible + SAME TIER,
// every family), and the override route re-derives the list and matches the
// submitted key. A quote that fails any gate (BC lender, restricted program,
// wrong tier, not approved) never appears in the list, so it can never be
// picked or re-matched — an override cannot resurrect an ineligible lender.

/** Stable identity for a candidate across the picker round-trip. */
export function comparableKey(c: Comparable): string {
  return [c.lenderSlug ?? '', c.rateType ?? c.kind, c.termMonths, c.asOf ?? '', c.variance != null ? `v${c.variance}` : `r${c.rate}`].join('|')
}

/** The ranked, eligible, same-tier candidates Michael may override to (all
 * rate families; his pick is his suitability decision). Empty when the tier
 * is unknown or blocked. */
export function overrideCandidates(row: SmmParsedRow, book: BookQuote[], todayYMD: string, limit = 8): Comparable[] {
  const transaction = deriveTransaction(row.maturityDate, todayYMD)
  const productClass = transaction === 'refinance' ? 'conventional' : insuranceToProductClass(row.insuranceType)
  const tier = row.lender.tier
  if (tier == null || tierRateMismatch(tier, row.rate, PRIME_MIRROR.value)) return []
  const sameTierEligible = (q: BookQuote, t: TransactionKind) =>
    comparableEligible(q, t) && tierFor(q.lenderSlug)?.tier === tier
  // B paper books as b_side (same rule as analyzeMortgage).
  const cls = tier === 'b' ? 'b_side' : productClass
  return eligibleComparablesRanked(
    book,
    cls,
    transaction,
    lenderDisplayName,
    primeFor,
    sameTierEligible,
    RATE_FAMILIES,
    naturalComparisonHorizon(row, transaction, todayYMD),
  ).slice(0, limit)
}

// A switch is a lender transfer in the transaction vocabulary, so a switch
// unlocks transfer-eligible promos (Radius's purchase/transfer promo) but not
// refinance-only products; a refinance is a refinance.
function eligibilityTransaction(t: TransactionKind): TransactionType {
  return t === 'switch' ? 'transfer' : 'refinance'
}

/** Whether an approved book quote is an eligible comparable: province-eligible
 * (unknown is allowed on this internal analysis, flagged), unrestricted for an
 * ordinary borrower, and valid for the transaction. Structural exclusions only;
 * no borrower qualifiers are assumed (the comparable is "what the client can
 * definitely have"). */
function comparableEligible(q: BookQuote, transaction: TransactionKind): boolean {
  const v = evaluateQuote(
    {
      lenderSlug: q.lenderSlug,
      borrowerRequirement: q.borrowerRequirement ?? null,
      clientCommitment: q.clientCommitment ?? null,
      channelRequirement: q.channelRequirement ?? null,
      transactionTypes: q.transactionTypes ?? null,
      eligibilityUnknown: q.eligibilityUnknown ?? false,
      eligibilitySource: q.eligibilitySource ?? null,
    },
    'ON',
    { transaction: eligibilityTransaction(transaction) },
    null,
  )
  return v.category === 'eligible'
}

export interface AnalyzeMortgageOptions {
  /** Michael explicitly approved recommending a different rate family than
   * the client holds (recorded to the savings-analysis log by the caller).
   * Without it, the headline is always the client's own family. */
  crossFamilyApproved?: boolean
  /** Michael explicitly approved pricing the graduation tier (better paper)
   * as the headline. Without it, graduation is a flag, never a price. */
  graduationApproved?: boolean
  /** Michael explicitly approved the deliberately short-term play (a
   * same-tier rate whose term ends before the comparison horizon). Without
   * it, the play is a flag and the shortened projection never drives
   * act_now. */
  shortTermApproved?: boolean
  /** Michael's active manual override for this household (loaded from the
   * FOXCA store by the caller). Takes precedence over every default
   * comparable; the eligibility fail-close was enforced when it was set. */
  override?: {
    type: 'book_quote' | 'desk_rate'
    comparable: Comparable
    reason: string
    sourceNote: string | null
  } | null
  /** An APPROVED, lender-wide (program-null) ird_comparison_basis knowledge
   * claim for this mortgage's lender, when one exists (fetched by the
   * caller through the read-only role via selectIrdBasisClaim).
   * methodologyKnown = hardcoded-table-known OR claim-known; a claim whose
   * basis does not map (contract_rate, reinvestment_rate) fails closed via
   * methodologyFromClaim and changes nothing. */
  methodologyClaim?: { claim_value: unknown; id: string; asOfDate?: string | null } | null
}

/** A stored floating comparable repriced at today's per-lender prime, so a
 * client document never pairs a stale effective rate with today's prime
 * as-of. Printed rates and desk rates pass through untouched. */
function refreshComparablePricing(c: Comparable): Comparable {
  if (c.variance == null || c.primeUsed == null || !c.lenderSlug) return c
  const prime = primeFor(c.lenderSlug)
  return { ...c, primeUsed: prime, rate: Math.round((prime + c.variance) * 100) / 100 }
}

export function analyzeMortgage(
  row: SmmParsedRow,
  book: BookQuote[],
  todayYMD: string,
  opts: AnalyzeMortgageOptions = {},
): MortgageAnalysis {
  const transaction = deriveTransaction(row.maturityDate, todayYMD)
  const ltv = computeLtv(row.balance, row.homeValue)
  // Refinance is uninsurable → conventional only. Switch ports the client's
  // original class. (Tier reshapes this below: B paper books as b_side.)
  const baseClass = transaction === 'refinance' ? 'conventional' : insuranceToProductClass(row.insuranceType)
  const methodologyKnown =
    lenderMethodologyFor(row.lender.display) != null ||
    methodologyFromClaim(opts.methodologyClaim ?? null) != null

  // Paper grade (tier): the mortgage's tier is its current lender/program
  // tier from the explicit feed map. Unknown fails closed to review, and a
  // contract rate that contradicts an A-tier mapping routes to review too —
  // the map is suspect, never trusted over the rate.
  const tier = row.lender.tier
  const tierBlockReason =
    tier == null
      ? `The paper grade (tier) is not mapped for "${row.lender.display}". Confirm whether this is A, B, or private lending before any comparison; nothing is priced against unknown paper.`
      : tierRateMismatch(tier, row.rate, PRIME_MIRROR.value)
        ? `The contract rate (${row.rate}%) does not fit A-tier paper (prime is ${PRIME_MIRROR.value}%); the tier map may be wrong for "${row.lender.display}". Confirm the paper grade before any figure is stated.`
        : null

  // Like-for-like by default, on BOTH axes: the headline comparable is the
  // client's own rate family AND own tier (a B file prices against B quotes;
  // pricing it against A rates manufactures savings the client may not
  // qualify for). A cheaper cross-family option rides along as a labelled
  // alternative; a better-TIER option rides along as a graduation FLAG with
  // no payment figures. Either becomes the headline only under Michael's
  // explicit approval. A same-tier quote requires the quote lender's tier to
  // be KNOWN and equal (fail-closed on both sides).
  const family = clientRateFamily(row.rateType)
  const otherFamilies = RATE_FAMILIES.filter(f => f !== family)
  const sameTierEligible = (q: BookQuote, t: TransactionKind) =>
    comparableEligible(q, t) && tier != null && tierFor(q.lenderSlug)?.tier === tier

  // The book's class vocabulary is tier-shaped: B lending books as
  // 'b_side' (verified live: every approved B-tier quote is b_side), so a
  // B-paper mortgage compares against b_side quotes; the insurance trio only
  // exists on A paper. No private class exists in the book at all — private
  // paper goes honest-insufficient with the graduation flag. The mortgage's
  // OWN class (what the card, the log, and the scenario prefill state) is
  // its tier's class, so a B file's empty state names b_side, never
  // conventional.
  const classForTier = (t: LenderTier): string => (t === 'b' ? 'b_side' : baseClass)
  const productClass = tier != null ? classForTier(tier) : baseClass

  // The comparison horizon (Task 0b): the client's own projection window.
  // Every default selection below must COVER it — a short-term rate never
  // headlines a longer projection; when nothing covers, the longest available
  // leads and the projection shortens to its term (flagged, approval-gated).
  const horizonCover = naturalComparisonHorizon(row, transaction, todayYMD)

  const sameFamilyRanked =
    tierBlockReason || tier == null
      ? []
      : eligibleComparablesRanked(book, classForTier(tier), transaction, lenderDisplayName, primeFor, sameTierEligible, [family], horizonCover)
  const likeForLike = sameFamilyRanked[0] ?? null
  const crossFamily =
    tierBlockReason || tier == null
      ? null
      : bestEligibleComparable(book, classForTier(tier), transaction, lenderDisplayName, primeFor, sameTierEligible, otherFamilies, horizonCover)

  // The deliberately short-term play (Task 0b item 3): a same-tier,
  // same-family rate whose term ends before the horizon but prices below the
  // covering headline (the 1-year B term with a plan at renewal). A flag for
  // Michael, exactly like cross-family and graduation; his approval headlines
  // it and shortens the projection to its term.
  const shortPlay =
    likeForLike != null && likeForLike.termMonths >= horizonCover
      ? (sameFamilyRanked
          .filter(c => c.termMonths < horizonCover && c.rate < likeForLike.rate)
          .sort((a, b) => a.rate - b.rate || b.termMonths - a.termMonths)[0] ?? null)
      : null

  // Graduation (Task 0a): the best BETTER-tier option in the client's own
  // family, priced CONVENTIONAL only for an A target (a B target books as
  // b_side). A graduation is a NEW application on better paper — the current
  // mortgage's insurance class never travels with it, so an insurable or
  // insured quote can never serve as the graduation comparable. This is the
  // refinance discipline, applied to every graduation regardless of the
  // transaction window.
  const gradClassFor = (t: LenderTier): string => (t === 'b' ? 'b_side' : 'conventional')
  const targets = tier ? graduationTargets(tier) : []
  let gradComparable: Comparable | null = null
  let gradTier: LenderTier | null = null
  if (!tierBlockReason) {
    for (const target of targets) {
      const targetEligible = (q: BookQuote, t: TransactionKind) =>
        comparableEligible(q, t) && tierFor(q.lenderSlug)?.tier === target
      const c = bestEligibleComparable(book, gradClassFor(target), transaction, lenderDisplayName, primeFor, targetEligible, [family], horizonCover)
      if (c && (gradComparable == null || c.rate < gradComparable.rate)) {
        gradComparable = c
        gradTier = target
      }
    }
  }

  // Precedence: Michael's override > approved graduation > approved
  // cross-family > approved short-term play > the like-for-like default. A
  // stored floating book-quote override is REPRICED at today's per-lender
  // prime before use (review finding 2026-07-13: a frozen effective rate
  // must never pair with today's prime as-of on a client document); desk
  // rates pass through as Michael stated them.
  const override = opts.override
    ? { ...opts.override, comparable: refreshComparablePricing(opts.override.comparable) }
    : null
  const gradApproved = override == null && opts.graduationApproved === true && gradComparable != null && gradTier != null
  const crossIsBetter = crossFamily != null && (likeForLike == null || crossFamily.rate < likeForLike.rate)
  const approved = override == null && !gradApproved && opts.crossFamilyApproved === true && crossIsBetter
  const shortApplied =
    override == null && !gradApproved && !approved && opts.shortTermApproved === true && shortPlay != null

  const comparable = override
    ? override.comparable
    : gradApproved
      ? gradComparable
      : approved
        ? crossFamily
        : shortApplied
          ? shortPlay
          : likeForLike
  let analysis = analyzeOpportunity(row, comparable, methodologyKnown, todayYMD, {
    transaction,
    productClass,
    ltv,
    tier,
    tierBlockReason,
    shortTermApproved: opts.shortTermApproved === true,
  })

  if (override && analysis.bucket !== 'review') {
    // Michael's manual comparable: his documented suitability decision. The
    // default alternative/graduation attachments are suppressed so the
    // document carries exactly what he chose; the reconciliation and tier
    // review gates above still outrank it.
    analysis = {
      ...analysis,
      override: {
        type: override.type,
        lender: override.comparable.lender,
        rate: override.comparable.rate,
        termMonths: override.comparable.termMonths,
        reason: override.reason,
        sourceNote: override.sourceNote,
      },
    }
    return { analysis, productClass, transaction }
  }

  // The short-term play rides the analysis as a FLAG beside a covering
  // headline (rate, term, and sheet date only — no projected figures until
  // Michael approves it; approving shortens the projection to the term).
  // When the headline itself was shortened (nothing covers the horizon),
  // analyzeOpportunity already attached the applied flag.
  if (shortPlay && !shortApplied && analysis.shortTermStrategy == null && !gradApproved && !approved && analysis.comparable != null) {
    analysis = {
      ...analysis,
      shortTermStrategy: {
        comparable: shortPlay,
        termMonths: shortPlay.termMonths,
        naturalHorizonMonths: horizonCover,
        applied: false,
        note:
          `A ${comparableTermLabel(shortPlay.termMonths)} at ${shortPlay.rate}% prices below the ${comparableTermLabel(analysis.comparable.termMonths)} headline. ` +
          `The projection would stop at that term's end and the client renews there${tier !== 'a' ? ' (a graduation checkpoint on better paper)' : ''}. ` +
          'A deliberate short-term play is Michael\'s call, never an automatic act now.',
      },
    }
  }

  // Graduation rides the analysis as a FLAG (rate and sheet date only, no
  // payment figures — a figure the client may not qualify for is never
  // stated), on stated AND honest-insufficient analyses alike. Approved, it
  // becomes the priced headline.
  if (gradComparable && gradTier && analysis.bucket !== 'review') {
    analysis = {
      ...analysis,
      graduation: {
        toTier: gradTier,
        comparable: gradComparable,
        note: gradApproved
          ? `Michael approved pricing ${gradTier.toUpperCase()}-tier lending for this report; qualifying for it is assessed before anything moves.`
          : `This client may now qualify for ${gradTier.toUpperCase()}-tier lending. Michael assesses qualification; no figure is promised until he does.`,
      },
      graduationRecommended: gradApproved,
    }
  }

  // Attach the beside-the-headline option, priced at the SAME remaining
  // amortization so the two payments compare. Only on a stated analysis: a
  // blocked file (review/insufficient) states no figure for either option.
  // An approved graduation headline carries no cross-family alternative —
  // the document carries the one escalation Michael approved.
  const remaining = analysis.remainingAmortizationMonths
  const beside = gradApproved
    ? null
    : approved || shortApplied
      ? likeForLike
      : crossIsBetter
        ? crossFamily
        : null
  if (analysis.currentPayment != null && remaining != null && beside != null && row.balance != null) {
    const newPayment = monthlyPayment(row.balance, beside.rate, 'semi-annually', remaining)
    const monthlyDelta = newPayment - analysis.currentPayment
    const besideFamily = clientRateFamily(beside.rateType ?? null)
    const isCross = besideFamily !== family
    const primeMove =
      besideFamily === 'adjustable'
        ? monthlyPayment(row.balance, beside.rate + 0.25, 'semi-annually', remaining) - newPayment
        : null
    analysis = {
      ...analysis,
      alternative: {
        comparable: beside,
        newPayment,
        monthlyDelta,
        monthlySaving: monthlyDelta < 0 ? -monthlyDelta : 0,
        riskLine: isCross ? rateFamilyRiskLine(family, besideFamily, primeMove) : null,
        crossFamily: isCross,
      },
    }
  }
  if (approved && analysis.currentPayment != null && analysis.comparable != null && row.balance != null && remaining != null) {
    const headFamily = clientRateFamily(analysis.comparable.rateType ?? null)
    const primeMove =
      headFamily === 'adjustable'
        ? monthlyPayment(row.balance, analysis.comparable.rate + 0.25, 'semi-annually', remaining) -
          monthlyPayment(row.balance, analysis.comparable.rate, 'semi-annually', remaining)
        : null
    analysis = {
      ...analysis,
      crossFamilyRecommended: true,
      headlineRiskLine: rateFamilyRiskLine(family, headFamily, primeMove),
    }
  }
  return { analysis, productClass, transaction }
}
