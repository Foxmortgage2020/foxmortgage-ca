// Strategic Mortgage Monitoring — parsing and the opportunity model. Pure
// functions, no I/O; unit-tested in tests/smm.test.ts against a SYNTHETIC
// fixture (never the real client export). Everything here is analysis on
// estimate-labeled monitored data; underwriting begins at application.
//
// The market-comparable rate and the per-lender penalty methodology come from
// the approved rate book and the knowledge base and are passed IN, so this
// module stays pure and testable without the workbench.

import { monthlyPayment } from '@/lib/mortgage-engine'
import { periodicRateForFrequency } from '@/lib/refinance-engine'
import { normalizeLender, type NormalizedLender } from '@/config/smm-lender-aliases'

// ─── The 26 export columns, in order ────────────────────────────────────────
export const SMM_COLUMNS = [
  'Household ID', 'File reference', 'First name', 'Last name', 'Client type', 'Email', 'Phone',
  'Property address', 'Property type', 'Property occupancy', 'Estimated home value', 'Mortgage amount',
  'Mortgage outstanding balance', 'Mortgage rate', 'Mortgage rate type', 'Mortgage closing date',
  'Mortgage start date', 'Mortgage maturity date', 'Mortgage amortization (months)', 'Mortgage term (months)',
  'Mortgage lender', 'Mortgage insurance type', 'Savings potential', 'Payment relief (monthly)',
  'Accessible equity', 'Purchasing power',
] as const

// ─── CSV parsing (RFC-4180-ish: quoted fields, commas inside quotes) ─────────
// The export quotes money fields because they contain commas ("$596,000.00").
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      field = ''
      row = []
    } else if (c !== '\r') {
      field += c
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  if (rows.length === 0) return []
  const header = rows[0].map(h => h.trim())
  return rows
    .slice(1)
    .filter(r => r.some(c => c.trim() !== ''))
    .map(r => {
      const o: Record<string, string> = {}
      header.forEach((h, i) => {
        o[h] = r[i] ?? ''
      })
      return o
    })
}

// ─── Field parsers (dash is null, never zero) ───────────────────────────────
const DASH = new Set(['', '-', '—', 'n/a', 'na'])

export interface Parsed<T> {
  value: T | null
  error: string | null
}

export function parseMoney(raw: string | null | undefined): Parsed<number> {
  const t = (raw ?? '').trim()
  if (DASH.has(t.toLowerCase())) return { value: null, error: null }
  const neg = t.startsWith('-')
  const cleaned = t.replace(/^-/, '').replace(/[$,]/g, '').trim()
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return { value: null, error: `unrecognized money value ${JSON.stringify(t)}` }
  const n = Number(cleaned)
  return { value: neg ? -n : n, error: null }
}

export function parsePercent(raw: string | null | undefined): Parsed<number> {
  const t = (raw ?? '').trim()
  if (DASH.has(t.toLowerCase())) return { value: null, error: null }
  const cleaned = t.replace(/%/g, '').trim()
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return { value: null, error: `unrecognized percent value ${JSON.stringify(t)}` }
  return { value: Number(cleaned), error: null }
}

export function parseDateField(raw: string | null | undefined): Parsed<string> {
  const t = (raw ?? '').trim()
  if (DASH.has(t.toLowerCase())) return { value: null, error: null }
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return { value: null, error: `unrecognized date value ${JSON.stringify(t)}` }
  return { value: `${m[1]}-${m[2]}-${m[3]}`, error: null }
}

export function parseIntField(raw: string | null | undefined): Parsed<number> {
  const t = (raw ?? '').trim()
  if (DASH.has(t.toLowerCase())) return { value: null, error: null }
  if (!/^\d+$/.test(t)) return { value: null, error: `unrecognized integer value ${JSON.stringify(t)}` }
  return { value: Number(t), error: null }
}

// ─── Parsed row ─────────────────────────────────────────────────────────────
export interface FieldError {
  field: string
  message: string
}

