// One GDS/TDS engine behind three tools: Debt Service, Maximum Mortgage, Required Income.
// The GDS and TDS ratios use the qualifying (stress) payment. The Monthly Mortgage and
// Cash Left figures shown in the breakdown use the contract-rate payment, which is what
// the borrower actually pays. Reconciled to the cent against CMA (see reference scenarios
// in the brief).

import { monthlyPayment, type Compounding as MortgageCompounding } from './mortgage-engine';

export type Compounding = 'semi-annual' | 'monthly';
export type StressMode = 'b20' | 'contract';
export type RentalRule = 'add-back' | 'offset';

const MQR_FLOOR = 5.25; // current OSFI / Department of Finance minimum qualifying rate floor

export interface AffordabilityInputs {
  contractRate: number;       // percent, e.g. 6.29
  amortMonths: number;        // e.g. 300
  compounding: Compounding;   // default 'semi-annual'
  stressMode: StressMode;     // default 'b20'
  monthlyDebt: number;
  propertyTaxMonthly: number;
  condoMonthly: number;
  heatMonthly: number;
  condoInclusionRate: number; // default 0.50
  gdsLimit: number;           // default 0.39
  tdsLimit: number;           // default 0.44
  rentalEnabled: boolean;     // default false
  rentalMonthly: number;
  rentalRule: RentalRule;     // default 'add-back'
  rentalPortion: number;      // default 0.50
}

// B20 stress test: greater of contract rate + 2% or the 5.25% floor.
// Contract mode (non-B20 / provincial / private lenders) qualifies at the contract rate.
export function stressRate(contractRate: number, mode: StressMode): number {
  return mode === 'contract' ? contractRate : Math.max(contractRate + 2, MQR_FLOOR);
}

// --- payment helpers; the monthly rate is reused from the mortgage engine's core ---
// The affordability tools are monthly-payment only, so the periodic rate is the monthly
// rate. We map the affordability compounding to the mortgage engine's compounding and
// reuse its monthlyPayment so the semi-annual conversion is never re-derived here.
function coreCompounding(comp: Compounding): MortgageCompounding {
  return comp === 'monthly' ? 'monthly' : 'semi-annually';
}
function pmt(principal: number, annualPct: number, n: number, comp: Compounding): number {
  return monthlyPayment(principal, annualPct, coreCompounding(comp), n);
}
function principalFor(pay: number, annualPct: number, n: number, comp: Compounding): number {
  // monthlyPayment(1, ...) is the payment per $1 of principal, so principal = pay / that.
  const perDollar = monthlyPayment(1, annualPct, coreCompounding(comp), n);
  return perDollar > 0 ? pay / perDollar : 0;
}

// GDS/TDS-included carrying cost from home expenses. Condo counts at the inclusion rate.
function homeExpenses(i: AffordabilityInputs): number {
  return i.propertyTaxMonthly + i.heatMonthly + i.condoMonthly * i.condoInclusionRate;
}

export interface Breakdown {
  stressRate: number;
  qualifyingPayment: number;  // at the stress rate
  contractPayment: number;    // at the contract rate, what they pay
  homeExpenses: number;
  debtPayments: number;
  gds: number;                // ratio, e.g. 0.39539
  tds: number;
  cashLeftGross: number;      // income used - contractPayment - debt - homeExpenses
  grossMonthly: number;       // income used: input for two modes, solved for required-income
}

// 1) DEBT SERVICE: given mortgage + income, return the actual GDS and TDS.
export function debtService(i: AffordabilityInputs, mortgage: number, annualIncome: number): Breakdown {
  const sr = stressRate(i.contractRate, i.stressMode);
  const he = homeExpenses(i);
  const qPay = pmt(mortgage, sr, i.amortMonths, i.compounding);
  const cPay = pmt(mortgage, i.contractRate, i.amortMonths, i.compounding);
  let grossMonthly = annualIncome / 12;
  let offset = 0; // rental offset reduces the numerator
  if (i.rentalEnabled) {
    if (i.rentalRule === 'add-back') grossMonthly += i.rentalMonthly * i.rentalPortion;
    else offset = i.rentalMonthly * i.rentalPortion;
  }
  const gds = (qPay + he - offset) / grossMonthly;
  const tds = (qPay + he + i.monthlyDebt - offset) / grossMonthly;
  const cashLeftGross = grossMonthly - cPay - i.monthlyDebt - he;
  return { stressRate: sr, qualifyingPayment: qPay, contractPayment: cPay, homeExpenses: he,
           debtPayments: i.monthlyDebt, gds, tds, cashLeftGross, grossMonthly };
}

