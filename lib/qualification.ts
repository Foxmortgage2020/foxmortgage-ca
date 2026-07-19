// The qualification explorer (B9) — the pure compute behind the client's
// "Can I afford it?" section and Michael's baseline card.
//
// REUSE, NEVER RE-DERIVE. Every ratio comes from lib/affordability-engine.ts
// (debtService — the ONE GDS/TDS engine already behind the three public tools),
// and the insured fold mirrors lib/purchase-engine.ts (cmhcPremiumRate +
// minimumDownPayment) exactly. Nothing here re-implements payment, compounding,
// GDS/TDS, the CMHC premium table, or the minimum-down tiers. That is the
// standing guardrail: deterministic code calculates in one place.
//
// Pure (engines + config only, NO node:crypto, NO fetch), so it runs identically
// in the browser (the live explorer), on the server (the admin preview + the
// route), and in node tests, and it is golden-tested to the cent.
//
// FINDING, stated (against the brief): the brief's minimum-down rule ("10% on
// 500k-1M, 20% over 1M") is the OLD federal rule. The repo — and current law —
// use 5% up to 500k, 10% on the 500k-to-1.5M portion, 20% above 1.5M, with the
// insured cap at 1.5M. We use the repo's convention so the explorer never
// disagrees with the shipped purchase calculators.

import { debtService, type AffordabilityInputs, type StressMode, type Compounding } from '@/lib/affordability-engine'
import { cmhcPremiumRate, minimumDownPayment } from '@/lib/purchase-engine'
import {
  bandKeyForRatios,
  resolveBand,
  type QualificationBand,
} from '@/config/qualification'
import type { IncomeCalcRow } from '@/lib/underwriting'

// Bump when a figure's derivation changes so a frozen baseline is never silently
// reinterpreted. The stored row carries this.
export const QUALIFICATION_CALC_VERSION = 1

const SANE_MAX_PRICE = 50_000_000
const RATE_MIN = 0.01
const RATE_MAX = 25
const AMORT_MIN_MONTHS = 60 // 5 years
const AMORT_MAX_MONTHS = 480 // 40 years — generous; the UI proposes 300 (25yr)
const INSURABLE_PRICE_CAP = 1_500_000

// The frozen baseline Michael publishes: the locked panel (his truth), the
// computation constants (frozen for reproducibility), and the client's four
// inputs' starting values (so reset works and the first render is his numbers).
export interface QualificationBaseline {
  // locked panel
  annualIncome: number
  monthlyDebts: number
  heatMonthly: number
  contractRatePct: number
  stressMode: StressMode // 'b20' | 'contract'
  amortizationMonths: number
  // computation constants (frozen)
  condoInclusionRate: number // 0.50 = half of condo fees count
  gdsLimit: number // 0.39 (carried for reproducibility; debtService does not use it)
  tdsLimit: number // 0.44
  compounding: Compounding // 'semi-annual'
  // the client's four inputs, initial values
  defaultPrice: number
  defaultDownPayment: number
  defaultPropertyTaxMonthly: number
  defaultCondoMonthly: number
}

// Per-field provenance for the admin card: 'file' (proposed from the deal's
// truth), 'default' (a sensible starting value), or 'edited' (Michael set it).
// Admin-facing only; the client never sees it.
export type FieldSource = 'file' | 'default' | 'edited'
export type QualificationSources = Partial<Record<keyof QualificationBaseline, FieldSource>>

// The client's four live inputs.
export interface QualificationControls {
  price: number
  downPayment: number
  propertyTaxMonthly: number
  condoMonthly: number
}

export interface QualificationResult {
  loanBeforePremium: number
  ltv: number // loanBeforePremium / price
  insured: boolean // a real CMHC premium folded in
  premium: number
  premiumRate: number
  mortgage: number // insured (capitalized) or bare
  qualifyingRatePct: number // the stress rate
  qualifyingPaymentMonthly: number // P&I at the stress rate (drives the ratios)
  contractPaymentMonthly: number // P&I at the contract rate (what they would pay)
  gds: number // ratio 0..1
  tds: number // ratio 0..1
  band: QualificationBand
  minimumDown: number
  belowMinimumDown: boolean
}

/**
 * The mortgage a purchase produces at this price and down payment, with the
 * default insurance premium folded in below 20 percent down — mirroring
 * computePurchase's insured path (lib/purchase-engine.ts) exactly. Over 1.5M
 * with less than 20 percent down there is no insured path (uninsurable), and
 * below 5 percent down there is none either (cmhcPremiumRate is NaN by spec).
 * In both cases we qualify the bare loan and the minimum-down helper flags it —
 * never a thrown error, never a NaN leak.
 */
