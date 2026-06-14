/**
 * Refinance analyzer engine — framework-agnostic refinance math.
 *
 * `analyzeRefinance()` is the single source of truth for every number the
 * /refinance page shows. The component does no parallel math: it gathers inputs,
 * calls this, and renders the result.
 *
 * Conventions:
 *   - Canadian fixed/variable mortgages compound semi-annually, payments monthly.
 *     We convert the annual rate to an effective monthly rate accordingly.
 *   - Money is returned unrounded; the page rounds for display.
 *   - The penalty is supplied as a number (computed by the shared penalty engine
 *     in the page, or entered manually from a commitment letter). The penalty
 *     engine contract is re-exported here so callers can wire it from one place.
 *
 * Validated against the reference scenario in the project brief:
 *   balance 480,000 @ 5.25% fixed / 25y; new 4.29% fixed / 25y, 5y term;
 *   penalty 6,300 + legal 1,200 + discharge 350 + appraisal 400, roll-in off
 *   -> current ~2,860/mo, new ~2,601/mo, saving ~259/mo, out-of-pocket 8,250,
 *      break-even ~32 months, interest saved over term ~22,100.
 */

// Re-export the penalty engine contract so the analyzer wires penalty math from
// one place. The implementation lives in lib/penalty-engine.ts.
export type {
  PenaltyEngine,
  PenaltyInput,
  PenaltyResult,
} from '@/lib/penalty-engine'
export { calculatePenalty } from '@/lib/penalty-engine'

export type RefiRateType = 'fixed' | 'variable'

export interface RefinanceInput {
  // --- Current mortgage ---
  propertyValue: number
  currentBalance: number
  /** Annual rate, e.g. 5.25 */
  currentRate: number
  currentRateType: RefiRateType
  /** Monthly payment. Page passes the computed default or the user's override. */
  currentPayment: number
  remainingAmortizationMonths: number

  // --- New mortgage ---
  /** Annual rate, e.g. 4.29 */
  newRate: number
  newRateType: RefiRateType
  newAmortizationMonths: number
  /** Comparison window, in months (e.g. a 5-year term = 60). */
  termMonths: number
  /** Cash pulled out of equity, added to the new principal. */
  equityTakeout: number

  // --- Refinancing costs ---
  penalty: number
  legalFee: number
  dischargeFee: number
  appraisalFee: number
  otherCosts: number
  /** Reduces total costs (e.g. a lender rebate). */
  lenderCredit: number
  /** When true, net costs are added to the new principal instead of paid in cash. */
  rollIntoMortgage: boolean

  /**
   * Consumer debts the borrower may fold into the new mortgage. Optional and
   * additive: when absent or empty, every output is identical to a plain
   * refinance. Each debt carries its own Consolidate toggle.
   */
  debts?: Debt[]
}

/** A consumer debt that can optionally be rolled into the mortgage. */
export interface Debt {
  id?: string
  label: string
  /** Outstanding balance. */
  balance: number
  /** Annual rate, e.g. 19.99 */
  rate: number
  /** Current monthly payment the borrower makes on this debt. */
  payment: number
  /** When true, this debt is folded into the new mortgage. */
  consolidate: boolean
}

/**
 * Debt-consolidation breakdown. Two separate lenses, never added together:
 *   - effectiveMonthlySaving is the cash-flow win (payments that go away).
 *   - lifetimeInterestDelta is the long-run interest cost of spreading the
 *     debt over the full amortization instead of paying it off fast.
 */
export interface ConsolidationResult {
  hasConsolidation: boolean
  /** Sum of the balances being folded in. */
  consolidatedBalance: number
  /** (current mortgage payment + freed debt payments) - new mortgage payment. */
  effectiveMonthlySaving: number
  /** How much the mortgage payment rises from folding the debt in. */
  mortgagePaymentIncreaseFromDebt: number
  /** Interest on the consolidated debts over the term, serviced standalone. */
  consolidatedDebtInterestOverTerm: number
  /** Total interest to clear those debts standalone, over their full life. */
  standaloneInterest: number
  /** Interest on the consolidated balance spread over the new amortization. */
  consolidatedIntoMortgageInterest: number
  /** Long-run interest added by consolidating (consolidated minus standalone). */
  lifetimeInterestDelta: number
  /** Longest standalone payoff among the consolidated debts, in months. */
  longestStandalonePayoffMonths: number
}

export interface ScheduleRow {
  month: number
  currentPayment: number
  newPayment: number
  monthlySaving: number
  cumulativeSaving: number
  /** Cumulative saving minus out-of-pocket cost. Crosses zero at break-even. */
  netPosition: number
  currentBalance: number
  newBalance: number
}

