// Savings-analysis reproducibility (guardrails 1 and 5): every determination
// that reaches a deliverable surface carries a calc version and an inputs hash
// over everything that affects a printed figure, and the logged inputs are
// sufficient to REPLAY the figures (proven in tests/savings-log.test.ts).
// Server-only (node:crypto); the store write lives in lib/smm-store.ts.

import { createHash } from 'crypto'
import {
  analyzeOpportunity,
  computeLtv,
  deriveTransaction,
  type AlternativeComparable,
  type Comparable,
  type FoxAnalysis,
  type SmmParsedRow,
} from '@/lib/smm'
import { monthlyPayment } from '@/lib/mortgage-engine'
import { PRIME_MIRROR } from '@/config/prime'

/** Bump whenever ANY arithmetic that lands on a card or client document
 * changes. History:
 *  1 — implicit: the pre-2026-07-13 math (current payment re-amortized the
 *      current balance over the original amortization; wrong on every
 *      seasoned mortgage).
 *  2 — original-schedule stated payment, remaining-amortization comparison,
 *      the balance reconciliation gate, and the like-for-like rate family
 *      with a labelled cross-family alternative. */
export const SAVINGS_CALC_VERSION = 2

/** Every input that affects a printed figure, replayable. Figures are money
 * and rates only; no client name enters the log inputs (the household id is
 * the key, matching the smm_rows persistence). */
export interface SavingsLogInputs {
  householdId: string
  todayYMD: string
  amount: number | null
  balance: number | null
  rate: number | null
  rateType: string | null
  startDate: string | null
  maturityDate: string | null
  amortizationMonths: number | null
  homeValue: number | null
  insuranceType: string | null
  productClass: string | null
  methodologyKnown: boolean
  crossFamilyApproved: boolean
  /** The headline comparable actually used (null when none was eligible). */
  comparable: Comparable | null
  /** The labelled alternative's quote, when one was attached. Its figures are
   * NOT stored as inputs — replay recomputes them from this quote, so the
   * replay is a real recomputation, never an echo. */
  alternative: Comparable | null
}

const round2 = (n: number | null | undefined): number | null =>
  n == null ? null : Math.round(n * 100) / 100

/** Canonical JSON: keys sorted at every level, so the hash is stable across
 * property order. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map(k => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`
}

export function savingsInputsHash(inputs: SavingsLogInputs): string {
  return createHash('sha256').update(canonical({ v: SAVINGS_CALC_VERSION, ...inputs })).digest('hex')
}

export function savingsLogInputs(
  row: SmmParsedRow,
  analysis: FoxAnalysis,
  todayYMD: string,
  methodologyKnown: boolean,
  crossFamilyApproved: boolean,
): SavingsLogInputs {
  return {
    householdId: row.householdId,
    todayYMD,
    amount: row.amount,
    balance: row.balance,
    rate: row.rate,
    rateType: row.rateType,
    startDate: row.startDate,
    maturityDate: row.maturityDate,
    amortizationMonths: row.amortizationMonths,
    homeValue: row.homeValue,
    insuranceType: row.insuranceType,
    productClass: analysis.productClass,
    methodologyKnown,
    crossFamilyApproved,
    comparable: analysis.comparable,
    alternative: analysis.alternative?.comparable ?? null,
  }
}

/** The figures a reader would need to check the deliverable against the log,
 * rounded to the cent so replay equality is exact. */
export function savingsLogFigures(analysis: FoxAnalysis): Record<string, unknown> {
  return {
    bucket: analysis.bucket,
    currentPayment: round2(analysis.currentPayment),
    newPayment: round2(analysis.newPayment),
    monthlySaving: round2(analysis.monthlySaving),
    netBenefit: round2(analysis.netBenefit),
    breakEvenMonths: round2(analysis.breakEvenMonths),
    horizonMonths: analysis.horizonMonths,
    monthsElapsed: analysis.monthsElapsed,
    remainingAmortizationMonths: analysis.remainingAmortizationMonths,
    penaltyThreeMonthsInterest: round2(analysis.penalty?.threeMonthsInterest ?? null),
    reconciliationDriftPct: analysis.reconciliation ? round2(analysis.reconciliation.driftPct) : null,
    crossFamilyRecommended: analysis.crossFamilyRecommended,
    alternativeNewPayment: round2(analysis.alternative?.newPayment ?? null),
    alternativeMonthlySaving: round2(analysis.alternative?.monthlySaving ?? null),
  }
}

/** One log row, ready for the store. `quotes` carries the identity of every
 * rate used, each with its sheet date, per the approved-only quoting rule. */