export interface SmmParsedRow {
  householdId: string
  fileRef: string
  firstName: string
  lastName: string
  clientType: string // CLIENT | LEAD | Referral
  email: string
  phone: string
  address: string
  propertyType: string
  occupancy: string
  homeValue: number | null
  amount: number | null
  balance: number | null
  rate: number | null
  rateType: string | null // fixed | variable | adjustable
  closingDate: string | null
  startDate: string | null
  maturityDate: string | null
  amortizationMonths: number | null
  termMonths: number | null
  lenderRaw: string
  lender: NormalizedLender
  insuranceType: string | null // Insured | Insurable | Uninsurable
  savingsPotential: number | null
  paymentRelief: number | null
  accessibleEquity: number | null
  purchasingPower: number | null
  parseErrors: FieldError[]
}

function get(raw: Record<string, string>, col: string): string {
  return (raw[col] ?? '').trim()
}

export function parseSmmRow(raw: Record<string, string>): SmmParsedRow {
  const errors: FieldError[] = []
  const money = (col: string): number | null => {
    const p = parseMoney(get(raw, col))
    if (p.error) errors.push({ field: col, message: p.error })
    return p.value
  }
  const pct = (col: string): number | null => {
    const p = parsePercent(get(raw, col))
    if (p.error) errors.push({ field: col, message: p.error })
    return p.value
  }
  const date = (col: string): string | null => {
    const p = parseDateField(get(raw, col))
    if (p.error) errors.push({ field: col, message: p.error })
    return p.value
  }
  const int = (col: string): number | null => {
    const p = parseIntField(get(raw, col))
    if (p.error) errors.push({ field: col, message: p.error })
    return p.value
  }
  const rateTypeRaw = get(raw, 'Mortgage rate type').toLowerCase()
  const lenderRaw = get(raw, 'Mortgage lender')
  return {
    householdId: get(raw, 'Household ID'),
    fileRef: get(raw, 'File reference'),
    firstName: get(raw, 'First name'),
    lastName: get(raw, 'Last name'),
    clientType: get(raw, 'Client type'),
    email: get(raw, 'Email').toLowerCase(),
    phone: get(raw, 'Phone'),
    address: get(raw, 'Property address'),
    propertyType: get(raw, 'Property type'),
    occupancy: get(raw, 'Property occupancy'),
    homeValue: money('Estimated home value'),
    amount: money('Mortgage amount'),
    balance: money('Mortgage outstanding balance'),
    rate: pct('Mortgage rate'),
    rateType: rateTypeRaw || null,
    closingDate: date('Mortgage closing date'),
    startDate: date('Mortgage start date'),
    maturityDate: date('Mortgage maturity date'),
    amortizationMonths: int('Mortgage amortization (months)'),
    termMonths: int('Mortgage term (months)'),
    lenderRaw,
    lender: normalizeLender(lenderRaw),
    insuranceType: get(raw, 'Mortgage insurance type') || null,
    savingsPotential: money('Savings potential'),
    paymentRelief: money('Payment relief (monthly)'),
    accessibleEquity: money('Accessible equity'),
    purchasingPower: money('Purchasing power'),
    parseErrors: errors,
  }
}

// ─── Placeholder + analyzability ────────────────────────────────────────────
// Balances or amounts at or near $1 are data-quality flags, never analyzed —
// a $1 balance against market would produce nonsense with a confident face.
export function isPlaceholder(r: SmmParsedRow): boolean {
  return (r.balance != null && r.balance <= 1) || (r.amount != null && r.amount <= 1)
}

// A row that will not parse is a visible failure, never a silent skip.
export function hasParseFailure(r: SmmParsedRow): boolean {
  return r.parseErrors.length > 0
}

// Analyzable requires a real balance and a real positive rate with no error on
// either. A 0% (or negative) rate is a data-quality artifact, never a real
// mortgage, and would produce a nonsense comparison, so it is not analyzed.
export function isAnalyzable(r: SmmParsedRow): boolean {
  if (isPlaceholder(r)) return false
  if (r.balance == null || r.rate == null || r.rate <= 0) return false
  if (r.parseErrors.some(e => e.field === 'Mortgage outstanding balance' || e.field === 'Mortgage rate')) return false
  return true
}

// ─── Co-borrower dedup ──────────────────────────────────────────────────────
// Rows are per person, so one mortgage appears once per borrower. Collapse to
// one mortgage per address + balance + maturity, retaining every borrower.
export interface Borrower {
  firstName: string
  lastName: string
  email: string
  phone: string
  clientType: string
  fileRef: string
}