export function qualifyingMortgage(
  price: number,
  downPayment: number,
  amortizationMonths: number,
): { loanBeforePremium: number; ltv: number; insured: boolean; premium: number; premiumRate: number; mortgage: number } {
  const loanBeforePremium = Math.max(0, price - downPayment)
  const ltv = price > 0 ? loanBeforePremium / price : 0
  const amortYears = amortizationMonths / 12
  const rawRate = ltv > 0.8 ? cmhcPremiumRate(ltv, amortYears) : 0
  const insurable = ltv > 0.8 && ltv <= 0.95 && price <= INSURABLE_PRICE_CAP && Number.isFinite(rawRate)
  const premiumRate = insurable ? rawRate : 0
  const premium = insurable ? loanBeforePremium * premiumRate : 0
  const insured = premium > 0
  const mortgage = loanBeforePremium + premium
  return { loanBeforePremium, ltv, insured, premium, premiumRate, mortgage }
}

function affordabilityInputsFor(baseline: QualificationBaseline, controls: QualificationControls): AffordabilityInputs {
  return {
    contractRate: baseline.contractRatePct,
    amortMonths: baseline.amortizationMonths,
    compounding: baseline.compounding,
    stressMode: baseline.stressMode,
    monthlyDebt: baseline.monthlyDebts,
    propertyTaxMonthly: controls.propertyTaxMonthly,
    condoMonthly: controls.condoMonthly,
    heatMonthly: baseline.heatMonthly,
    condoInclusionRate: baseline.condoInclusionRate,
    gdsLimit: baseline.gdsLimit,
    tdsLimit: baseline.tdsLimit,
    // The explorer never models rental income; the four controls are the only
    // things a client moves. debtService reads these off, so they stay off.
    rentalEnabled: false,
    rentalMonthly: 0,
    rentalRule: 'add-back',
    rentalPortion: 0.5,
  }
}

/**
 * The live result: fold the premium, run debtService for the ratios, classify
 * into one band. Deterministic and pure — the browser and the tests run this
 * exact code.
 */
export function computeQualification(
  baseline: QualificationBaseline,
  controls: QualificationControls,
): QualificationResult {
  const m = qualifyingMortgage(controls.price, controls.downPayment, baseline.amortizationMonths)
  const inputs = affordabilityInputsFor(baseline, controls)
  const bd = debtService(inputs, m.mortgage, baseline.annualIncome)
  const gdsPct = bd.gds * 100
  const tdsPct = bd.tds * 100
  const bandKey = bandKeyForRatios(gdsPct, tdsPct)
  const minimumDown = minimumDownPayment(controls.price)
  return {
    loanBeforePremium: m.loanBeforePremium,
    ltv: m.ltv,
    insured: m.insured,
    premium: m.premium,
    premiumRate: m.premiumRate,
    mortgage: m.mortgage,
    qualifyingRatePct: bd.stressRate,
    qualifyingPaymentMonthly: bd.qualifyingPayment,
    contractPaymentMonthly: bd.contractPayment,
    gds: bd.gds,
    tds: bd.tds,
    band: resolveBand(bandKey),
    minimumDown,
    // A small epsilon so a down payment sitting exactly on the minimum does not
    // flip the helper on a floating-point wobble.
    belowMinimumDown: controls.downPayment < minimumDown - 0.5,
  }
}

// ── Validation ────────────────────────────────────────────────────────────────

export type QualificationValidation =
  | { ok: true; baseline: QualificationBaseline }
  | { ok: false; missing: string[] }

const numOr = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

/**
 * Validate a baseline before it can be saved or published. A published baseline
 * must be real: a positive income and price, a sane rate and amortization, a
 * down payment below the price. The admin card blocks publish until this passes.
 */
