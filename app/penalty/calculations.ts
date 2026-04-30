import type { Lender } from '@/lib/lenders'

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