export interface SmmMortgage {
  key: string
  primary: SmmParsedRow
  borrowers: Borrower[]
}

// Household ID leads the key: co-borrowers on one mortgage share the same
// Household ID (that is what the field means), so they still collapse, while two
// DIFFERENT households can never merge — not even when both carry a null balance
// and null maturity (which would otherwise key alike as `address|na|na`).
// Address + balance + maturity still separate two mortgages within one household
// (a client with two properties keeps the same Household ID but different keys).
function mortgageKey(r: SmmParsedRow): string {
  return `${r.householdId.trim().toLowerCase()}|${r.address.trim().toLowerCase()}|${r.balance ?? 'na'}|${r.maturityDate ?? 'na'}`
}

export function collapseCoBorrowers(rows: SmmParsedRow[]): {
  mortgages: SmmMortgage[]
  collapsedCount: number
} {
  const byKey = new Map<string, SmmMortgage>()
  const order: string[] = []
  for (const r of rows) {
    const key = mortgageKey(r)
    const borrower: Borrower = {
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      phone: r.phone,
      clientType: r.clientType,
      fileRef: r.fileRef,
    }
    const existing = byKey.get(key)
    if (existing) {
      existing.borrowers.push(borrower)
    } else {
      byKey.set(key, { key, primary: r, borrowers: [borrower] })
      order.push(key)
    }
  }
  const mortgages = order.map(k => byKey.get(k)!)
  return { mortgages, collapsedCount: rows.length - mortgages.length }
}

// ─── Sign convention + sanity ───────────────────────────────────────────────
// Verified against the fixture: POSITIVE Savings potential means the client
// SAVES by acting now; NEGATIVE means acting now costs them (breaking a low
// rate costs more than the delta recovers); a dash means the service could not
// compute. Codified as a tested assumption so a vendor sign flip is noticed.
export const SANITY_LOW_RATE = 2.0
export const SANITY_SAVINGS = 500

export interface SignViolation {
  householdId: string
  rate: number
  savings: number
  reason: string
}

// A sub-2% mortgage showing large positive savings should trip review, not
// flow through: breaking a sub-2% rate cannot plausibly save hundreds a month.
export function checkSignConvention(rows: SmmParsedRow[]): {
  ok: boolean
  violations: SignViolation[]
} {
  const violations: SignViolation[] = []
  for (const r of rows) {
    if (r.rate != null && r.savingsPotential != null && r.rate < SANITY_LOW_RATE && r.savingsPotential > SANITY_SAVINGS) {
      violations.push({
        householdId: r.householdId,
        rate: r.rate,
        savings: r.savingsPotential,
        reason: `${r.rate}% rate showing +$${r.savingsPotential.toFixed(2)} savings violates the sign convention`,
      })
    }
  }
  return { ok: violations.length === 0, violations }
}

// ─── Fox's opportunity analysis (pure; comparables + penalty passed in) ─────
// 'review' is the reconciliation-blocked state: the export's balance does not
// match the mortgage schedule modeled from origination, so no figure is stated
// until Michael confirms the true position with the lender.
export type OppBucket = 'act_now' | 'marginal' | 'stay_put' | 'insufficient' | 'review'

// Net benefit within this band of zero is "marginal" — worth watching, not
// worth a client's disruption.
export const MARGINAL_BAND = 1500

export interface Comparable {
  rate: number
  lender: string
  asOf: string | null // sheet date
  termMonths: number
  kind: 'fixed' | 'floating'
  // Optional enrichments from the eligible comparable (Part 1c): the slug (for a
  // province-flag on internal cards), the floating discount + the prime it was
  // priced against (so a computed effective rate is never mistaken for printed).
  lenderSlug?: string
  variance?: number | null
  primeUsed?: number | null
  rateType?: string
}

export interface PenaltyEstimate {
  // Three-months-interest is always computable from balance and rate.
  threeMonthsInterest: number
  // For fixed mortgages, the IRD-vs-3MI framing depends on per-lender
  // methodology from the knowledge base; where it is not documented we say so
  // and never assert a single confident penalty number.
  methodologyKnown: boolean
  framing: string
  // The number used downstream for break-even/net-benefit: 3MI for floating;
  // for fixed, 3MI as the conservative floor when methodology is unknown.
  estimateForMath: number
}