// 2) MAXIMUM MORTGAGE: given income, return the largest mortgage where GDS <= limit and TDS <= limit.
export interface MaxMortgageResult extends Breakdown { maxMortgage: number; binding: 'gds' | 'tds'; }
export function maximumMortgage(i: AffordabilityInputs, annualIncome: number): MaxMortgageResult {
  const sr = stressRate(i.contractRate, i.stressMode);
  const he = homeExpenses(i);
  let grossMonthly = annualIncome / 12;
  let offset = 0;
  if (i.rentalEnabled) {
    if (i.rentalRule === 'add-back') grossMonthly += i.rentalMonthly * i.rentalPortion;
    else offset = i.rentalMonthly * i.rentalPortion; // adds room to the payment cap
  }
  const capGDS = i.gdsLimit * grossMonthly - he + offset;
  const capTDS = i.tdsLimit * grossMonthly - he - i.monthlyDebt + offset;
  const binding: 'gds' | 'tds' = capGDS <= capTDS ? 'gds' : 'tds';
  const maxQ = Math.max(0, Math.min(capGDS, capTDS));
  const maxMortgage = principalFor(maxQ, sr, i.amortMonths, i.compounding);
  const qPay = pmt(maxMortgage, sr, i.amortMonths, i.compounding);
  const cPay = pmt(maxMortgage, i.contractRate, i.amortMonths, i.compounding);
  const cashLeftGross = grossMonthly - cPay - i.monthlyDebt - he;
  const gds = (qPay + he - offset) / grossMonthly;
  const tds = (qPay + he + i.monthlyDebt - offset) / grossMonthly;
  return { maxMortgage, binding, stressRate: sr, qualifyingPayment: qPay, contractPayment: cPay,
           homeExpenses: he, debtPayments: i.monthlyDebt, gds, tds, cashLeftGross, grossMonthly };
}

// 3) REQUIRED INCOME: given mortgage, return the minimum income so GDS <= limit and TDS <= limit.
export interface RequiredIncomeResult extends Breakdown { requiredIncome: number; binding: 'gds' | 'tds'; }
export function requiredIncome(i: AffordabilityInputs, mortgage: number): RequiredIncomeResult {
  const sr = stressRate(i.contractRate, i.stressMode);
  const he = homeExpenses(i);
  const qPay = pmt(mortgage, sr, i.amortMonths, i.compounding);
  const cPay = pmt(mortgage, i.contractRate, i.amortMonths, i.compounding);
  const offset = (i.rentalEnabled && i.rentalRule === 'offset') ? i.rentalMonthly * i.rentalPortion : 0;
  const addBack = (i.rentalEnabled && i.rentalRule === 'add-back') ? i.rentalMonthly * i.rentalPortion : 0;
  const needGDS = (qPay + he - offset) / i.gdsLimit - addBack;
  const needTDS = (qPay + he + i.monthlyDebt - offset) / i.tdsLimit - addBack;
  const binding: 'gds' | 'tds' = needGDS >= needTDS ? 'gds' : 'tds';
  const reqMonthly = Math.max(0, needGDS, needTDS);   // required employment income, monthly
  const grossMonthly = reqMonthly + addBack;          // total income available including rental
  const cashLeftGross = grossMonthly - cPay - i.monthlyDebt - he;
  const gds = (qPay + he - offset) / grossMonthly;
  const tds = (qPay + he + i.monthlyDebt - offset) / grossMonthly;
  return { requiredIncome: reqMonthly * 12, binding, stressRate: sr, qualifyingPayment: qPay,
           contractPayment: cPay, homeExpenses: he, debtPayments: i.monthlyDebt, gds, tds, cashLeftGross, grossMonthly };
}
