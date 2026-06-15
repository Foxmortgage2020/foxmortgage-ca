// Current-situation math for Renewal Compare. The renewal options run through the mortgage
// engine exactly like Purchase Compare's options; only this block is new.

import { buildSchedule, type MortgageInput } from './mortgage-engine';

// Count of remaining monthly payments from the next payment date through maturity, inclusive.
// July 14 2026 through December 14 2027 is 18 payments. Assumes a monthly schedule, which is
// the validated path; for other frequencies, count that frequency's periods over the same span.
export function remainingTermMonths(nextPayment: Date, maturity: Date): number {
  return (maturity.getFullYear() - nextPayment.getFullYear()) * 12
       + (maturity.getMonth() - nextPayment.getMonth()) + 1;
}

// Amortization left at maturity = current remaining amortization minus the remaining term.
export function endOfTermAmortMonths(remainingAmortMonths: number, remTermMonths: number): number {
  return Math.max(0, remainingAmortMonths - remTermMonths);
}

// Balance at maturity. Re-derive the contractual payment from the outstanding balance, the
// current rate, and the remaining amortization, then amortize forward over the remaining term.
// This runs the mortgage engine's schedule (same payment + rate + amortization the rest of the
// suite uses) and reads the balance after the remaining term, so no schedule math is
// re-implemented here.
export function balanceAtMaturity(
  outstandingBalance: number,
  currentRate: number,
  remainingAmortMonths: number,
  remTermMonths: number
): number {
  if (outstandingBalance <= 0 || remTermMonths <= 0) return Math.max(0, outstandingBalance);
  const input: MortgageInput = {
    amount: outstandingBalance,
    ratePct: currentRate,
    compounding: 'semi-annually',
    termYears: remTermMonths / 12,
    amortMonths: remainingAmortMonths,
    frequency: 'monthly',
    loanType: 'regular',
    payIncPct: 0,
    payIncAmt: 0,
    oneTimePrepay: 0,
    annualPrepay: 0,
  };
  const schedule = buildSchedule(input);
  const idx = Math.min(remTermMonths, schedule.rows.length) - 1;
  return idx >= 0 ? schedule.rows[idx].balance : outstandingBalance;
}