export function validateBaseline(raw: Partial<QualificationBaseline>): QualificationValidation {
  const missing: string[] = []
  const annualIncome = numOr(raw.annualIncome, NaN)
  const contractRatePct = numOr(raw.contractRatePct, NaN)
  const amortizationMonths = numOr(raw.amortizationMonths, NaN)
  const defaultPrice = numOr(raw.defaultPrice, NaN)
  const defaultDownPayment = numOr(raw.defaultDownPayment, NaN)

  if (!(annualIncome > 0)) missing.push('a yearly income')
  if (!(contractRatePct >= RATE_MIN && contractRatePct <= RATE_MAX)) missing.push('a rate')
  if (!(Number.isInteger(amortizationMonths) && amortizationMonths >= AMORT_MIN_MONTHS && amortizationMonths <= AMORT_MAX_MONTHS))
    missing.push('an amortization')
  if (!(defaultPrice > 0 && defaultPrice <= SANE_MAX_PRICE)) missing.push('a starting home price')
  if (!(defaultDownPayment >= 0 && defaultDownPayment < defaultPrice)) missing.push('a down payment below the price')
  if (raw.stressMode !== 'b20' && raw.stressMode !== 'contract') missing.push('a stress-test mode')
  if (raw.compounding !== 'semi-annual' && raw.compounding !== 'monthly') missing.push('a compounding')
  if (missing.length) return { ok: false, missing }

  return {
    ok: true,
    baseline: {
      annualIncome,
      monthlyDebts: Math.max(0, numOr(raw.monthlyDebts, 0)),
      heatMonthly: Math.max(0, numOr(raw.heatMonthly, 0)),
      contractRatePct,
      stressMode: raw.stressMode as StressMode,
      amortizationMonths,
      condoInclusionRate: clamp01(numOr(raw.condoInclusionRate, 0.5)),
      gdsLimit: clamp01(numOr(raw.gdsLimit, 0.39)),
      tdsLimit: clamp01(numOr(raw.tdsLimit, 0.44)),
      compounding: raw.compounding as Compounding,
      defaultPrice,
      defaultDownPayment,
      defaultPropertyTaxMonthly: Math.max(0, numOr(raw.defaultPropertyTaxMonthly, 0)),
      defaultCondoMonthly: Math.max(0, numOr(raw.defaultCondoMonthly, 0)),
    },
  }
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

// ── The proposal ──────────────────────────────────────────────────────────────

const DEFAULT_HEAT_MONTHLY = 100 // the repo's only heating convention (a flat UI default)
const DEFAULT_RATE_PCT = 4.79
const DEFAULT_PRICE = 600_000
const STANDARD_AMORT_MONTHS = 300 // 25 years

/**
 * The starting baseline the platform proposes in the deal room, from the file's
 * current truth where it can read it, and a sensible default otherwise. Michael
 * reviews and edits any value before publishing; the sources record where each
 * value came from. Pure: the deal room reads the workbench and passes the rows in.
 */
export function proposeQualificationBaseline(args: {
  incomeCalcs: IncomeCalcRow[]
  finmoRatePct: number | null
  dealPrice: number | null
}): { baseline: QualificationBaseline; sources: QualificationSources } {
  // Income: the latest calc per borrower, summed. income_calcs is ordered
  // newest-first, so the first row seen per borrower is the current one. This is
  // a starting point Michael confirms, not an authority.
  const latestPerBorrower = new Map<string, number>()
  for (const r of args.incomeCalcs) {
    const key = r.borrowerId ?? '(none)'
    if (!latestPerBorrower.has(key) && Number.isFinite(r.resultAnnual) && r.resultAnnual > 0) {
      latestPerBorrower.set(key, r.resultAnnual)
    }
  }
  const proposedIncome = Array.from(latestPerBorrower.values()).reduce((s, v) => s + v, 0)

  const price = args.dealPrice && args.dealPrice > 0 ? args.dealPrice : DEFAULT_PRICE
  const rate = args.finmoRatePct && args.finmoRatePct >= RATE_MIN && args.finmoRatePct <= RATE_MAX ? args.finmoRatePct : DEFAULT_RATE_PCT

  const baseline: QualificationBaseline = {
    annualIncome: proposedIncome > 0 ? Math.round(proposedIncome) : 0,
    monthlyDebts: 0,
    heatMonthly: DEFAULT_HEAT_MONTHLY,
    contractRatePct: rate,
    stressMode: 'b20',
    amortizationMonths: STANDARD_AMORT_MONTHS,
    condoInclusionRate: 0.5,
    gdsLimit: 0.39,
    tdsLimit: 0.44,
    compounding: 'semi-annual',
    defaultPrice: Math.round(price),
    defaultDownPayment: Math.round(price * 0.2), // 20 percent: a clean, no-insurance start
    defaultPropertyTaxMonthly: Math.round((price * 0.01) / 12), // ~1 percent of value a year, a starting guess
    defaultCondoMonthly: 0,
  }

  const sources: QualificationSources = {
    annualIncome: proposedIncome > 0 ? 'file' : 'default',
    monthlyDebts: 'default',
    heatMonthly: 'default',
    contractRatePct: args.finmoRatePct ? 'file' : 'default',
    stressMode: 'default',
    amortizationMonths: 'default',
    condoInclusionRate: 'default',
    gdsLimit: 'default',
    tdsLimit: 'default',
    compounding: 'default',
    defaultPrice: args.dealPrice && args.dealPrice > 0 ? 'file' : 'default',
    defaultDownPayment: 'default',
    defaultPropertyTaxMonthly: 'default',
    defaultCondoMonthly: 'default',
  }

  return { baseline, sources }
}

// ── Persistence row shape ─────────────────────────────────────────────────────
// Defined HERE, upstream of both lib/qualification-store.ts and
// lib/demo-fixtures.ts, so neither creates an import cycle.

export interface QualificationBaselineRow {
  id: string
  zohoDealId: string
  fileRef: string | null
  baseline: QualificationBaseline
  sources: QualificationSources
  baselineHash: string
  calcVersion: number
  published: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}
