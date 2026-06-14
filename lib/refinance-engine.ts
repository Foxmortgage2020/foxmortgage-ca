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
 * Level monthly payment that amortizes `principal` over `amortMonths` at the
 * given annual rate (semi-annual compounding).
 */
export function monthlyPayment(
  principal: number,
  annualPct: number,
  amortMonths: number,
): number {
  if (principal <= 0 || amortMonths <= 0) return 0
  const i = effectiveMonthlyRate(annualPct)
  if (i === 0) return principal / amortMonths
  return (principal * i) / (1 - Math.pow(1 + i, -amortMonths))
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

  const newPrincipal = currentBalance + equityTakeout + financedCosts
  const newPayment = monthlyPayment(newPrincipal, newRate, newAmortizationMonths)

  const monthlySaving = currentPayment - newPayment
  const monthlyPaymentChange = newPayment - currentPayment

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

    const saving = c.payment - n.payment
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

    schedule,
  }
}
