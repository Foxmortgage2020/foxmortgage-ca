// Pure math + status helpers for investor positions.
//
// No React, no Next.js, no Zoho client dependencies — just typed functions
// that take a normalized investment record and return derived values. The
// `fromZohoDeal` helper at the bottom adapts raw Zoho records to this shape
// so the page-level code never has to spell out field names twice.
//
// Two rules this library enforces:
//
//   1. Investor_Payout_Date is the source of truth for "is this mortgage
//      still earning?" — not the Investor_Status string. A real payout
//      date in the past means paid out, regardless of whether Mike
//      remembered to set Investor_Status = 'Paid Out' in Zoho.
//
//   2. Partial periods earn per diem interest, not a full monthly
//      payment. Per diem rule: investorAmount × (investorRate / 100 / 365)
//      per day. Applied to partial first periods (if firstPaymentDate
//      is < 28 days after closingDate) and partial final periods (if
//      payout date falls between scheduled payment dates).
//
// firstPaymentDate is required for accurate earnings calculations. If
// it isn't set on a Zoho record, monthsActive / interestEarned /
// isActiveInMonth all return 0 — better to show nothing than to guess
// from closingDate and overcount.

const DAY_MS = 24 * 60 * 60 * 1000
// Average month length. Used to convert (end - start) days into a
// completed-full-month count for monthsActive. Partial-period dollars
// come from per diem, not from this approximation.
const AVG_MONTH_DAYS = 30.4375
// Per diem convention: annual rate divided by 365 days, simple interest.
const DAYS_PER_YEAR = 365
// A first period shorter than this many days is considered "partial" and
// gets per diem instead of a full paymentAmount. 28 covers short Februaries
// so we don't quibble over Feb-vs-Mar day-count differences.
const FULL_FIRST_PERIOD_DAYS = 28

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

// The anchor for everything payment-related is firstPaymentDate — the date
// the investor first received a monthly payment. We do NOT fall back to
// closingDate (the funding date) because the investor doesn't start
// earning a monthly payment until firstPaymentDate; treating closingDate
// as the start fabricates an early payment that didn't happen. If
// firstPaymentDate is null, the lib's earnings functions return 0.
function firstPaymentAnchor(input: InvestmentInput): Date | null {
  return parseDate(input.firstPaymentDate)
}

/**
 * Per diem dollar amount: investorAmount × (investorRate / 100 / 365).
 * Used as the building block for any partial-period interest.
 */
export function dailyInterestAmount(input: InvestmentInput): number {
  return (input.investorAmount * (input.investorRate / 100)) / DAYS_PER_YEAR
}

/**
 * Per diem interest for a specific number of days. Negative or zero day
 * counts return 0.
 */
