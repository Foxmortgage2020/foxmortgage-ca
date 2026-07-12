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
  computeLtv,
  deriveTransaction,
  type FoxAnalysis,
  type SmmParsedRow,
  type TransactionKind,
} from '@/lib/smm'
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
    variant: q.variant,
    programNotes: q.programNotes,
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
      variant: q.variant ?? null,
      programNotes: q.programNotes ?? null,
      borrowerRequirement: (q.borrowerRequirement as any) ?? null,
      clientCommitment: (q.clientCommitment as any) ?? null,
      channelRequirement: (q.channelRequirement as any) ?? null,
      transactionTypes: (q.transactionTypes as any) ?? null,
      eligibilityUnknown: q.eligibilityUnknown ?? false,
      eligibilitySource: q.eligibilitySource ?? null,
    },
    'ON',
    { transaction: eligibilityTransaction(transaction) },
    null,
  )
  return v.category === 'eligible'
}

export function analyzeMortgage(row: SmmParsedRow, book: BookQuote[], todayYMD: string): MortgageAnalysis {
  const transaction = deriveTransaction(row.maturityDate, todayYMD)
  const ltv = computeLtv(row.balance, row.homeValue)
  // Refinance is uninsurable → conventional only. Switch ports the client's
  // original class.
  const productClass = transaction === 'refinance' ? 'conventional' : insuranceToProductClass(row.insuranceType)
  const comparable = bestEligibleComparable(
    book,
    productClass,
    transaction,
    lenderDisplayName,
    primeFor,
    comparableEligible,
  )
  const methodologyKnown = lenderMethodologyFor(row.lender.display) != null
  const analysis = analyzeOpportunity(row, comparable, methodologyKnown, todayYMD, { transaction, productClass, ltv })
  return { analysis, productClass, transaction }
}
