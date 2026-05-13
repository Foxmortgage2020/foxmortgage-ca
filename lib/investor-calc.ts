// Pure math + status helpers for investor positions.
//
// No React, no Next.js, no Zoho client dependencies — just typed functions
// that take a normalized investment record and return derived values. The
// `fromZohoDeal` helper at the bottom adapts raw Zoho records to this shape
// so the page-level code never has to spell out field names twice.
//
// The core rule this library enforces (and which the previous inline math
// did not): Investor_Payout_Date is the source of truth for "is this
// mortgage still earning?" — not the Investor_Status string. A real
// payout date in the past means paid out, regardless of whether Mike
// remembered to set Investor_Status = 'Paid Out' in Zoho.

const DAY_MS = 24 * 60 * 60 * 1000
// Average month length. Used to convert (end - start) days into a
// payment-count approximation. The investment ledger lives in Mike's
// head right now; once we have one, this estimate gets replaced.
const AVG_MONTH_DAYS = 30.4375

export type InvestmentInput = {
  closingDate: string | null
  firstPaymentDate: string | null
  maturityDate: string | null
  investorPayoutDate: string | null
  investorAmount: number
  investorRate: number
  paymentAmount: number
  lenderFee: number
  investorStatus: string | null
  dealStatusInvestor: string | null
  renewalInProgress: boolean
}

export type InvestmentStatus =
  | 'performing'   // Active, receiving payments
  | 'paid_out'     // Fully paid out, no longer earning
  | 'renewal'      // Renewal in progress (still earning on original terms)
  | 'matured'      // Reached maturity, not yet renewed/paid

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function paymentStart(input: InvestmentInput): Date | null {
  return parseDate(input.firstPaymentDate) ?? parseDate(input.closingDate)
}

/**
 * Status priority (first match wins):
 *   1. Investor_Payout_Date set AND in the past → paid_out (real signal)
 *   2. Renewal_In_Progress flag → renewal
 *   3. Investor_Status === 'Matured' OR Deal_Status_Investor === 'Matured' → matured
 *   4. Investor_Status === 'Paid Out' (legacy string-only data) → paid_out
 *   5. Otherwise → performing
 */
export function deriveStatus(input: InvestmentInput, asOf: Date = new Date()): InvestmentStatus {
  const payout = parseDate(input.investorPayoutDate)
  if (payout && payout.getTime() <= asOf.getTime()) return 'paid_out'
  if (input.renewalInProgress) return 'renewal'
  if (input.investorStatus === 'Matured' || input.dealStatusInvestor === 'Matured') return 'matured'
  if (input.investorStatus === 'Paid Out') return 'paid_out'
  return 'performing'
}

/**
 * Approximate the number of monthly payments received to date.
 *
 * Counting rule: the first payment counts as 1 on or after firstPaymentDate,
 * then one additional payment per ~30.4-day period elapsed.
 *
 * Worked example (Nick Hishon, BRXM-F025315):
 *   firstPaymentDate = 2025-01-07, payoutDate = 2025-02-26 (50 days)
 *   floor(50 / 30.4375) + 1 = 1 + 1 = 2 payments
 *   2 × $1,400 = $2,800 — matches what Nick actually received.
 *
 * For paid-out positions we clamp end to the payout date. For matured
 * positions we clamp to maturity. For performing positions we clamp to
 * `asOf` (defaults to now). Returns 0 if there is no payment-start date
 * or if asOf is before the first payment.
 */
export function monthsActive(input: InvestmentInput, asOf: Date = new Date()): number {
  const start = paymentStart(input)
  if (!start) return 0
  const status = deriveStatus(input, asOf)
  let end: Date
  if (status === 'paid_out') {
    end = parseDate(input.investorPayoutDate) ?? parseDate(input.maturityDate) ?? asOf
  } else if (status === 'matured') {
    end = parseDate(input.maturityDate) ?? asOf
  } else {
    end = asOf
  }
  if (end.getTime() < start.getTime()) return 0
  const days = (end.getTime() - start.getTime()) / DAY_MS
  return Math.floor(days / AVG_MONTH_DAYS) + 1
}

export function interestEarned(input: InvestmentInput, asOf: Date = new Date()): number {
  return monthsActive(input, asOf) * input.paymentAmount
}