export interface RefinanceResult {
  // Payments
  currentPayment: number
  newPayment: number
  monthlyPaymentChange: number // newPayment - currentPayment (negative = lower)
  monthlySaving: number // currentPayment - newPayment (positive = saving)
  /**
   * Blended monthly saving used for break-even and the schedule. Equals the
   * mortgage-only monthlySaving when no debts are consolidated; otherwise it is
   * the mortgage change plus the debt payments that disappear.
   */
  effectiveMonthlySaving: number

  // New loan / costs
  newPrincipal: number
  newLtv: number // % of property value
  totalCosts: number // sum of fees before credit
  netCosts: number // after lender credit
  financedCosts: number // amount rolled into the mortgage
  outOfPocket: number // cash needed at closing

  // Term-window outcomes
  termMonths: number
  breakEvenMonths: number | null
  interestPaidCurrentOverTerm: number
  interestPaidNewOverTerm: number
  interestSavedOverTerm: number
  currentBalanceAtTermEnd: number
  newBalanceAtTermEnd: number
  balanceDifferenceAtTermEnd: number // current - new (positive = you owe less)
  netBenefitOverTerm: number

  // Time to mortgage-free (if the client keeps paying the current payment)
  payoffMonthsCurrent: number
  payoffMonthsNewAtCurrentPayment: number
  timeToMortgageFreeSavedMonths: number

  /** Debt-consolidation breakdown, or null when no debts are entered. */
  consolidation: ConsolidationResult | null

  schedule: ScheduleRow[]
}

/**
 * Effective monthly rate for a Canadian mortgage (semi-annual compounding).
 * annualPct is a percentage, e.g. 5.25.
 */
export function effectiveMonthlyRate(annualPct: number): number {
  if (annualPct <= 0) return 0
  return Math.pow(1 + annualPct / 200, 1 / 6) - 1
}

/**
 * Compounding convention. Canadian mortgages compound semi-annually; revolving
 * consumer debt (credit cards, lines of credit) compounds monthly.
 */
export type Compounding = 'semiannual' | 'monthly'

/** Effective per-month rate for a given compounding convention. */
function periodicRate(annualPct: number, comp: Compounding): number {
  if (annualPct <= 0) return 0
  return comp === 'monthly' ? annualPct / 1200 : effectiveMonthlyRate(annualPct)
}

/**
 * Level monthly payment that amortizes `principal` over `amortMonths` at the
 * given annual rate. Defaults to semi-annual compounding, so existing callers
 * are unchanged; pass 'monthly' for consumer debt.
 */
export function monthlyPayment(
  principal: number,
  annualPct: number,
  amortMonths: number,
  comp: Compounding = 'semiannual',
): number {
  if (principal <= 0 || amortMonths <= 0) return 0
  const i = periodicRate(annualPct, comp)
  if (i === 0) return principal / amortMonths
  return (principal * i) / (1 - Math.pow(1 + i, -amortMonths))
}

/**
 * Whole months to clear `principal` at `payment`, for a given compounding.
 * Returns Infinity when the payment never covers the interest.
 */
export function payoffMonths(
  principal: number,
  annualPct: number,
  payment: number,
  comp: Compounding,
): number {
  if (principal <= 0) return 0
  const i = periodicRate(annualPct, comp)
  if (i === 0) return Math.ceil(principal / payment)
  if (payment <= principal * i) return Infinity
  return Math.ceil(-Math.log(1 - (i * principal) / payment) / Math.log(1 + i))
}

/**
 * Amortize `principal` for up to `months`, returning the interest and total
 * paid and the ending balance. Stops early once the balance reaches zero.
 */
export function amortize(
  principal: number,
  annualPct: number,
  payment: number,
  months: number,
  comp: Compounding,
): { interestPaid: number; totalPaid: number; endingBalance: number; paidOffMonth: number | null } {
  const i = periodicRate(annualPct, comp)
  let balance = principal
  let interestPaid = 0
  let totalPaid = 0
  let paidOffMonth: number | null = null
  for (let m = 1; m <= months; m++) {
    if (balance <= 0) break
    const interest = balance * i
    const due = balance + interest
    const pay = Math.min(payment, due)
    interestPaid += interest
    totalPaid += pay
    balance = due - pay
    if (balance <= 1e-6 && paidOffMonth === null) {
      paidOffMonth = m
      balance = 0
    }
  }
  return { interestPaid, totalPaid, endingBalance: Math.max(0, balance), paidOffMonth }
}

/**
 * Debt-consolidation math. Pure helper: given the debts and the new mortgage
 * payment, it works out the cash-flow saving and the long-run interest cost.
 * Debts compound monthly; the mortgage slice uses the mortgage compounding.
 */
