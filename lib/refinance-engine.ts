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
/** How a debt is carried for the long-run baseline. */
export type DebtBasis = 'minimum' | 'fixed'

export interface Debt {
  id?: string
  label: string
  /** Outstanding balance. */
  balance: number
  /** Annual rate, e.g. 19.99 */
  rate: number
  /** Current monthly payment the borrower makes on this debt (cash-flow basis). */
  payment: number
  /** When true, this debt is folded into the new mortgage. */
  consolidate: boolean
  /**
   * How the debt would otherwise be carried, for the long-run baseline only.
   * 'minimum' = revolving credit paid at the shrinking minimum (the realistic
   * way cards get carried). 'fixed' = installment loan paid at a level payment.
   */
  basis: DebtBasis
  /** Minimum payment percent of balance (revolving only). Defaults to 3. */
  minPercent?: number
  /** Minimum payment dollar floor (revolving only). Defaults to 10. */
  minFloor?: number
}

/**
 * Debt-consolidation breakdown. Three separate lenses, never added together:
 *   - effectiveMonthlySaving is the cash-flow win (payments that go away).
 *   - longRunInterestDelta is the long-run interest difference on a realistic
 *     baseline. Negative means consolidating also saves interest.
 *   - the keep-payment acceleration scenario lives in AccelerationScenario.
 */
export interface ConsolidationResult {
  hasConsolidation: boolean
  /** Sum of the balances being folded in. */
  consolidatedBalance: number
  /** (current mortgage payment + removed debt payments) - new mortgage payment. */
  effectiveMonthlySaving: number
  /** Sum of the current monthly payments on the consolidated debts. */
  removedDebtPayments: number
  /** How much the mortgage payment rises from folding the debt in. */
  mortgagePaymentIncreaseFromDebt: number
  /** Interest on the consolidated debts over the term, on the realistic basis. */
  consolidatedDebtInterestOverTerm: number
  /**
   * Interest to clear the consolidated debts standalone on their realistic
   * basis (minimum payments for revolving, level payments for installment).
   */
  standaloneInterestRealistic: number
  /** Interest on the consolidated balance spread over the full new amortization. */
  consolidatedDebtInterestLifetime: number
  /**
   * consolidatedDebtInterestLifetime - standaloneInterestRealistic. Negative
   * means folding the debt into the mortgage also costs less interest long run.
   */
  longRunInterestDelta: number
  /** Longest realistic standalone payoff among the consolidated debts, in months. */
  longestStandalonePayoffMonths: number
  /**
   * True only when every consolidated debt actually clears on its realistic
   * basis within the cap. When false, the standalone interest and payoff figures
   * are not meaningful (a payment that never covers interest), so the UI shows a
   * qualitative long-run message instead of dollar amounts.
   */
  allDebtsClear: boolean
  /** True when every consolidated debt is revolving (minimum-payment basis). */
  allRevolving: boolean
}

/**
 * The "keep your payment" strategy: instead of pocketing the freed cash, the
 * borrower holds their current total outlay on the new (larger) mortgage and is
 * mortgage-free sooner.
 */
export interface AccelerationScenario {
  /** True when keeping the payment actually accelerates payoff. */
  available: boolean
  /** Cash that could be pocketed each month instead (the freed-cash direction). */
  freedCashFlow: number
  /** Current mortgage payment plus the removed debt payments. */
  keepPaymentAmount: number
  /** Months to clear the new mortgage at keepPaymentAmount. */
  payoffMonths: number
  /** Months to clear the new mortgage at its normal payment (the amortization). */
  baselinePayoffMonths: number
  /** Months shaved off by keeping the payment. */
  monthsSaved: number
  /** Mortgage interest saved by keeping the payment. */
  interestSaved: number
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