export function threeMonthsInterest(balance: number, ratePct: number): number {
  return balance * (ratePct / 100) * (3 / 12)
}

export function penaltyEstimate(
  balance: number,
  ratePct: number,
  rateType: string | null,
  methodologyKnown: boolean,
): PenaltyEstimate {
  const tmi = threeMonthsInterest(balance, ratePct)
  const floating = rateType === 'variable' || rateType === 'adjustable'
  if (floating) {
    return {
      threeMonthsInterest: tmi,
      methodologyKnown: true,
      framing: 'Floating: the penalty is three months of interest.',
      estimateForMath: tmi,
    }
  }
  // Fixed.
  if (methodologyKnown) {
    return {
      threeMonthsInterest: tmi,
      methodologyKnown: true,
      framing: 'Fixed: the greater of three months of interest and the interest-rate differential, per the lender methodology.',
      estimateForMath: tmi, // the documented methodology refines this on the page; 3MI is the floor
    }
  }
  return {
    threeMonthsInterest: tmi,
    methodologyKnown: false,
    framing:
      'Fixed: the penalty is the greater of three months of interest and the interest-rate differential. The IRD methodology is not documented for this lender, so no single figure is asserted; three months of interest is the floor.',
    estimateForMath: tmi,
  }
}

// ─── Transaction type (Part 1c) ─────────────────────────────────────────────
// Michael's rule: an SMM client who BREAKS their mortgage is a refinance
// (uninsurable → conventional pricing, a penalty, an 80% LTV cap, full
// requalification at the stress test). A client at maturity is a switch (the
// original insurance class ports, no penalty, no requalification). The maturity
// date decides: within the switch window it is a switch, otherwise (or when the
// maturity is unknown) it is a refinance — the conservative, higher-priced call.
export type TransactionKind = 'refinance' | 'switch'
export const SWITCH_WINDOW_DAYS = 120
export const MAX_REFI_LTV = 80

export function daysToMaturity(maturityDate: string | null, todayYMD: string): number | null {
  if (!maturityDate) return null
  const m = maturityDate.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const [ty, tm, td] = todayYMD.split('-').map(Number)
  return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(ty, tm - 1, td)) / 86_400_000)
}

export function deriveTransaction(maturityDate: string | null, todayYMD: string): TransactionKind {
  const days = daysToMaturity(maturityDate, todayYMD)
  if (days != null && days <= SWITCH_WINDOW_DAYS) return 'switch'
  return 'refinance'
}

/** LTV percent from the export's balance and estimated home value, or null when
 * it cannot be computed (missing / non-positive / implausible value). */
export function computeLtv(balance: number | null, homeValue: number | null): number | null {
  if (balance == null || homeValue == null || homeValue <= 0 || balance <= 0) return null
  const ltv = (balance / homeValue) * 100
  if (ltv > 200) return null // implausible data
  return Math.round(ltv * 10) / 10
}

// ─── Schedule reconstruction + the reconciliation gate ──────────────────────
// The feed's "Mortgage amortization (months)" is the ORIGINAL amortization,
// never the remaining one. So the client's actual payment reconstructs from
// the ORIGINAL schedule — payment(original amount, rate, original amortization)
// — and the remaining amortization is original minus months elapsed. A current
// balance re-amortized over the original period understates a seasoned
// mortgage's payment (the bug this section exists to prevent: it can never be
// caught on an unseasoned file, where both methods agree exactly).
//
// The gate: model the balance forward from origination and compare it to the
// feed's outstanding balance. Prepayments, adjustable-rate changes, and bad
// vendor data all present as drift. Over the threshold, the analysis is
// blocked and routed to the board as a review item — an analysis that cannot
// be reconciled is one that cannot be defended on a call or a client document.
export const RECONCILIATION_DRIFT_BLOCK_PCT = 0.5

export function monthsElapsed(startYMD: string, todayYMD: string): number {
  const [sy, sm, sd] = startYMD.slice(0, 10).split('-').map(Number)
  const [ty, tm, td] = todayYMD.split('-').map(Number)
  const months = (ty - sy) * 12 + (tm - sm) + (td >= sd ? 0 : -1)
  return Math.max(0, months)
}

