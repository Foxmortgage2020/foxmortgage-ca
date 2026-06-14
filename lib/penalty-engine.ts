/**
 * Shared prepayment-penalty engine.
 *
 * This is the single source of truth for the simplified IRD / three-month-interest
 * penalty math used across the site. It powers both:
 *   - the /penalty calculator page (lender dropdown, BoC posted-rate lookup), and
 *   - the /refinance analyzer's penalty cost line.
 *
 * The per-mortgage-type functions (calculateFixed / calculateVariable /
 * calculateAdjustable) were moved here verbatim from app/penalty/calculations.ts.
 * Their behaviour is unchanged. The new piece is `calculatePenalty`, a single
 * entry point matching the `PenaltyEngine` contract so callers that only know a
 * lender slug + rate type can ask for a penalty without re-implementing the math.
 *
 * Lender list and per-lender methodology live in lib/lenders.ts and are kept
 * exactly as they are today.
 */

import {
  getLenderBySlug,
  type Lender,
} from '@/lib/lenders'

export interface PenaltyResult {
  irdPenalty: number
  threeMonthPenalty: number
  totalPenalty: number
  irdRateRaw: number
  irdRateApplied: number
  discount: number
  methodLabel: string
  breakdown: {
    principal: number
    monthsRemaining: number
    contractRate: number
    postedRate?: number
    comparableRate: number
    threeMonthRate: number
  }
}

export interface FixedInputs {
  principal: number
  monthsRemaining: number
  contractRate: number
  postedRate: number
  comparableRate: number
}

export interface VariableInputs {
  principal: number
  monthsRemaining: number
  contractRate: number
}

export interface AdjustableInputs {
  principal: number
  monthsRemaining: number
  primeRate: number
  // Signed: pass negative for "prime − 0.40", positive for "prime + 0.50".
  primeAdjustment: number
}

function methodLabelFor(method: Lender['irdMethod']): string {
  switch (method) {
    case 'discounted':
      return 'Discounted IRD'
    case 'standard':
      return 'Fair IRD'
    case 'hybrid':
      return 'Hybrid IRD'
  }
}

export function calculateFixed(lender: Lender, inputs: FixedInputs): PenaltyResult {
  const { principal, monthsRemaining, contractRate, postedRate, comparableRate } = inputs

  const discount = postedRate - contractRate
  const irdRateRaw =
    lender.irdMethod === 'discounted'
      ? contractRate - (comparableRate - discount)
      : contractRate - comparableRate
  const irdRateApplied = Math.max(0, irdRateRaw)

  const threeMonthRate = lender.threeMonthRateSource === 'posted' ? postedRate : contractRate

  const irdPenalty = principal * (irdRateApplied / 100) * (monthsRemaining / 12)
  const threeMonthPenalty = principal * (threeMonthRate / 100) * 0.25
  const totalPenalty = Math.max(irdPenalty, threeMonthPenalty)

  return {
    irdPenalty,
    threeMonthPenalty,
    totalPenalty,
    irdRateRaw,
    irdRateApplied,
    discount,
    methodLabel: methodLabelFor(lender.irdMethod),
    breakdown: {
      principal,
      monthsRemaining,
      contractRate,
      postedRate: lender.irdMethod === 'discounted' ? postedRate : undefined,
      comparableRate,
      threeMonthRate,
    },
  }
}

export function calculateVariable(_lender: Lender, inputs: VariableInputs): PenaltyResult {
  const { principal, monthsRemaining, contractRate } = inputs

  const irdPenalty = 0
  const threeMonthPenalty = principal * (contractRate / 100) * 0.25
  const totalPenalty = threeMonthPenalty

  return {
    irdPenalty,
    threeMonthPenalty,
    totalPenalty,
    irdRateRaw: 0,
    irdRateApplied: 0,
    discount: 0,
    methodLabel: '3-month interest only',
    breakdown: {
      principal,
      monthsRemaining,
      contractRate,
      comparableRate: 0,
      threeMonthRate: contractRate,
    },
  }
}

export function calculateAdjustable(_lender: Lender, inputs: AdjustableInputs): PenaltyResult {
  const { principal, monthsRemaining, primeRate, primeAdjustment } = inputs

  const effectiveRate = primeRate + primeAdjustment
  const irdPenalty = 0
  const threeMonthPenalty = principal * (effectiveRate / 100) * 0.25
  const totalPenalty = threeMonthPenalty

  return {
    irdPenalty,
    threeMonthPenalty,
    totalPenalty,
    irdRateRaw: 0,
    irdRateApplied: 0,
    discount: 0,
    methodLabel: '3-month interest only',
    breakdown: {
      principal,
      monthsRemaining,
      contractRate: effectiveRate,
      comparableRate: 0,
      threeMonthRate: effectiveRate,
    },
  }
}

/**
 * Unified penalty input — everything a caller needs to get a penalty figure
 * knowing only a lender slug and the rate type. Rate-specific fields are
 * optional and only read for the relevant `rateType`.
 */
export interface PenaltyInput {
  /** Lender slug from lib/lenders.ts. Drives the methodology. */
  lenderSlug: string
  rateType: 'fixed' | 'variable' | 'adjustable'
  /** Outstanding balance being broken. */
  balance: number
  /** Months left on the current term. */
  monthsRemaining: number
  /** The rate the client actually pays (annual %). */
  contractRate: number
  /** Lender's posted rate at funding (annual %). Only used for fixed discounted IRD. */
  postedRate?: number
  /** Lender's posted comparable rate today (annual %). Used for fixed IRD. */
  comparableRate?: number
  /** Prime rate (annual %). Only used for adjustable. */
  primeRate?: number
  /** Signed prime adjustment (annual %). Negative for "prime − x". Adjustable only. */
  primeAdjustment?: number
}

/**
 * The contract every penalty calculator implements: rate-type-aware, lender-driven,
 * returns the full breakdown. Variable/adjustable return three-month interest only;
 * fixed returns the greater of three-month interest or IRD.
 */
export type PenaltyEngine = (input: PenaltyInput) => PenaltyResult

/**
 * Single entry point matching the `PenaltyEngine` contract. Resolves the lender by
 * slug (falling back to the "Other" catch-all), then dispatches to the right
 * per-type function. This is what the refinance analyzer calls so it never
 * re-implements penalty math.
 */
export const calculatePenalty: PenaltyEngine = (input) => {
  const lender =
    getLenderBySlug(input.lenderSlug) ?? getLenderBySlug('other')
  // getLenderBySlug('other') is always defined (active catch-all), but guard anyway.
  if (!lender) {
    throw new Error(`Unknown lender slug "${input.lenderSlug}" and no fallback available.`)
  }

  if (input.rateType === 'variable') {
    return calculateVariable(lender, {
      principal: input.balance,
      monthsRemaining: input.monthsRemaining,
      contractRate: input.contractRate,
    })
  }

  if (input.rateType === 'adjustable') {
    return calculateAdjustable(lender, {
      principal: input.balance,
      monthsRemaining: input.monthsRemaining,
      primeRate: input.primeRate ?? 0,
      primeAdjustment: input.primeAdjustment ?? 0,
    })
  }

  return calculateFixed(lender, {
    principal: input.balance,
    monthsRemaining: input.monthsRemaining,
    contractRate: input.contractRate,
    postedRate: input.postedRate ?? 0,
    comparableRate: input.comparableRate ?? 0,
  })
}