export function computeConsolidation(
  debts: Debt[],
  currentMortgagePayment: number,
  newMortgagePayment: number,
  newRate: number,
  newAmortizationMonths: number,
  termMonths: number,
  mortgageComp: Compounding,
): ConsolidationResult {
  const DEBT_COMP: Compounding = 'monthly'
  const consolidated = (debts || []).filter((d) => d.consolidate)
  const hasConsolidation = consolidated.length > 0

  const consolidatedBalance = consolidated.reduce((s, d) => s + d.balance, 0)

  // Cash freed up each month: the mortgage payment change plus the debt
  // payments the borrower no longer makes.
  const freedDebtPayments = consolidated.reduce((s, d) => s + d.payment, 0)
  const effectiveMonthlySaving =
    currentMortgagePayment + freedDebtPayments - newMortgagePayment

  // Interest the borrower currently pays on these debts across the term window.
  const consolidatedDebtInterestOverTerm = consolidated.reduce(
    (s, d) => s + amortize(d.balance, d.rate, d.payment, termMonths, DEBT_COMP).interestPaid,
    0,
  )

  // Total interest to clear those debts on their own, over their full life.
  const standaloneInterest = consolidated.reduce((s, d) => {
    const months = payoffMonths(d.balance, d.rate, d.payment, DEBT_COMP)
    const horizon = isFinite(months) ? months : 1200
    return s + amortize(d.balance, d.rate, d.payment, horizon, DEBT_COMP).interestPaid
  }, 0)

  // The marginal mortgage payment and interest from the consolidated balance,
  // spread over the full new amortization. Payment is linear in principal, so
  // this is exactly the amount the mortgage payment rises.
  const slicePayment = monthlyPayment(
    consolidatedBalance,
    newRate,
    newAmortizationMonths,
    mortgageComp,
  )
  const consolidatedIntoMortgageInterest =
    slicePayment * newAmortizationMonths - consolidatedBalance

  const lifetimeInterestDelta = consolidatedIntoMortgageInterest - standaloneInterest

  const longestStandalonePayoffMonths = consolidated.reduce((mx, d) => {
    const months = payoffMonths(d.balance, d.rate, d.payment, DEBT_COMP)
    return Math.max(mx, isFinite(months) ? months : 0)
  }, 0)

  return {
    hasConsolidation,
    consolidatedBalance,
    effectiveMonthlySaving,
    mortgagePaymentIncreaseFromDebt: slicePayment,
    consolidatedDebtInterestOverTerm,
    standaloneInterest,
    consolidatedIntoMortgageInterest,
    lifetimeInterestDelta,
    longestStandalonePayoffMonths,
  }
}

/**
 * Whole months to pay a balance to zero at the given payment. Returns Infinity
 * if the payment never covers the interest.
 */
export function monthsToPayoff(
  principal: number,
  annualPct: number,
  payment: number,
): number {
  if (principal <= 0) return 0
  const i = effectiveMonthlyRate(annualPct)
  if (i === 0) return Math.ceil(principal / payment)
  if (payment <= principal * i) return Infinity
  const n = -Math.log(1 - (i * principal) / payment) / Math.log(1 + i)
  return Math.ceil(n)
}

interface SimRow {
  balance: number
  payment: number
  interest: number
}

/** Simulate one mortgage for `months`, returning per-month balance/payment/interest. */
function simulate(
  principal: number,
  annualPct: number,
  payment: number,
  months: number,
): SimRow[] {
  const i = effectiveMonthlyRate(annualPct)
  const rows: SimRow[] = []
  let balance = principal
  for (let m = 0; m < months; m++) {
    if (balance <= 0) {
      rows.push({ balance: 0, payment: 0, interest: 0 })
      continue
    }
    const interest = balance * i
    // Final payment can't exceed what's owed.
    const due = balance + interest
    const pay = Math.min(payment, due)
    balance = due - pay
    rows.push({ balance, payment: pay, interest })
  }
  return rows
}