/** Balance remaining after `monthsPaid` scheduled payments on the original
 * schedule (closed form; same semi-annual compounding core as the engine). */
export function balanceAfter(
  principal: number,
  annualRatePct: number,
  amortMonths: number,
  monthsPaid: number,
): number {
  const i = periodicRateForFrequency(annualRatePct, 'semi-annually', 12)
  const pmt = monthlyPayment(principal, annualRatePct, 'semi-annually', amortMonths)
  if (i === 0) return principal - pmt * monthsPaid
  const g = Math.pow(1 + i, monthsPaid)
  return principal * g - pmt * ((g - 1) / i)
}

export interface BalanceReconciliation {
  /** Balance the original schedule says the client should hold today. */
  modeledBalance: number
  /** The export's outstanding balance. */
  feedBalance: number
  /** |modeled - feed| as a percent of the modeled balance. */
  driftPct: number
  ok: boolean
}

export function reconcileBalance(
  amount: number,
  annualRatePct: number,
  amortMonths: number,
  monthsPaid: number,
  feedBalance: number,
): BalanceReconciliation {
  const modeled = balanceAfter(amount, annualRatePct, amortMonths, monthsPaid)
  const driftPct = modeled > 0 ? (Math.abs(modeled - feedBalance) / modeled) * 100 : 100
  return {
    modeledBalance: modeled,
    feedBalance,
    driftPct,
    ok: driftPct <= RECONCILIATION_DRIFT_BLOCK_PCT,
  }
}

export interface FoxAnalysis {
  currentPayment: number | null
  newPayment: number | null
  monthlyDelta: number | null // new - current (negative = the client pays less)
  monthlySaving: number | null // -monthlyDelta when positive (dollars saved per month)
  comparable: Comparable | null
  penalty: PenaltyEstimate | null
  remainingMonths: number | null
  breakEvenMonths: number | null
  netBenefit: number | null // saving over the horizon minus penalty
  bucket: OppBucket
  // Part 1c context
  transaction: TransactionKind | null
  productClass: string | null
  ltv: number | null
  /** True when a refinance is blocked by the 80% LTV cap. Excluded from act-now. */
  ltvBlocked: boolean
  /** True when this is a refinance: requires requalifying at the stress test. */
  requalification: boolean
  /** Whether a break penalty applies (refinance yes, switch no). */
  penaltyApplies: boolean
  /** The months the saving was projected over (remaining term for a break; the
   * new term for a switch). */
  horizonMonths: number | null
  /** A plain reason when the opportunity is insufficient/blocked. */
  blockReason: string | null
  /** Months elapsed since the mortgage start date, per the export. */
  monthsElapsed: number | null
  /** Original amortization minus months elapsed: what the client actually has
   * left, and the level any shorter-amortization option is measured against. */
  remainingAmortizationMonths: number | null
  /** The schedule-vs-feed balance check; drift over the threshold blocks. */
  reconciliation: BalanceReconciliation | null
}

export interface AnalyzeOptions {
  transaction?: TransactionKind
  productClass?: string
  /** Precomputed LTV; else computed from the row. */
  ltv?: number | null
}

// Standard amortization assumption where the export's is missing/implausible,
// mirroring the renewal payment-shock convention.
const STD_AMORT_MONTHS = 25 * 12

function amortFor(row: SmmParsedRow): number {
  const a = row.amortizationMonths
  // Plausible amortization is between 5 and 40 years in months.
  if (a != null && a >= 60 && a <= 480) return a
  return STD_AMORT_MONTHS
}

export function remainingTermMonths(maturityDate: string | null, todayYMD: string): number | null {
  if (!maturityDate) return null
  const [my, mm, md] = maturityDate.slice(0, 10).split('-').map(Number)
  const [ty, tm, td] = todayYMD.split('-').map(Number)
  const months = (my - ty) * 12 + (mm - tm) + (md >= td ? 0 : -1)
  return months
}

