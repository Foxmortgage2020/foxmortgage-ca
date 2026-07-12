// The cost of a constraint (Part 3, the feature that matters). When a client
// constraint or a manual lender selection narrows the field, this quantifies
// what the preference costs: the rate gap, the monthly payment gap, and the gap
// over the remaining term — computed by the shared, cent-validated engine
// (lib/mortgage-engine.ts monthlyPayment), NEVER a fresh implementation.
//
// Pure. The two "best" options (unconstrained vs constrained) are chosen by the
// caller (the scenario ranking); this turns two rates into the plain-language
// delta the client sees on screen and in the PDF.

import { monthlyPayment } from '@/lib/mortgage-engine'
import { applyConstraints, type Constraint } from '@/lib/constraints'

export interface CostOption {
  /** Effective rate as a percent (printed for fixed; prime+variance for floating). */
  rate: number
  lender: string
  lenderSlug?: string
}

export interface CostOfConstraint {
  unconstrained: CostOption & { monthlyPayment: number }
  constrained: CostOption & { monthlyPayment: number }
  /** constrained.rate − unconstrained.rate; positive means the preference costs more. */
  rateDeltaPct: number
  /** constrained payment − unconstrained payment (per month); positive = costs more. */
  monthlyDelta: number
  /** monthlyDelta × termMonths — the cost over the term. */
  termDelta: number
  termMonths: number
  amount: number
}

/**
 * Compute the cost of choosing the constrained option over the best available.
 * Both payments use the same amount and amortization so the delta isolates the
 * rate. Returns null when the inputs cannot price (no amount, no amortization).
 * A non-positive delta (the constrained option is as good or better) is returned
 * honestly, not hidden — the caller decides whether to render it.
 */
export function computeCostOfConstraint(
  unconstrained: CostOption,
  constrained: CostOption,
  amount: number | null,
  amortizationYears: number,
  termMonths: number,
): CostOfConstraint | null {
  if (!amount || amount <= 0 || !amortizationYears || amortizationYears <= 0) return null
  const amortMonths = amortizationYears * 12
  const uPay = monthlyPayment(amount, unconstrained.rate, 'semi-annually', amortMonths)
  const cPay = monthlyPayment(amount, constrained.rate, 'semi-annually', amortMonths)
  const monthlyDelta = round2(cPay - uPay)
  return {
    unconstrained: { ...unconstrained, monthlyPayment: round2(uPay) },
    constrained: { ...constrained, monthlyPayment: round2(cPay) },
    rateDeltaPct: round2(constrained.rate - unconstrained.rate),
    monthlyDelta,
    termDelta: round2(monthlyDelta * termMonths),
    termMonths,
    amount,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * The cost a client's active constraints impose, from a set of ELIGIBLE fixed
 * quotes (already province + program filtered, of the right product class). The
 * best unconstrained rate versus the best rate the constraints still allow.
 * Fixed rates only (printed, no prime needed) so this prices server-side without
 * a token. Returns null when it cannot price (no amount, no eligible quotes) or
 * when the constraints leave nothing (a required-but-unavailable lender). A
 * non-positive delta is still returned; the caller decides how to show it.
 */
export function dealConstraintCost(
  eligibleFixed: { lenderSlug: string; rate: number }[],
  lenderName: (slug: string) => string,
  active: Constraint[],
  amount: number | null,
  amortizationYears: number,
  termMonths: number,
): CostOfConstraint | null {
  if (eligibleFixed.length === 0) return null
  // Best rate per lender, then the overall best.
  const bestByLender = new Map<string, number>()
  for (const q of eligibleFixed) {
    const cur = bestByLender.get(q.lenderSlug)
    if (cur === undefined || q.rate < cur) bestByLender.set(q.lenderSlug, q.rate)
  }
  const slugs = Array.from(bestByLender.keys())
  const bestUnconstrainedSlug = slugs.reduce((a, b) => (bestByLender.get(b)! < bestByLender.get(a)! ? b : a))
  const app = applyConstraints(slugs, active)
  const constrainedSlugs = app.visible.length > 0 ? app.visible : []
  if (constrainedSlugs.length === 0) return null // required-but-unavailable, or all excluded
  const bestConstrainedSlug = constrainedSlugs.reduce((a, b) => (bestByLender.get(b)! < bestByLender.get(a)! ? b : a))
  return computeCostOfConstraint(
    { rate: bestByLender.get(bestUnconstrainedSlug)!, lender: lenderName(bestUnconstrainedSlug), lenderSlug: bestUnconstrainedSlug },
    { rate: bestByLender.get(bestConstrainedSlug)!, lender: lenderName(bestConstrainedSlug), lenderSlug: bestConstrainedSlug },
    amount,
    amortizationYears,
    termMonths,
  )
}

/** Grade-6 one-liner for the readout and the PDF. Costs are stated positively
 * ("costs $X a month"); a non-positive delta says the preference costs nothing. */
export function costSentence(c: CostOfConstraint): string {
  const termYears = Math.round(c.termMonths / 12)
  if (c.monthlyDelta <= 0) {
    return `${c.constrained.lender}'s best for this file (${c.constrained.rate}%) matches or beats the best available; this preference costs nothing today.`
  }
  const money = (n: number) => '$' + Math.round(n).toLocaleString('en-CA')
  return (
    `${c.constrained.lender}'s best for this file is ${c.constrained.rate}%. ` +
    `The best available is ${c.unconstrained.rate}% (${c.unconstrained.lender}). ` +
    `This preference costs ${money(c.monthlyDelta)} a month and ${money(c.termDelta)} over a ${termYears}-year term.`
  )
}
