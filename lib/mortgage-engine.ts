// lib/mortgage-engine.ts
// Mortgage payment + amortization engine for the Fox Mortgage Calculator.
// Shares the Canadian compounding convention with lib/refinance-engine.ts.
// Validated to the cent against the reference app (see brief reference values).
//
// NOTE: refinance-engine already exports a 2-value `Compounding` and a private
// `periodicRate`. To share one validated compounding core without touching them,
// the generalized helpers live there under distinct names and are imported here
// aliased to the names this engine uses.
import { CompoundingFreq as Compounding, periodicRateForFrequency as periodicRate } from "./refinance-engine";
export type { Compounding };
export type Frequency =
  | "monthly"
  | "semi-monthly"
  | "bi-weekly"
  | "acc-bi-weekly"
  | "weekly"
  | "acc-weekly";
export type LoanType = "regular" | "interest-only";
export const FREQUENCY: Record<Frequency, { perYear: number; label: string }> = {
  "monthly": { perYear: 12, label: "Monthly" },
  "semi-monthly": { perYear: 24, label: "Semi-Monthly" },
  "bi-weekly": { perYear: 26, label: "Bi-Weekly" },
  "acc-bi-weekly": { perYear: 26, label: "Accelerated Bi-Weekly" },
  "weekly": { perYear: 52, label: "Weekly" },
  "acc-weekly": { perYear: 52, label: "Accelerated Weekly" },
};
/** Base monthly payment that amortizes `principal` over `amortMonths`. */
export function monthlyPayment(
  principal: number,
  annualRatePct: number,
  compounding: Compounding,
  amortMonths: number
): number {
  const i = periodicRate(annualRatePct, compounding, 12);
  if (i === 0) return principal / amortMonths;
  return (principal * i) / (1 - Math.pow(1 + i, -amortMonths));
}
/**
 * Periodic payment for the chosen frequency.
 * Accelerated frequencies use the monthly payment split, paying more per year:
 *   accelerated bi-weekly = monthlyPayment / 2 (26 per year, 13 monthly equivalents)
 *   accelerated weekly    = monthlyPayment / 4 (52 per year, 13 monthly equivalents)
 * Semi-monthly = monthlyPayment / 2 (24 per year, 12 monthly equivalents).
 * Non-accelerated bi-weekly and weekly amortize over (amortYears * perYear) periods.
 */