export function analyzeRefinance(input: RefinanceInput): RefinanceResult {
  const {
    propertyValue,
    currentBalance,
    currentRate,
    currentPayment,
    newRate,
    newAmortizationMonths,
    termMonths,
    equityTakeout,
    penalty,
    legalFee,
    dischargeFee,
    appraisalFee,
    otherCosts,
    lenderCredit,
    rollIntoMortgage,
  } = input

  const totalCosts = penalty + legalFee + dischargeFee + appraisalFee + otherCosts
  const netCosts = totalCosts - lenderCredit
  const financedCosts = rollIntoMortgage ? Math.max(0, netCosts) : 0
  const outOfPocket = rollIntoMortgage ? 0 : Math.max(0, netCosts)

  // Debt consolidation: fold the balances of the selected debts into the new
  // principal, alongside any equity takeout and rolled-in fees.
  const consolidatedBalance = (input.debts || [])
    .filter((d) => d.consolidate)
    .reduce((s, d) => s + d.balance, 0)

  const newPrincipal = currentBalance + equityTakeout + financedCosts + consolidatedBalance
  const newPayment = monthlyPayment(newPrincipal, newRate, newAmortizationMonths)

  const monthlySaving = currentPayment - newPayment
  const monthlyPaymentChange = newPayment - currentPayment

  // Mortgages compound semi-annually.
  const newComp: Compounding = 'semiannual'
  const consolidation =
    input.debts && input.debts.length > 0
      ? computeConsolidation(
          input.debts,
          currentPayment,
          newPayment,
          newRate,
          newAmortizationMonths,
          termMonths,
          newComp,
        )
      : null

  // Blended saving: when debts are folded in, the cash-flow win is the mortgage
  // change plus the debt payments that disappear. Otherwise it is the
  // mortgage-only saving, so a plain refinance is unchanged.
  const effectiveMonthlySaving = consolidation?.hasConsolidation
    ? consolidation.effectiveMonthlySaving
    : monthlySaving

  // Simulate both mortgages across the comparison window.
  const cur = simulate(currentBalance, currentRate, currentPayment, termMonths)
  const next = simulate(newPrincipal, newRate, newPayment, termMonths)

  const schedule: ScheduleRow[] = []
  let cumulativeSaving = 0
  let breakEvenMonths: number | null = null
  let interestCurrent = 0
  let interestNew = 0
  let payTotalCurrent = 0
  let payTotalNew = 0

  for (let m = 0; m < termMonths; m++) {
    const c = cur[m]
    const n = next[m]
    interestCurrent += c.interest
    interestNew += n.interest
    payTotalCurrent += c.payment
    payTotalNew += n.payment

    // When consolidating, the saving is the level blended figure (a cash-flow
    // view). Without consolidation this is exactly the mortgage-only difference,
    // so the schedule and break-even match a plain refinance precisely.
    const saving = consolidation?.hasConsolidation
      ? effectiveMonthlySaving
      : c.payment - n.payment
    cumulativeSaving += saving
    const netPosition = cumulativeSaving - outOfPocket
    if (breakEvenMonths === null && netPosition >= 0) {
      breakEvenMonths = m + 1
    }

    schedule.push({
      month: m + 1,
      currentPayment: c.payment,
      newPayment: n.payment,
      monthlySaving: saving,
      cumulativeSaving,
      netPosition,
      currentBalance: c.balance,
      newBalance: n.balance,
    })
  }

  const currentBalanceAtTermEnd = cur[termMonths - 1]?.balance ?? currentBalance
  const newBalanceAtTermEnd = next[termMonths - 1]?.balance ?? newPrincipal
  const balanceDifferenceAtTermEnd = currentBalanceAtTermEnd - newBalanceAtTermEnd
  // The debts the borrower currently services are part of today's interest cost,
  // so credit that interest to the "current" side of the comparison.
  if (consolidation?.hasConsolidation) {
    interestCurrent += consolidation.consolidatedDebtInterestOverTerm
  }
  const interestSavedOverTerm = interestCurrent - interestNew

  // Holistic net benefit over the window: payment savings + ending-balance
  // advantage, less the cash cost, plus any equity pulled out as cash.
  const netBenefitOverTerm =
    payTotalCurrent -
    payTotalNew +
    balanceDifferenceAtTermEnd -
    outOfPocket +
    equityTakeout

  const payoffMonthsCurrent = monthsToPayoff(currentBalance, currentRate, currentPayment)
  const payoffMonthsNewAtCurrentPayment = monthsToPayoff(
    newPrincipal,
    newRate,
    currentPayment,
  )
  const timeToMortgageFreeSavedMonths =
    isFinite(payoffMonthsCurrent) && isFinite(payoffMonthsNewAtCurrentPayment)
      ? payoffMonthsCurrent - payoffMonthsNewAtCurrentPayment
      : 0

  return {
    currentPayment,
    newPayment,
    monthlyPaymentChange,
    monthlySaving,
    effectiveMonthlySaving,

    newPrincipal,
    newLtv: propertyValue > 0 ? (newPrincipal / propertyValue) * 100 : 0,
    totalCosts,
    netCosts,
    financedCosts,
    outOfPocket,

    termMonths,
    breakEvenMonths,
    interestPaidCurrentOverTerm: interestCurrent,
    interestPaidNewOverTerm: interestNew,
    interestSavedOverTerm,
    currentBalanceAtTermEnd,
    newBalanceAtTermEnd,
    balanceDifferenceAtTermEnd,
    netBenefitOverTerm,

    payoffMonthsCurrent,
    payoffMonthsNewAtCurrentPayment,
    timeToMortgageFreeSavedMonths,

    consolidation,

    schedule,
  }
}