export function totalReturn(input: InvestmentInput, asOf: Date = new Date()): number {
  return interestEarned(input, asOf) + input.lenderFee
}

/**
 * Next monthly payment date and amount. Returns null for any status other
 * than performing — paid out / matured / renewal positions do not have
 * a "next payment" in the upcoming-schedule sense.
 *
 * Walks anniversaries of firstPaymentDate forward by one calendar month at
 * a time until the cursor passes asOf. Calendar-month arithmetic (not
 * 30.4-day arithmetic) is the right tool here — the user-facing schedule
 * should land on the same day-of-month each period.
 */
export function nextPayment(
  input: InvestmentInput,
  asOf: Date = new Date(),
): { date: string; amount: number } | null {
  if (deriveStatus(input, asOf) !== 'performing') return null
  const start = paymentStart(input)
  if (!start) return null
  const cursor = new Date(start.getTime())
  while (cursor.getTime() <= asOf.getTime()) {
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return { date: cursor.toISOString(), amount: input.paymentAmount }
}

export type TermDisplay = {
  type: 'paid_out' | 'maturity' | 'unknown'
  date: string | null
}

/**
 * What the "Term / Maturity" tile should show.
 * - paid_out: { type: 'paid_out', date: payoutDate }
 * - everything else: { type: 'maturity', date: maturityDate }
 */
export function termDisplay(input: InvestmentInput, asOf: Date = new Date()): TermDisplay {
  const status = deriveStatus(input, asOf)
  if (status === 'paid_out') {
    return { type: 'paid_out', date: input.investorPayoutDate ?? input.maturityDate ?? null }
  }
  if (input.maturityDate) return { type: 'maturity', date: input.maturityDate }
  return { type: 'unknown', date: null }
}

export type StatusBadgeDescriptor = {
  label: string
  color: string  // Tailwind classes: background + text
  dot: string    // Tailwind class for the small leading dot
}

// Light-background variant (for white card chrome).
export function statusBadge(status: InvestmentStatus): StatusBadgeDescriptor {
  switch (status) {
    case 'paid_out':
      return { label: 'Paid Out', color: 'bg-gray-100 text-gray-500', dot: 'bg-gray-400' }
    case 'renewal':
      return { label: 'Renewal in Progress', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' }
    case 'matured':
      return { label: 'Matured', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' }
    case 'performing':
    default:
      return { label: 'Performing', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' }
  }
}

// Dark-background variant (for the navy Investment Snapshot card).
export function statusBadgeDark(status: InvestmentStatus): StatusBadgeDescriptor {
  switch (status) {
    case 'paid_out':
      return { label: 'Paid Out', color: 'bg-gray-600 text-gray-200', dot: 'bg-gray-300' }
    case 'renewal':
      return { label: 'Renewal in Progress', color: 'bg-amber-500/20 text-amber-300', dot: 'bg-amber-400' }
    case 'matured':
      return { label: 'Matured', color: 'bg-blue-500/20 text-blue-300', dot: 'bg-blue-400' }
    case 'performing':
    default:
      return { label: 'Performing', color: 'bg-lime/20 text-lime', dot: 'bg-lime' }
  }
}

/**
 * Adapter: raw Zoho `Deals` (or `Potentials`) record → normalized
 * InvestmentInput. Lives here so the page-level code references field
 * names exactly once. paymentAmount falls back to the rate-derived
 * monthly figure when Payment_Amount isn't populated on the record.
 */
export function fromZohoDeal(deal: any): InvestmentInput {
  const investorAmount = Number(deal.Investor_Amount) || 0
  const investorRate = Number(deal.Investor_Rate) || 0
  const paymentAmount = Number(deal.Payment_Amount) || (investorAmount * investorRate) / 100 / 12
  return {
    closingDate: deal.Closing_Date ?? null,
    firstPaymentDate: deal.First_Payment_Date ?? null,
    maturityDate: deal.Maturity_Date ?? null,
    investorPayoutDate: deal.Investor_Payout_Date ?? null,
    investorAmount,
    investorRate,
    paymentAmount,
    lenderFee: Number(deal.Lender_Fee) || 0,
    investorStatus: deal.Investor_Status ?? null,
    dealStatusInvestor: deal.Deal_Status_Investor ?? null,
    renewalInProgress: deal.Renewal_In_Progress === true,
  }
}
