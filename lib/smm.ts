// Strategic Mortgage Monitoring — parsing and the opportunity model. Pure
// functions, no I/O; unit-tested in tests/smm.test.ts against a SYNTHETIC
// fixture (never the real client export). Everything here is analysis on
// estimate-labeled monitored data; underwriting begins at application.
//
// The market-comparable rate and the per-lender penalty methodology come from
// the approved rate book and the knowledge base and are passed IN, so this
// module stays pure and testable without the workbench.

import { monthlyPayment } from '@/lib/mortgage-engine'
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
export type OppBucket = 'act_now' | 'marginal' | 'stay_put' | 'insufficient'

// Net benefit within this band of zero is "marginal" — worth watching, not
// worth a client's disruption.
export const MARGINAL_BAND = 1500

export interface Comparable {
  rate: number
  lender: string
  asOf: string | null // sheet date
  termMonths: number
  kind: 'fixed' | 'floating'
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

export interface FoxAnalysis {
  currentPayment: number | null
  newPayment: number | null
  monthlyDelta: number | null // new - current (negative = the client pays less)
  monthlySaving: number | null // -monthlyDelta when positive (dollars saved per month)
  comparable: Comparable | null
  penalty: PenaltyEstimate | null
  remainingMonths: number | null
  breakEvenMonths: number | null
  netBenefit: number | null // saving over remaining term minus penalty
  bucket: OppBucket
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

// Compute Fox's analysis. `comparable` is the best gate-approved comparable
// (fixed for fixed clients; the page also passes the floating alternative for
// variable clients but the primary net-benefit math uses the chosen one).
export function analyzeOpportunity(
  row: SmmParsedRow,
  comparable: Comparable | null,
  methodologyKnown: boolean,
  todayYMD: string,
): FoxAnalysis {
  if (!isAnalyzable(row) || comparable == null) {
    return {
      currentPayment: null,
      newPayment: null,
      monthlyDelta: null,
      monthlySaving: null,
      comparable,
      penalty: null,
      remainingMonths: remainingTermMonths(row.maturityDate, todayYMD),
      breakEvenMonths: null,
      netBenefit: null,
      bucket: 'insufficient',
    }
  }
  const balance = row.balance!
  const rate = row.rate!
  const amort = amortFor(row)
  const currentPayment = monthlyPayment(balance, rate, 'semi-annually', amort)
  const newPayment = monthlyPayment(balance, comparable.rate, 'semi-annually', amort)
  const monthlyDelta = newPayment - currentPayment
  const monthlySaving = monthlyDelta < 0 ? -monthlyDelta : 0
  const penalty = penaltyEstimate(balance, rate, row.rateType, methodologyKnown)
  const remaining = remainingTermMonths(row.maturityDate, todayYMD)
  // Net benefit over the remaining term: saving across the months left, minus
  // the cost of breaking now. If maturity is unknown, use a conservative 12
  // months so we never overstate.
  const horizon = remaining != null && remaining > 0 ? remaining : 12
  const netBenefit = monthlySaving * horizon - penalty.estimateForMath
  const breakEvenMonths = monthlySaving > 0 ? penalty.estimateForMath / monthlySaving : null

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
    remainingMonths: remaining,
    breakEvenMonths,
    netBenefit,
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