export function perDiemInterest(input: InvestmentInput, days: number): number {
  return dailyInterestAmount(input) * Math.max(0, days)
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
 * Is this investment currently generating monthly income for the investor?
 *
 * Returns true for both 'performing' (normal active) and 'renewal'
 * (renewal in progress — the client keeps paying monthly while terms
 * are negotiated, so the investor's income stream doesn't pause).
 * Returns false for 'paid_out' and 'matured'.
 *
 * Use this for financial filters: Active Capital totals, Monthly Income
 * sums, cash flow projections. Use deriveStatus directly when you need
 * to distinguish performing from renewal visually (status badges,
 * "What Happens Next" copy).
 */
export function isIncomeActive(input: InvestmentInput, asOf: Date = new Date()): boolean {
  const status = deriveStatus(input, asOf)
  return status === 'performing' || status === 'renewal'
}

/**
 * Number of full monthly payments received to date — NOT counting any
 * partial final period (those dollars come from finalPeriodInterest).
 *
 * Counting rule: the first payment counts as 1 on firstPaymentDate, then
 * one additional payment per ~30.4-day period elapsed. Anchored on
 * firstPaymentDate; returns 0 if that date isn't set.
 *
 * Worked example (Nick Hishon, BRXM-F025315):
 *   firstPaymentDate = 2025-02-15, payoutDate = 2025-02-26 (11 days)
 *   floor(11 / 30.4375) + 1 = 0 + 1 = 1 full monthly payment
 *   Plus a partial Feb 15-26 period → finalPeriodInterest = $506.30
 *   Total interestEarned: 1 × $1,400 + $506.30 = $1,906.30
 *
 * For paid-out positions we clamp end to the payout date. For matured
 * positions we clamp to maturity. For performing positions we clamp to
 * `asOf` (defaults to now).
 */
export function monthsActive(input: InvestmentInput, asOf: Date = new Date()): number {
  const start = firstPaymentAnchor(input)
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

/**
 * Interest from a partial final period for a paid-out investment.
 *
 * If the position is paid out and the payout date falls between scheduled
 * monthly payment anniversaries, the investor received per diem interest
 * for the days from the most recent scheduled payment to the payout date.
 *
 * Returns 0 for active / matured / renewal positions, for paid-out
 * positions without a payoutDate (legacy data), or when the payout date
 * lands exactly on a payment anniversary (no partial period).
 *
 * Worked example (Nick):
 *   firstPaymentDate = 2025-02-15, payoutDate = 2025-02-26
 *   last anniversary <= payout: Feb 15 (next would be Mar 15)
 *   days = 11 → per diem 11 × ($120,000 × 0.14 / 365) = $506.30
 */
export function finalPeriodInterest(input: InvestmentInput, asOf: Date = new Date()): number {
  if (deriveStatus(input, asOf) !== 'paid_out') return 0
  const payout = parseDate(input.investorPayoutDate)
  if (!payout) return 0
  const anchor = firstPaymentAnchor(input)
  if (!anchor || payout.getTime() < anchor.getTime()) return 0
  const cursor = new Date(anchor.getTime())
  while (true) {
    const next = new Date(cursor.getTime())
    next.setMonth(next.getMonth() + 1)
    if (next.getTime() > payout.getTime()) break
    cursor.setTime(next.getTime())
  }
  const days = Math.round((payout.getTime() - cursor.getTime()) / DAY_MS)
  if (days <= 0) return 0
  return perDiemInterest(input, days)
}

/**
 * Adjustment applied when the first period (closingDate → firstPaymentDate)
 * is shorter than a full month. Returns the CORRECTION compared to the
 * default of using paymentAmount for the first month:
 *   perDiemInterest(actualDays) - paymentAmount  (typically negative)
 *
 * Returns 0 for clean full first periods (>= 28 days between funding and
 * first payment) or when either date is missing.
 *
 * NOTE: this adjustment is folded into `interestEarned` but is NOT
 * reflected by `interestForMonth` — the monthly table treats every
 * active month as a full paymentAmount plus per-diem in the payout
 * month. Real portfolios have clean monthly cadence; if a position
 * with a partial first period ever appears, sums of interestForMonth
 * will exceed interestEarned by paymentAmount - perDiem(actualDays).
 */
export function firstPeriodAdjustment(input: InvestmentInput): number {
  const anchor = firstPaymentAnchor(input)
  const closing = parseDate(input.closingDate)
  if (!anchor || !closing) return 0
  if (closing.getTime() >= anchor.getTime()) return 0
  const actualDays = Math.round((anchor.getTime() - closing.getTime()) / DAY_MS)
  if (actualDays >= FULL_FIRST_PERIOD_DAYS) return 0
  return perDiemInterest(input, actualDays) - input.paymentAmount
}

/**
 * Total interest received to date.
 *   base       = (full monthly payments × paymentAmount)
 *   final      = per diem for partial final period (paid-out only)
 *   firstAdj   = correction for partial first period (usually 0)
 *
 * Nick: 1 × $1,400 + $506.30 + 0 = $1,906.30
 */
export function interestEarned(input: InvestmentInput, asOf: Date = new Date()): number {
  const base = monthsActive(input, asOf) * input.paymentAmount
  const final = finalPeriodInterest(input, asOf)
  const firstAdj = firstPeriodAdjustment(input)
  return base + final + firstAdj
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
  // Both performing and renewal positions have scheduled monthly payments.
  // Renewal in particular continues paying during negotiation, so the
  // Upcoming Schedule should keep ticking.
  if (!isIncomeActive(input, asOf)) return null
  const start = firstPaymentAnchor(input)
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

/**
 * Point-in-time: was this investment active and earning during the
 * specified calendar month?
 *
 * "Active in month" means at least one payment (full or per diem)
 * landed in this month. Anchored on firstPaymentDate — the month a
 * payment was first received, not the funding month.
 *
 * Active for month [year, monthIndex] iff:
 *   - firstPaymentDate is set, AND
 *   - firstPaymentDate is on or before the last day of the month, AND
 *   - the position had not yet been paid out by the first day of the
 *     month — i.e. investorPayoutDate (if any) falls in this month or
 *     later. The payout MONTH still counts as active (Nick's Feb 26
 *     2025 payout still earns a Feb payment plus per diem), but
 *     every month after the payout is not.
 *
 * Verification using Nick (BRXM-F025315):
 *   firstPaymentDate 2025-02-15, payoutDate 2025-02-26
 *   isActiveInMonth(2025, 0)  → false (Jan 2025 — no payment received)
 *   isActiveInMonth(2025, 1)  → true  (Feb 2025 — full payment + per diem)
 *   isActiveInMonth(2025, 2)  → false (Mar 2025 — after payout)
 *   isActiveInMonth(2026, 0)  → false (long after payout)
 */
export function isActiveInMonth(
  input: InvestmentInput,
  year: number,
  monthIndex: number,
): boolean {
  const start = firstPaymentAnchor(input)
  if (!start) return false
  const firstOfMonth = new Date(year, monthIndex, 1)
  const lastOfMonth = new Date(year, monthIndex + 1, 0)
  if (start.getTime() > lastOfMonth.getTime()) return false

  const payout = parseDate(input.investorPayoutDate)
  if (payout && payout.getTime() < firstOfMonth.getTime()) return false

  // Legacy data path: payoutDate not set but Investor_Status was flipped
  // to 'Paid Out' manually. Treat the maturity month as the last active
  // month in that case (best we can do without a real payout date).
  if (!payout && input.investorStatus === 'Paid Out') {
    const maturity = parseDate(input.maturityDate)
    if (maturity && maturity.getTime() < firstOfMonth.getTime()) return false
  }

  return true
}

/**
 * Interest earned by this investment in the specified calendar month.
 *   - Inactive month → 0
 *   - Regular active month → input.paymentAmount
 *   - Payout month → input.paymentAmount + per diem for the days
 *     between the last regular payment anniversary and the payout date
 *
 * Verification using Nick (firstPaymentDate Feb 15 2025, payout Feb 26 2025):
 *   interestForMonth(2025, 0) → 0       (Jan — no payment received)
 *   interestForMonth(2025, 1) → 1906.30 (Feb — full $1,400 + 11-day per diem)
 *   interestForMonth(2025, 2) → 0       (Mar — after payout)
 *   sum across all months → $1,906.30   (matches interestEarned)
 *
 * Caveat: this function does NOT apply firstPeriodAdjustment for
 * positions with partial first periods (closingDate → firstPaymentDate
 * shorter than 28 days). interestEarned does. Mike's portfolio has
 * clean monthly cadence so the two reconcile in practice.
 */
export function interestForMonth(
  input: InvestmentInput,
  year: number,
  monthIndex: number,
): number {
  if (!isActiveInMonth(input, year, monthIndex)) return 0
  let amount = input.paymentAmount

  // Payout month: add per diem for the partial final period.
  const payout = parseDate(input.investorPayoutDate)
  if (payout && payout.getFullYear() === year && payout.getMonth() === monthIndex) {
    const anchor = firstPaymentAnchor(input)
    if (anchor && payout.getTime() >= anchor.getTime()) {
      const cursor = new Date(anchor.getTime())
      while (true) {
        const next = new Date(cursor.getTime())
        next.setMonth(next.getMonth() + 1)
        if (next.getTime() > payout.getTime()) break
        cursor.setTime(next.getTime())
      }
      const days = Math.round((payout.getTime() - cursor.getTime()) / DAY_MS)
      if (days > 0) amount += perDiemInterest(input, days)
    }
  }
  return amount
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