// Compute Fox's analysis. `comparable` is the best gate-approved ELIGIBLE
// comparable (of the correct product class for the transaction). Transaction
// (refinance vs switch), the 80% LTV cap, and whether a penalty applies are all
// resolved from the export's maturity + balance + value, so the savings figure
// is what the client can actually have, never an insured rate a refinance can't.
export function analyzeOpportunity(
  row: SmmParsedRow,
  comparable: Comparable | null,
  methodologyKnown: boolean,
  todayYMD: string,
  opts: AnalyzeOptions = {},
): FoxAnalysis {
  const transaction = opts.transaction ?? deriveTransaction(row.maturityDate, todayYMD)
  const productClass = opts.productClass ?? null
  const ltv = opts.ltv !== undefined ? opts.ltv : computeLtv(row.balance, row.homeValue)
  const requalification = transaction === 'refinance'
  const penaltyApplies = transaction === 'refinance'
  const remaining = remainingTermMonths(row.maturityDate, todayYMD)

  const base = {
    transaction,
    productClass,
    ltv,
    requalification,
    penaltyApplies,
    remainingMonths: remaining,
  }
  // Filled in as the schedule is reconstructed; every exit path carries the
  // current values so a blocked analysis still shows what was established.
  const schedule: {
    monthsElapsed: number | null
    remainingAmortizationMonths: number | null
    reconciliation: BalanceReconciliation | null
  } = { monthsElapsed: null, remainingAmortizationMonths: null, reconciliation: null }

  const blocked = (bucket: 'insufficient' | 'review', blockReason: string, ltvBlocked = false): FoxAnalysis => ({
    currentPayment: null,
    newPayment: null,
    monthlyDelta: null,
    monthlySaving: null,
    comparable,
    penalty: null,
    breakEvenMonths: null,
    netBenefit: null,
    bucket,
    horizonMonths: null,
    blockReason,
    ltvBlocked,
    ...base,
    ...schedule,
  })
  const insufficient = (blockReason: string, ltvBlocked = false): FoxAnalysis =>
    blocked('insufficient', blockReason, ltvBlocked)

  if (!isAnalyzable(row)) return insufficient('Not analyzable (placeholder, missing rate, or parse failure).')

  const balance = row.balance!
  const rate = row.rate!

  // The stated current payment reconstructs the ORIGINAL schedule. That needs
  // the original amount and the start date; without them no payment can be
  // stated or reconciled, and an unverifiable payment is never stated.
  if (row.amount == null || row.amount <= 1) {
    return insufficient('Original mortgage amount is not in the export; the current payment cannot be stated or reconciled.')
  }
  if (row.startDate == null) {
    return insufficient('Mortgage start date is not in the export; the schedule cannot be reconciled.')
  }
  const originalAmort = amortFor(row)
  const elapsed = monthsElapsed(row.startDate, todayYMD)
  const remainingAmort = originalAmort - elapsed
  schedule.monthsElapsed = elapsed
  schedule.remainingAmortizationMonths = remainingAmort > 0 ? remainingAmort : null
  if (remainingAmort <= 0) {
    return insufficient('The export dates say the amortization is already exhausted; the record needs grooming before analysis.')
  }

  // The reconciliation gate runs BEFORE any conclusion that leans on the
  // balance (the LTV block included): a balance that does not reconcile makes
  // every downstream claim undefendable. The joint check also validates an
  // assumed amortization — a wrong assumption presents as drift and blocks.
  const recon = reconcileBalance(row.amount, rate, originalAmort, elapsed, balance)
  schedule.reconciliation = recon
  if (!recon.ok) {
    const fmt = (n: number) => '$' + Math.round(n).toLocaleString('en-CA')
    return blocked(
      'review',
      `The export balance does not reconcile with the mortgage schedule: modeled ${fmt(recon.modeledBalance)} from origination vs ${fmt(recon.feedBalance)} in the export (${recon.driftPct.toFixed(2)}% drift). A prepayment, a payment change, or bad vendor data can all cause this. Confirm the true figures with the lender before any number is stated.`,
    )
  }

  // A refinance needs a computable LTV; missing/implausible value is a data gap,
  // never analyzed optimistically.
  if (transaction === 'refinance' && ltv === null) {
    return insufficient('Cannot compute LTV (estimated home value is missing or implausible); a refinance cannot be assessed.')
  }
  // The 80% LTV cap is a hard block for a refinance, not a warning.
  if (transaction === 'refinance' && ltv !== null && ltv > MAX_REFI_LTV) {
    return insufficient(`Above the ${MAX_REFI_LTV}% LTV cap for a refinance (${ltv}%); the client cannot refinance regardless of the savings.`, true)
  }
  if (comparable == null) {
    return insufficient(
      `No eligible ${productClass ?? ''} comparable is approved for this ${transaction}.`.replace('  ', ' '),
    )
  }

  // The client's actual payment: the original amount over the original
  // amortization. NEVER the current balance re-amortized over the original
  // period — that understates a seasoned mortgage's payment.
  const currentPayment = monthlyPayment(row.amount, rate, 'semi-annually', originalAmort)
  // The new payment prices the current balance over the amortization the
  // client actually has LEFT. Because the gate above proved the balance sits
  // on the original schedule, payment(balance, current rate, remaining) equals
  // currentPayment (within the drift bound), so subtracting currentPayment IS
  // the rate-isolated delta at the remaining amortization.
  const newPayment = monthlyPayment(balance, comparable.rate, 'semi-annually', remainingAmort)
  const monthlyDelta = newPayment - currentPayment
  const monthlySaving = monthlyDelta < 0 ? -monthlyDelta : 0
  // Penalty only for a break (refinance); a switch at maturity has none.
  // For a FIXED break the true penalty is the GREATER of three months' interest
  // and the interest-rate differential (IRD). The card and the client PDF STATE
  // that framing, but the BUCKET math uses the 3MI floor, not a computed IRD:
  // an accurate IRD needs the lender's own comparison rate for the remaining
  // term (its posted rate, not the best market rate), which the portal does not
  // have. Approximating IRD from the best comparable overstates it badly (it
  // maximises the differential) and would flip genuine calls to stay-put — a
  // worse error on a call-priority list than a slightly optimistic act-now,
  // which Michael confirms on the call. So 3MI is the floor and the IRD caveat
  // is disclosed, never guessed into the number.
  const penalty = penaltyApplies ? penaltyEstimate(balance, rate, row.rateType, methodologyKnown) : null
  const penaltyForMath = penalty?.estimateForMath ?? 0
  // Horizon: a break saves over the months LEFT on the current term (before the
  // client would have renewed anyway); a switch saves over the NEW term.
  const horizon =
    transaction === 'switch'
      ? comparable.termMonths || 60
      : remaining != null && remaining > 0
        ? remaining
        : 12
  const netBenefit = monthlySaving * horizon - penaltyForMath
  const breakEvenMonths = monthlySaving > 0 && penaltyForMath > 0 ? penaltyForMath / monthlySaving : null

  let bucket: OppBucket
  if (netBenefit > MARGINAL_BAND) bucket = 'act_now'
  else if (netBenefit < -MARGINAL_BAND) bucket = 'stay_put'
  else bucket = 'marginal'

  return {
    currentPayment,
    newPayment,
    monthlyDelta,
    monthlySaving,
    comparable,
    penalty,
    breakEvenMonths,
    netBenefit,
    horizonMonths: horizon,
    blockReason: null,
    ltvBlocked: false,
    ...base,
    ...schedule,
    bucket,
  }
}

// ─── Upload delta (month over month) ────────────────────────────────────────
export interface UploadDelta {
  newOpportunities: string[] // household ids present now, absent before
  improved: string[] // savings potential grew
  resolved: string[] // savings potential shrank materially
  departed: string[] // present before, absent now (client left the export)
}

export function diffUploads(prev: SmmParsedRow[], curr: SmmParsedRow[]): UploadDelta {
  const prevById = new Map(prev.map(r => [r.householdId, r]))
  const currById = new Map(curr.map(r => [r.householdId, r]))
  const newOpportunities: string[] = []
  const improved: string[] = []
  const resolved: string[] = []
  const departed: string[] = []
  for (const id of Array.from(currById.keys())) {
    const c = currById.get(id)!
    const p = prevById.get(id)
    if (!p) {
      newOpportunities.push(id)
      continue
    }
    const cs = c.savingsPotential ?? 0
    const ps = p.savingsPotential ?? 0
    if (cs > ps + 50) improved.push(id)
    else if (cs < ps - 50) resolved.push(id)
  }
  for (const id of Array.from(prevById.keys())) if (!currById.has(id)) departed.push(id)
  return { newOpportunities, improved, resolved, departed }
}
