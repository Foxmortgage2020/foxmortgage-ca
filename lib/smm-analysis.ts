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
  computeLtv,
  deriveTransaction,
  RATE_FAMILIES,
  rateFamilyRiskLine,
  type FoxAnalysis,
  type SmmParsedRow,
  type TransactionKind,
} from '@/lib/smm'
import { monthlyPayment } from '@/lib/mortgage-engine'
import { bestEligibleComparable, insuranceToProductClass, type BookQuote } from '@/lib/smm-match'
import { lenderMethodologyFor } from '@/lib/lenders'
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
  // original class.
  const productClass = transaction === 'refinance' ? 'conventional' : insuranceToProductClass(row.insuranceType)
  const methodologyKnown = lenderMethodologyFor(row.lender.display) != null

  // Like-for-like by default: the headline comparable is the client's own
  // rate family. A cheaper cross-family option rides along as a labelled
  // alternative with its risk line; it becomes the headline ONLY under
  // Michael's explicit approval, and then carries the risk line itself.
  const family = clientRateFamily(row.rateType)
  const otherFamilies = RATE_FAMILIES.filter(f => f !== family)
  const likeForLike = bestEligibleComparable(
    book,
    productClass,
    transaction,
    lenderDisplayName,
    primeFor,
    comparableEligible,
    [family],
  )
  const crossFamily = bestEligibleComparable(
    book,
    productClass,
    transaction,
    lenderDisplayName,
    primeFor,
    comparableEligible,
    otherFamilies,
  )
  const crossIsBetter = crossFamily != null && (likeForLike == null || crossFamily.rate < likeForLike.rate)
  const approved = opts.crossFamilyApproved === true && crossIsBetter

  const comparable = approved ? crossFamily : likeForLike
  let analysis = analyzeOpportunity(row, comparable, methodologyKnown, todayYMD, { transaction, productClass, ltv })

  // Attach the beside-the-headline option, priced at the SAME remaining
  // amortization so the two payments compare. Only on a stated analysis: a
  // blocked file (review/insufficient) states no figure for either option.
  const remaining = analysis.remainingAmortizationMonths
  const beside = approved ? likeForLike : crossIsBetter ? crossFamily : null
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
