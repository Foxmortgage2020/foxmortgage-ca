// Purchase math: federal down payment minimums, the CMHC premium table, the insured
// mortgage, and the closing cost roll-up. Owner-occupied 1 to 4 units.
//
// All payment and amortization math is reused from lib/mortgage-engine.ts (semi-annual
// compounding for fixed rates). Nothing here re-implements compounding or payment math.

import {
  buildSchedule,
  paymentBreakdown,
  type Frequency,
  type MortgageInput,
} from './mortgage-engine';

import {
  computeLandTransfer,
  pstRateOnInsurance,
  sumAncillary,
  type Ancillary,
  type Location,
  type LttResult,
} from './land-transfer-engine';

// 5% on the first $500k, 10% on $500k to $1.5M, 20% at $1.5M and up (uninsurable above $1.5M).
export function minimumDownPayment(price: number): number {
  if (price <= 500000) return price * 0.05;
  if (price <= 1500000) return 25000 + (price - 500000) * 0.10;
  return price * 0.20;
}

// CMHC premium rate as a fraction of the loan before premium.
// 0 when LTV <= 80%. +0.20% when amortization > 25 yrs on an insured mortgage.
export function cmhcPremiumRate(ltv: number, amortYears: number): number {
  let rate: number;
  if (ltv <= 0.80) rate = 0;
  else if (ltv <= 0.85) rate = 0.028;
  else if (ltv <= 0.90) rate = 0.031;
  else if (ltv <= 0.95) rate = 0.040;
  else rate = NaN; // below 5% down is not permitted
  if (rate > 0 && amortYears > 25) rate += 0.002;
  return rate;
}

export interface PurchaseInput {
  price: number;
  downPayment: number;
  location: Location;
  rate: number;            // annual nominal percent, e.g. 6.29
  amortYears: number;
  amortMonths: number;     // extra months on top of amortYears
  termYears: number;       // e.g. 5
  frequency: Frequency;    // same options as the mortgage calculator
  paymentIncrease: number; // pay-faster: extra dollars per scheduled payment (0 if off)
  ftb: boolean;
  newBuild: boolean;
  // home expenses (monthly)
  propertyTaxMonthly: number;
  condoMonthly: number;
  heatMonthly: number;
  otherMonthly: number;
  rentalIncomeMonthly: number;
  applyRental: boolean;
  ancillary: Ancillary;
}

export interface PurchaseResult {
  minimumDown: number;
  downPercent: number;        // downPayment / price
  loanBeforePremium: number;  // price - downPayment
  ltv: number;                // loanBeforePremium / price
  insured: boolean;
  premiumRate: number;
  premium: number;
  insuredMortgage: number;    // principal that gets amortized
  payment: number;            // per period at the chosen frequency
  interestOverTerm: number;
  principalOverTerm: number;
  balanceEndOfTerm: number;
  totalMonthlyCost: number;   // payment-as-monthly + expenses, less rental if applied
  landTransfer: LttResult;
  pstOnPremium: number;
  ancillaryTotal: number;
  totalEstimatedCost: number; // landTransfer.total + pstOnPremium + ancillaryTotal
  warnings: string[];
}

export function computePurchase(input: PurchaseInput): PurchaseResult {
  const { price, downPayment, location, rate, amortYears, amortMonths, termYears, frequency, ftb, newBuild } = input;
  const warnings: string[] = [];

  const minimumDown = minimumDownPayment(price);
  const loanBeforePremium = Math.max(0, price - downPayment);
  const ltv = price > 0 ? loanBeforePremium / price : 0;
  const downPercent = price > 0 ? downPayment / price : 0;

  let insured = ltv > 0.80;
  let premiumRate = insured ? cmhcPremiumRate(ltv, amortYears) : 0;
  let premium = insured && isFinite(premiumRate) ? loanBeforePremium * premiumRate : 0;
  // Sub-5% down gives a NaN rate by spec (not permitted). The premium is already
  // guarded to 0 above; normalize the rate too so it never leaks NaN to a caller
  // or the UI. The "below the minimum" warning explains the invalid input.
  if (!isFinite(premiumRate)) premiumRate = 0;
  let insuredMortgage = loanBeforePremium + premium;

  if (downPayment < minimumDown) {
    warnings.push('Down payment is below the minimum for this price.');
  }
  if (price > 1500000 && ltv > 0.80) {
    warnings.push('Homes over $1.5M are not eligible for mortgage insurance. A 20% down payment is required.');
    insured = false;
    premiumRate = 0;
    premium = 0;
    insuredMortgage = loanBeforePremium;
  }
  if (insured && amortYears > 25 && !(ftb || newBuild)) {
    warnings.push('A 30-year amortization on an insured mortgage requires a first-time buyer or a newly built home.');
  }

  // Reuse the mortgage engine: insuredMortgage is the principal that gets amortized.
  // This mirrors the mortgage calculator's code path exactly.
  const mortgageInput: MortgageInput = {
    amount: insuredMortgage,
    ratePct: rate,
    compounding: 'semi-annually',
    termYears,
    amortMonths: amortYears * 12 + amortMonths,
    frequency,
    loanType: 'regular',
    payIncPct: 0,
    payIncAmt: input.paymentIncrease,
    oneTimePrepay: 0,
    annualPrepay: 0,
  };
  const schedule = buildSchedule(mortgageInput);
  const perYear = schedule.perYear;
  const termPeriods = Math.round(termYears * perYear);
  const termBreakdown = paymentBreakdown(mortgageInput, schedule, 'term');
  const interestOverTerm = termBreakdown.interest;
  const principalOverTerm = termBreakdown.basePrincipal + termBreakdown.extraPrincipal;
  const balanceEndOfTerm =
    schedule.rows.length === 0
      ? 0
      : schedule.rows[Math.min(termPeriods, schedule.rows.length) - 1]?.balance ?? 0;
  const payment = schedule.payment;

  // The payment shown is per period; the monthly cost line uses the monthly-equivalent.
  const monthlyEquivalent = perYear > 0 ? (payment * perYear) / 12 : payment;
  const expenses = input.propertyTaxMonthly + input.condoMonthly + input.heatMonthly + input.otherMonthly;
  const totalMonthlyCost = monthlyEquivalent + expenses - (input.applyRental ? input.rentalIncomeMonthly : 0);

  const landTransfer = computeLandTransfer(location, price, insuredMortgage, ftb, newBuild);
  const pstOnPremium = insured ? premium * pstRateOnInsurance(location) : 0;
  const ancillaryTotal = sumAncillary(input.ancillary);
  const totalEstimatedCost = landTransfer.total + pstOnPremium + ancillaryTotal;

  return {
    minimumDown,
    downPercent,
    loanBeforePremium,
    ltv,
    insured,
    premiumRate,
    premium,
    insuredMortgage,
    payment,
    interestOverTerm,
    principalOverTerm,
    balanceEndOfTerm,
    totalMonthlyCost,
    landTransfer,
    pstOnPremium,
    ancillaryTotal,
    totalEstimatedCost,
    warnings,
  };
}