export function buildSavingsLogEntry(args: {
  row: SmmParsedRow
  analysis: FoxAnalysis
  surface: 'pdf' | 'board'
  uploadId: string | null
  actingEmail: string
  todayYMD: string
  methodologyKnown: boolean
  crossFamilyApproved: boolean
}): Record<string, unknown> {
  // The inputs carry the APPLIED cross-family state (what actually drove the
  // figures); the row's cross_family_approved column records the approval
  // event itself, which can be true even when no better cross-family quote
  // existed to apply it to.
  const inputs = savingsLogInputs(args.row, args.analysis, args.todayYMD, args.methodologyKnown, args.analysis.crossFamilyRecommended)
  const quotes: Record<string, unknown>[] = []
  if (args.analysis.comparable) {
    const c = args.analysis.comparable
    quotes.push({ role: 'headline', lenderSlug: c.lenderSlug ?? null, lender: c.lender, rate: c.rate, rateType: c.rateType ?? c.kind, termMonths: c.termMonths, sheetDate: c.asOf, variance: c.variance ?? null, primeUsed: c.primeUsed ?? null })
  }
  if (args.analysis.alternative) {
    const c = args.analysis.alternative.comparable
    quotes.push({ role: 'alternative', lenderSlug: c.lenderSlug ?? null, lender: c.lender, rate: c.rate, rateType: c.rateType ?? c.kind, termMonths: c.termMonths, sheetDate: c.asOf, variance: c.variance ?? null, primeUsed: c.primeUsed ?? null })
  }
  return {
    household_id: args.row.householdId,
    upload_id: args.uploadId,
    surface: args.surface,
    calc_version: SAVINGS_CALC_VERSION,
    inputs_hash: savingsInputsHash(inputs),
    inputs,
    quotes,
    prime_as_of: PRIME_MIRROR.asOf,
    bucket: args.analysis.bucket,
    figures: savingsLogFigures(args.analysis),
    cross_family_approved: args.crossFamilyApproved,
    acting_email: args.actingEmail,
  }
}

/** Replay a logged entry's inputs against this calc version and return the
 * figures it produces. Reproducing a log row = replay(entry.inputs) equals
 * entry.figures (asserted in tests). The reconstruction goes through the SAME
 * analyzeOpportunity every surface uses — there is no second math path. */
export function replaySavingsAnalysis(inputs: SavingsLogInputs): Record<string, unknown> {
  const row: SmmParsedRow = {
    householdId: inputs.householdId,
    fileRef: '',
    firstName: '',
    lastName: '',
    clientType: 'CLIENT',
    email: '',
    phone: '',
    address: '',
    propertyType: '',
    occupancy: '',
    homeValue: inputs.homeValue,
    amount: inputs.amount,
    balance: inputs.balance,
    rate: inputs.rate,
    rateType: inputs.rateType,
    closingDate: null,
    startDate: inputs.startDate,
    maturityDate: inputs.maturityDate,
    amortizationMonths: inputs.amortizationMonths,
    termMonths: null,
    lenderRaw: '',
    lender: { display: '', slug: null, inBook: false, mapped: false },
    insuranceType: inputs.insuranceType,
    savingsPotential: null,
    paymentRelief: null,
    accessibleEquity: null,
    purchasingPower: null,
    parseErrors: [],
  }
  const transaction = deriveTransaction(inputs.maturityDate, inputs.todayYMD)
  const ltv = computeLtv(inputs.balance, inputs.homeValue)
  let analysis = analyzeOpportunity(row, inputs.comparable, inputs.methodologyKnown, inputs.todayYMD, {
    transaction,
    productClass: inputs.productClass ?? undefined,
    ltv,
  })
  // Recompute the alternative's figures from its quote at the replayed
  // remaining amortization — a real recomputation, never an echo of stored
  // figures.
  const remaining = analysis.remainingAmortizationMonths
  if (inputs.alternative && analysis.currentPayment != null && remaining != null && inputs.balance != null) {
    const newPayment = monthlyPayment(inputs.balance, inputs.alternative.rate, 'semi-annually', remaining)
    const monthlyDelta = newPayment - analysis.currentPayment
    const alt: AlternativeComparable = {
      comparable: inputs.alternative,
      newPayment,
      monthlyDelta,
      monthlySaving: monthlyDelta < 0 ? -monthlyDelta : 0,
      riskLine: null,
      crossFamily: true,
    }
    analysis = { ...analysis, alternative: alt }
  }
  const figures = savingsLogFigures(analysis)
  // The cross-family flag is presentation state carried on the inputs, not
  // arithmetic; replay compares the money figures.
  figures.crossFamilyRecommended = inputs.crossFamilyApproved
  return figures
}