  /** Keep-your-payment acceleration scenario, or null when no consolidation. */
  acceleration: AccelerationScenario | null

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
 * Project how a debt is carried standalone, on its realistic basis, for up to
 * `maxMonths`. Revolving debt is paid at the shrinking minimum (the greater of a
 * percent of the balance and a dollar floor), which is why cards take so long to
 * clear. Installment debt is paid at its level payment. Returns interest, total
 * paid, the months to clear (capped at maxMonths), and any ending balance.
 */
export function projectStandaloneDebt(
  debt: Debt,
  comp: Compounding,
  maxMonths: number,
): { months: number; interest: number; totalPaid: number; endingBalance: number; cleared: boolean } {
  const i = periodicRate(debt.rate, comp)
  const minPct = (debt.minPercent ?? 3) / 100
  const minFloor = debt.minFloor ?? 10
  let balance = debt.balance
  let interest = 0
  let totalPaid = 0
  let months = 0
  let cleared = balance <= 0
  for (let m = 1; m <= maxMonths; m++) {
    if (balance <= 0) break
    const it = balance * i
    const scheduled =
      debt.basis === 'minimum' ? Math.max(minFloor, minPct * balance) : debt.payment
    // The payment never covers the interest, so the balance does not shrink and
    // the debt never clears. Stop here instead of compounding to the cap and
    // returning a nonsensical interest figure. `cleared` stays false.
    if (scheduled <= it) break
    const due = balance + it
    const pay = Math.min(scheduled, due)
    interest += it
    totalPaid += pay
    balance = due - pay
    months = m
    if (balance <= 1e-6) {
      balance = 0
      cleared = true
      break
    }
  }
  return { months, interest, totalPaid, endingBalance: Math.max(0, balance), cleared }
}

/**
 * Debt-consolidation math (v2). The cash-flow saving uses the entered current
 * payments; the long-run comparison uses each debt's realistic carrying basis.
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
  const LIFETIME_CAP = 1200
  const consolidated = (debts || []).filter((d) => d.consolidate)
  const hasConsolidation = consolidated.length > 0

  const consolidatedBalance = consolidated.reduce((s, d) => s + d.balance, 0)

  // Cash freed up each month: the mortgage payment change plus the debt payments
  // the borrower no longer makes. Uses the entered current payments.
  const removedDebtPayments = consolidated.reduce((s, d) => s + d.payment, 0)
  const effectiveMonthlySaving =
    currentMortgagePayment + removedDebtPayments - newMortgagePayment

  // Interest the borrower would pay on these debts across the term window, on
  // their realistic basis.
  const consolidatedDebtInterestOverTerm = consolidated.reduce(
    (s, d) => s + projectStandaloneDebt(d, DEBT_COMP, termMonths).interest,
    0,
  )

  // Realistic interest to clear those debts on their own, over their full life.
  const lifetimeProjections = consolidated.map((d) => projectStandaloneDebt(d, DEBT_COMP, LIFETIME_CAP))
  // Whether every consolidated debt actually clears on its realistic basis. When
  // a payment never covers the interest, the standalone figures are not
  // meaningful and the UI shows a qualitative message instead of dollar amounts.
  const allDebtsClear = hasConsolidation && lifetimeProjections.every((p) => p.cleared)
  const allRevolving = hasConsolidation && consolidated.every((d) => d.basis === 'minimum')
  const standaloneInterestRealistic = lifetimeProjections.reduce((s, p) => s + p.interest, 0)

  // The marginal mortgage payment and interest from the consolidated balance,
  // spread over the full new amortization. Payment is linear in principal, so
  // this is exactly the amount the mortgage payment rises.
  const slicePayment = monthlyPayment(
    consolidatedBalance,
    newRate,
    newAmortizationMonths,
    mortgageComp,
  )
  const consolidatedDebtInterestLifetime =
    slicePayment * newAmortizationMonths - consolidatedBalance

  // Negative means consolidating also saves interest over the long run.
  const longRunInterestDelta =
    consolidatedDebtInterestLifetime - standaloneInterestRealistic

  const longestStandalonePayoffMonths = lifetimeProjections.reduce((mx, p) => Math.max(mx, p.months), 0)

  return {
    hasConsolidation,
    consolidatedBalance,
    effectiveMonthlySaving,
    removedDebtPayments,
    mortgagePaymentIncreaseFromDebt: slicePayment,
    consolidatedDebtInterestOverTerm,
    standaloneInterestRealistic,
    consolidatedDebtInterestLifetime,
    longRunInterestDelta,
    longestStandalonePayoffMonths,
    allDebtsClear,
    allRevolving,
  }
}

/**
 * The keep-your-payment acceleration scenario. If the borrower holds their
 * current total outlay (mortgage payment plus the removed debt payments) on the
 * new mortgage, how much sooner is it paid off and how much interest is saved.
 */
export function computeAcceleration(
  newPrincipal: number,
  newRate: number,
  newAmortizationMonths: number,
  currentMortgagePayment: number,
  removedDebtPayments: number,
  newPayment: number,
  comp: Compounding,
): AccelerationScenario {
  const keepPaymentAmount = currentMortgagePayment + removedDebtPayments
  const freedCashFlow = currentMortgagePayment + removedDebtPayments - newPayment
  const available = removedDebtPayments > 0 && keepPaymentAmount > newPayment + 1e-9

  const baselinePayoffMonths = newAmortizationMonths
  const rawPayoff = payoffMonths(newPrincipal, newRate, keepPaymentAmount, comp)
  const payoff = available && isFinite(rawPayoff) ? rawPayoff : baselinePayoffMonths
  const monthsSaved = Math.max(0, baselinePayoffMonths - payoff)

  // Interest on the new mortgage at its normal payment versus the kept payment.
  const baselineInterest = newPayment * newAmortizationMonths - newPrincipal
  const keepInterest = available
    ? amortize(newPrincipal, newRate, keepPaymentAmount, payoff, comp).interestPaid
    : baselineInterest
  const interestSaved = baselineInterest - keepInterest

  return {
    available,
    freedCashFlow,
    keepPaymentAmount,
    payoffMonths: payoff,
    baselinePayoffMonths,
    monthsSaved,
    interestSaved,
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

  // Keep-your-payment acceleration: only when debts are folded in.
  const acceleration = consolidation?.hasConsolidation
    ? computeAcceleration(
        newPrincipal,
        newRate,
        newAmortizationMonths,
        currentPayment,
        consolidation.removedDebtPayments,
        newPayment,
        newComp,
      )
    : null

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
  // Mortgage interest only. The debt-interest story is carried separately by the
  // consolidation long-run callout on the realistic basis, so the four summary
  // cards stay a clean mortgage-versus-mortgage comparison.
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
    acceleration,

    schedule,
  }
}