export function periodicPayment(
  principal: number,
  annualRatePct: number,
  compounding: Compounding,
  amortMonths: number,
  frequency: Frequency
): number {
  const mp = monthlyPayment(principal, annualRatePct, compounding, amortMonths);
  switch (frequency) {
    case "monthly":
      return mp;
    case "semi-monthly":
    case "acc-bi-weekly":
      return mp / 2;
    case "acc-weekly":
      return mp / 4;
    default: {
      const perYear = FREQUENCY[frequency].perYear;
      const i = periodicRate(annualRatePct, compounding, perYear);
      const n = (amortMonths / 12) * perYear;
      if (i === 0) return principal / n;
      return (principal * i) / (1 - Math.pow(1 + i, -n));
    }
  }
}
export interface MortgageInput {
  amount: number;
  ratePct: number;
  compounding: Compounding;
  termYears: number;
  amortMonths: number; // years * 12 + months
  frequency: Frequency;
  loanType: LoanType;
  payIncPct: number; // payment increase percent (0 if none)
  payIncAmt: number; // payment increase dollars (0 if none)
  oneTimePrepay: number; // lump applied at origination
  annualPrepay: number; // lump applied on each anniversary
}
export interface ScheduleRow {
  date: Date;
  interest: number;
  basePrincipal: number; // principal from the base scheduled payment
  extraPrincipal: number; // payment-increase extra plus any annual lump this period
  principal: number; // basePrincipal + extraPrincipal
  balance: number; // balance after this period
}
export interface Schedule {
  rows: ScheduleRow[];
  basePayment: number; // periodic payment with no increase
  payment: number; // periodic payment with increase applied
  perYear: number;
}
function startOfThisMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}
function dateForPeriod(start: Date, frequency: Frequency, k: number): Date {
  const d = new Date(start.getTime());
  switch (frequency) {
    case "monthly":
      d.setMonth(d.getMonth() + k);
      break;
    case "semi-monthly":
      d.setMonth(start.getMonth() + Math.floor(k / 2));
      d.setDate(k % 2 === 1 ? 15 : 1);
      break;
    case "bi-weekly":
    case "acc-bi-weekly":
      d.setDate(d.getDate() + k * 14);
      break;
    case "weekly":
    case "acc-weekly":
      d.setDate(d.getDate() + k * 7);
      break;
  }
  return d;
}
/** Period-by-period schedule with prepayments applied. First payment lands in the start month. */
export function buildSchedule(input: MortgageInput, startDate: Date = startOfThisMonth()): Schedule {
  const perYear = FREQUENCY[input.frequency].perYear;
  const i = periodicRate(input.ratePct, input.compounding, perYear);
  const basePayment = periodicPayment(
    input.amount,
    input.ratePct,
    input.compounding,
    input.amortMonths,
    input.frequency
  );
  const payment = basePayment * (1 + input.payIncPct / 100) + input.payIncAmt;
  const interestOnly = input.loanType === "interest-only";
  const rows: ScheduleRow[] = [];
  let balance = Math.max(0, input.amount - input.oneTimePrepay);
  if (interestOnly) {
    const totalPeriods = Math.round((input.amortMonths / 12) * perYear);
    for (let k = 0; k < totalPeriods; k++) {
      const interest = balance * i;
      rows.push({
        date: dateForPeriod(startDate, input.frequency, k),
        interest,
        basePrincipal: 0,
        extraPrincipal: 0,
        principal: 0,
        balance,
      });
    }
    return { rows, basePayment, payment: basePayment, perYear };
  }
  const guard = perYear * 60;
  let k = 0;
  while (balance > 0.005 && k < guard) {
    const interest = balance * i;
    let scheduled = payment - interest;
    if (scheduled > balance) scheduled = balance;
    let basePrincipal = basePayment - interest;
    if (basePrincipal < 0) basePrincipal = 0;
    if (basePrincipal > scheduled) basePrincipal = scheduled;
    const extraFromIncrease = scheduled - basePrincipal;
    balance -= scheduled;
    let lump = 0;
    if (input.annualPrepay > 0 && (k + 1) % perYear === 0 && balance > 0) {
      lump = Math.min(input.annualPrepay, balance);
      balance -= lump;
    }
    rows.push({
      date: dateForPeriod(startDate, input.frequency, k),
      interest,
      basePrincipal,
      extraPrincipal: extraFromIncrease + lump,
      principal: scheduled + lump,
      balance,
    });
    k++;
  }
  return { rows, basePayment, payment, perYear };
}
export interface YearRow {
  year: number;
  interest: number;
  principal: number;
  paid: number;
  endBalance: number;
  cumInterest: number;
  cumPrincipal: number;
  cumPaid: number;
}
/** Roll the schedule up into calendar years. The first year is partial from the start month. */
export function aggregateByYear(rows: ScheduleRow[], oneTimePrepay: number): YearRow[] {
  const map = new Map<number, YearRow>();
  const order: number[] = [];
  for (const r of rows) {
    const y = r.date.getFullYear();
    let row = map.get(y);
    if (!row) {
      row = {
        year: y,
        interest: 0,
        principal: 0,
        paid: 0,
        endBalance: r.balance,
        cumInterest: 0,
        cumPrincipal: 0,
        cumPaid: 0,
      };
      map.set(y, row);
      order.push(y);
    }
    row.interest += r.interest;
    row.principal += r.principal;
    row.paid += r.interest + r.principal;
    row.endBalance = r.balance;
  }
  const arr = order.map((y) => map.get(y) as YearRow);
  if (oneTimePrepay > 0 && arr.length) {
    arr[0].principal += oneTimePrepay;
    arr[0].paid += oneTimePrepay;
  }
  let ci = 0;
  let cp = 0;
  let cpaid = 0;
  for (const y of arr) {
    ci += y.interest;
    cp += y.principal;
    cpaid += y.paid;
    y.cumInterest = ci;
    y.cumPrincipal = cp;
    y.cumPaid = cpaid;
  }
  return arr;
}
export type BreakdownHorizon = "payment" | "term" | "total";
export interface Breakdown {
  basePrincipal: number;
  extraPrincipal: number;
  interest: number;
  total: number;
}
export function hasIncrease(input: MortgageInput): boolean {
  return input.payIncPct > 0 || input.payIncAmt > 0;
}
export function hasPrepayment(input: MortgageInput): boolean {
  return (
    input.loanType !== "interest-only" &&
    (input.payIncPct > 0 || input.payIncAmt > 0 || input.oneTimePrepay > 0 || input.annualPrepay > 0)
  );
}
/** Principal, extra, and interest split for a single payment, the term, or the full amortization. */
export function paymentBreakdown(
  input: MortgageInput,
  schedule: Schedule,
  horizon: BreakdownHorizon
): Breakdown {
  const perYear = schedule.perYear;
  if (horizon === "payment") {
    const r0 = schedule.rows[0];
    const extra = hasIncrease(input) ? schedule.payment - schedule.basePayment : 0;
    return {
      basePrincipal: r0 ? r0.basePrincipal : 0,
      extraPrincipal: extra,
      interest: r0 ? r0.interest : 0,
      total: schedule.payment,
    };
  }
  if (horizon === "term") {
    const termPeriods = Math.min(Math.round(input.termYears * perYear), schedule.rows.length);
    let interest = 0;
    let base = 0;
    let extra = 0;
    for (let z = 0; z < termPeriods; z++) {
      interest += schedule.rows[z].interest;
      base += schedule.rows[z].basePrincipal;
      extra += schedule.rows[z].extraPrincipal;
    }
    if (input.oneTimePrepay > 0) extra += input.oneTimePrepay;
    return { basePrincipal: base, extraPrincipal: extra, interest, total: base + extra + interest };
  }
  const interest = schedule.rows.reduce((a, r) => a + r.interest, 0);
  const totalPrincipal = input.loanType === "interest-only" ? 0 : input.amount;
  const extra = schedule.rows.reduce((a, r) => a + r.extraPrincipal, 0) + input.oneTimePrepay;
  return {
    basePrincipal: totalPrincipal - extra,
    extraPrincipal: extra,
    interest,
    total: totalPrincipal + interest,
  };
}
export interface TermTotals {
  payment: number;
  basePrincipal: number;
  extra: number;
  interest: number;
  endBalance: number;
  totalPaid: number;
}
function runTerm(
  input: MortgageInput,
  payment: number,
  oneTimePrepay: number,
  annualPrepay: number,
  termPeriods: number
): TermTotals {
  const perYear = FREQUENCY[input.frequency].perYear;
  const i = periodicRate(input.ratePct, input.compounding, perYear);
  const basePayment = periodicPayment(
    input.amount,
    input.ratePct,
    input.compounding,
    input.amortMonths,
    input.frequency
  );
  let balance = Math.max(0, input.amount - oneTimePrepay);
  let base = 0;
  let extra = 0;
  let interest = 0;
  for (let k = 0; k < termPeriods; k++) {
    const int = balance * i;
    let scheduled = payment - int;
    if (scheduled > balance) scheduled = balance;
    let baseP = basePayment - int;
    if (baseP < 0) baseP = 0;
    if (baseP > scheduled) baseP = scheduled;
    balance -= scheduled;
    let lump = 0;
    if (annualPrepay > 0 && (k + 1) % perYear === 0 && balance > 0) {
      lump = Math.min(annualPrepay, balance);
      balance -= lump;
    }
    base += baseP;
    extra += scheduled - baseP + lump;
    interest += int;
  }
  extra += oneTimePrepay;
  return {
    payment,
    basePrincipal: base,
    extra,
    interest,
    endBalance: balance,
    totalPaid: base + extra + interest,
  };
}
export interface PrepaymentComparison {
  regular: TermTotals;
  withPrepay: TermTotals;
  regularAmortMonths: number;
  prepayAmortMonths: number;
}
/** Regular vs with-prepayment over the term, plus effective amortization for each. */
export function comparePrepayment(input: MortgageInput): PrepaymentComparison {
  const perYear = FREQUENCY[input.frequency].perYear;
  const termPeriods = Math.round(input.termYears * perYear);
  const basePayment = periodicPayment(
    input.amount,
    input.ratePct,
    input.compounding,
    input.amortMonths,
    input.frequency
  );
  const payment = basePayment * (1 + input.payIncPct / 100) + input.payIncAmt;
  const regular = runTerm(input, basePayment, 0, 0, termPeriods);
  const withPrepay = runTerm(input, payment, input.oneTimePrepay, input.annualPrepay, termPeriods);
  const baseInput: MortgageInput = {
    ...input,
    payIncPct: 0,
    payIncAmt: 0,
    oneTimePrepay: 0,
    annualPrepay: 0,
  };
  const regSchedule = buildSchedule(baseInput);
  const preSchedule = buildSchedule(input);
  return {
    regular,
    withPrepay,
    regularAmortMonths: (regSchedule.rows.length / perYear) * 12,
    prepayAmortMonths: (preSchedule.rows.length / perYear) * 12,
  };
}
