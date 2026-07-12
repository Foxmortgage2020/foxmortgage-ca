// The Renewal Radar model — pure functions, no I/O, no clock read (callers
// pass todayYMD). Unit-tested in tests/renewals.test.ts. This is the single
// source of truth for how a funded deal's maturity places it in a bucket, how
// the payment-shock preview is computed, and which enumerated status actions
// map to which (valid) Zoho fields. Every figure it produces carries its
// basis; nothing here estimates a rate or invents a maturity.

import { monthlyPayment } from '@/lib/mortgage-engine'
import { evaluateQuote } from '@/lib/eligibility'

// ── The deal shape the renewals surface consumes (normalized from Zoho) ──────
export interface RenewalDeal {
  id: string
  dealName: string
  contactName: string | null
  amount: number
  maturityDate: string | null // YYYY-MM-DD; null means the missing-maturity block
  mortgageRate: number | null
  rateType: string | null // Fixed | Variable | Adjustable
  termYears: number | null // Term_Years — stored as MONTHS by convention (60 = 5 yr)
  amortizationYears: number | null // Amortization_Years — mixed units live, not used for the calc
  paymentAmount: number | null // stored current payment where recorded
  renewalStatus: string | null // Renewal_Status picklist
  renewalInProgress: boolean
  renewalOptedOut: boolean
  lenderName: string | null
}

export type RenewalBucket = 'lapsed' | 'action' | 'monitoring' | 'watching' | 'resolved'

// Window edges, in days to maturity. The 120-day rate-hold window opens inside
// the action window; monitoring is where the Strategic Mortgage Monitoring
// drip should be running.
export const RENEWAL_ACTION_DAYS = 130
export const RENEWAL_MONITORING_DAYS = 150

// Terminal Renewal_Status values (the Resolved bucket). The live picklist has
// no "retained/won" value — a real schema gap reported this session.
export const RESOLVED_STATUSES = ['Renewed Elsewhere', 'No Longer Needs Mortgage'] as const

export function daysToMaturity(maturityYMD: string, todayYMD: string): number {
  const [ay, am, ad] = maturityYMD.slice(0, 10).split('-').map(Number)
  const [by, bm, bd] = todayYMD.split('-').map(Number)
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86_400_000)
}

export function isResolved(d: RenewalDeal): boolean {
  return (
    d.renewalOptedOut ||
    (d.renewalStatus != null && (RESOLVED_STATUSES as readonly string[]).includes(d.renewalStatus))
  )
}

// A matured deal with no recorded outcome — the red alarm inside Lapsed.
export function hasNoOutcome(d: RenewalDeal): boolean {
  return d.renewalStatus == null || d.renewalStatus === '-None-'
}

export function bucketFor(d: RenewalDeal, todayYMD: string): RenewalBucket {
  if (isResolved(d)) return 'resolved'
  if (!d.maturityDate) return 'watching' // missing maturity is handled as its own block, never here
  const days = daysToMaturity(d.maturityDate, todayYMD)
  if (days < 0) return 'lapsed'
  if (days <= RENEWAL_ACTION_DAYS) return 'action'
  if (days <= RENEWAL_MONITORING_DAYS) return 'monitoring'
  return 'watching'
}

export interface BucketView {
  bucket: RenewalBucket
  deals: RenewalDeal[]
  count: number
  volume: number
}

// Group into the five buckets. Lapsed sorts by amount descending (the money
// matters); every other bucket sorts by maturity ascending (soonest first).
export function bucketRenewals(
  deals: RenewalDeal[],
  todayYMD: string,
): Record<RenewalBucket, BucketView> {
  const groups: Record<RenewalBucket, RenewalDeal[]> = {
    lapsed: [],
    action: [],
    monitoring: [],
    watching: [],
    resolved: [],
  }
  for (const d of deals) {
    if (!d.maturityDate) continue // missing-maturity deals never enter a window bucket
    groups[bucketFor(d, todayYMD)].push(d)
  }
  groups.lapsed.sort((a, b) => b.amount - a.amount)
  for (const k of ['action', 'monitoring', 'watching', 'resolved'] as const) {
    groups[k].sort((a, b) => (a.maturityDate ?? '').localeCompare(b.maturityDate ?? ''))
  }
  const out = {} as Record<RenewalBucket, BucketView>
  for (const k of Object.keys(groups) as RenewalBucket[]) {
    out[k] = {
      bucket: k,
      deals: groups[k],
      count: groups[k].length,
      volume: groups[k].reduce((s, d) => s + d.amount, 0),
    }
  }
  return out
}

// ── Renewal book KPI — the number the practice has never seen ────────────────
export interface Money {
  count: number
  volume: number
}
export interface RenewalBook {
  underManagement: Money // funded, not yet matured, not resolved
  maturingNext12: Money // matures within 365 days
  lapsed: Money // matured, not resolved
}

export function renewalBook(deals: RenewalDeal[], todayYMD: string): RenewalBook {
  const active = deals.filter(d => d.maturityDate && !isResolved(d))
  const notMatured = active.filter(d => daysToMaturity(d.maturityDate!, todayYMD) >= 0)
  const next12 = notMatured.filter(d => daysToMaturity(d.maturityDate!, todayYMD) <= 365)
  const lapsed = active.filter(d => daysToMaturity(d.maturityDate!, todayYMD) < 0)
  const money = (arr: RenewalDeal[]): Money => ({
    count: arr.length,
    volume: arr.reduce((s, d) => s + d.amount, 0),
  })
  return { underManagement: money(notMatured), maturingNext12: money(next12), lapsed: money(lapsed) }
}

// ── Payment-shock preview ────────────────────────────────────────────────────
// The whole reason a client answers the phone. Same amortization on both sides
// isolates the rate effect; both figures carry their source. Amortization_Years
// is mixed-unit garbage live, so a stated standard 25-year amortization is used,
// not the stored field. Where the current rate is not on file, no delta is
// computed — it says so rather than estimating.
export const RENEWAL_AMORT_YEARS = 25

export interface ApprovedRate {
  rate: number
  asOf: string | null // sheet date
  termMonths: number
}

export interface PaymentShock {
  currentRate: number | null
  currentRateKnown: boolean
  newRate: number | null
  newRateAsOf: string | null
  newRateTermMonths: number | null
  amortYears: number // the stated assumption
  balance: number // original loan amount (labeled)
  currentPayment: number | null
  newPayment: number | null
  monthlyDelta: number | null // newPayment - currentPayment (positive = payment rises)
}

export function paymentShock(d: RenewalDeal, best: ApprovedRate | null): PaymentShock {
  const amortMonths = RENEWAL_AMORT_YEARS * 12
  const balance = d.amount
  const currentRate = d.mortgageRate
  const canBase = balance > 0
  const currentPayment =
    currentRate != null && canBase
      ? monthlyPayment(balance, currentRate, 'semi-annually', amortMonths)
      : null
  const newRate = best ? best.rate : null
  const newPayment =
    newRate != null && canBase ? monthlyPayment(balance, newRate, 'semi-annually', amortMonths) : null
  const monthlyDelta =
    currentPayment != null && newPayment != null ? newPayment - currentPayment : null
  return {
    currentRate,
    currentRateKnown: currentRate != null,
    newRate,
    newRateAsOf: best?.asOf ?? null,
    newRateTermMonths: best?.termMonths ?? null,
    amortYears: RENEWAL_AMORT_YEARS,
    balance,
    currentPayment,
    newPayment,
    monthlyDelta,
  }
}

// Best approved FIXED rate for the renewal benchmark, from the approved rate
// book (read server-side through the read-only role). Fixed only, so the quote
// carries a printed rate and no prime is needed. Prefers the given term
// (5-year = 60 months, the standard renewal), else the lowest approved fixed of
// any term. Test-portal slugs are excluded. Returns null when the book is empty
// so the card can say the rate is unavailable rather than invent one.
export interface ApprovedFixedQuote {
  rate: number | null
  rateType: string
  termMonths: number
  asOfDate: string | null
  status: string
  lenderSlug: string
  // Eligibility inputs (optional; derived from variant when absent). A renewal
  // is a switch, so the benchmark must exclude a lender that cannot lend in
  // Ontario (Kootenay/Coast Capital) and any restricted program an ordinary
  // borrower cannot access — the same live bug the Opportunities engine had.
  variant?: string | null
  programNotes?: string | null
  borrowerRequirement?: string | null
  clientCommitment?: string | null
  channelRequirement?: string | null
  transactionTypes?: string[] | null
  eligibilityUnknown?: boolean | null
  eligibilitySource?: string | null
}

/** Whether an approved fixed quote is an eligible renewal benchmark: a switch is
 * a transfer, so province-ineligible, restricted, and non-transfer-eligible
 * quotes are excluded. Province-unknown is allowed (this is Michael's internal
 * benchmark), the same as the Opportunities comparable. Insurance-class porting
 * is NOT applied: Zoho carries no insurance-class field for a funded deal, so
 * the benchmark uses the best eligible fixed across classes (documented gap). */
function renewalBenchmarkEligible(q: ApprovedFixedQuote): boolean {
  const v = evaluateQuote(
    {
      lenderSlug: q.lenderSlug,
      variant: q.variant ?? null,
      programNotes: q.programNotes ?? null,
      borrowerRequirement: (q.borrowerRequirement as any) ?? null,
      clientCommitment: (q.clientCommitment as any) ?? null,
      channelRequirement: (q.channelRequirement as any) ?? null,
      transactionTypes: (q.transactionTypes as any) ?? null,
      eligibilityUnknown: q.eligibilityUnknown ?? false,
      eligibilitySource: q.eligibilitySource ?? null,
    },
    'ON',
    { transaction: 'transfer' },
    null,
  )
  return v.category === 'eligible'
}

export function bestApprovedFixed(
  quotes: ApprovedFixedQuote[],
  preferredTermMonths = 60,
): ApprovedRate | null {
  const fixed = quotes.filter(
    q =>
      q.status === 'approved' &&
      q.rateType === 'fixed' &&
      q.rate != null &&
      q.rate > 0 &&
      // Every quoted rate must carry its sheet date; a dateless quote is never
      // the benchmark (it would show a rate and a payment with no provenance).
      q.asOfDate != null &&
      !q.lenderSlug.toLowerCase().includes('test') &&
      renewalBenchmarkEligible(q),
  )
  if (fixed.length === 0) return null
  const preferred = fixed.filter(q => q.termMonths === preferredTermMonths)
  const pool = preferred.length > 0 ? preferred : fixed
  const best = pool.reduce((a, b) => (b.rate! < a.rate! ? b : a))
  return { rate: best.rate!, asOf: best.asOfDate, termMonths: best.termMonths }
}

// ── Enumerated status actions → valid Zoho payloads ──────────────────────────
// The ONLY writes the renewal desk can make. The client sends a key from this
// map; the server looks the key up and writes exactly the mapped fields (no
// free text, no arbitrary field names, no client-supplied values). Every value
// is a real Renewal_Status picklist option or a boolean field.
export type RenewalActionKey =
  | 'contacted'
  | 'contacted_again'
  | 'in_discussion'
  | 'application_sent'
  | 'lost_elsewhere'
  | 'no_longer_needs'
  | 'unreachable'

export interface RenewalActionDef {
  key: RenewalActionKey
  label: string
  hint: string
  fields: Record<string, string | number | boolean | null>
  tone: 'go' | 'neutral' | 'stop'
}

export const RENEWAL_ACTIONS: Record<RenewalActionKey, RenewalActionDef> = {
  contacted: {
    key: 'contacted',
    label: 'Mark contacted',
    hint: 'First outreach made.',
    fields: { Renewal_Status: 'Attempted To Contact Once', Renewal_In_Progress: true },
    tone: 'go',
  },
  contacted_again: {
    key: 'contacted_again',
    label: 'Mark contacted again',
    hint: 'A second outreach attempt.',
    fields: { Renewal_Status: 'Attempted To Contact Twice', Renewal_In_Progress: true },
    tone: 'go',
  },
  in_discussion: {
    key: 'in_discussion',
    label: 'Mark in discussion',
    hint: 'The client is engaged. Zoho has no picklist term for this, so it sets the in-progress flag.',
    fields: { Renewal_In_Progress: true },
    tone: 'go',
  },
  application_sent: {
    key: 'application_sent',
    label: 'Mark application sent',
    hint: 'A renewal application is in.',
    fields: { Renewal_Status: 'Ready To Renew - Sent New Application', Renewal_In_Progress: true },
    tone: 'go',
  },
  lost_elsewhere: {
    key: 'lost_elsewhere',
    label: 'Lost: renewed elsewhere',
    hint: 'Renewed with the existing lender or through another agent.',
    fields: { Renewal_Status: 'Renewed Elsewhere', Renewal_In_Progress: false },
    tone: 'stop',
  },
  no_longer_needs: {
    key: 'no_longer_needs',
    label: 'Resolved: no longer needs',
    hint: 'Property sold or the mortgage was paid off.',
    fields: { Renewal_Status: 'No Longer Needs Mortgage', Renewal_In_Progress: false },
    tone: 'stop',
  },
  unreachable: {
    key: 'unreachable',
    label: 'Mark unreachable',
    hint: 'Three attempts made with no response.',
    fields: { Renewal_Status: 'Attempted To Contact Three Times', Renewal_In_Progress: false },
    tone: 'neutral',
  },
}

export function isRenewalActionKey(k: string): k is RenewalActionKey {
  return Object.prototype.hasOwnProperty.call(RENEWAL_ACTIONS, k)
}

// ── Term_Years: render with its true unit, flag anomalies (never fix) ────────
// Convention: Term_Years stores MONTHS (60 = 5 years). Live data is mixed —
// some records hold a plain year count (5) and at least one holds a 25-year
// amortization (300). Rendered honestly; the anomaly is reported, not corrected.
export function termYearsLabel(termYears: number | null): string {
  if (termYears == null) return 'term not on file'
  if (termYears % 12 === 0) return `${termYears} months (${termYears / 12} yr)`
  return `${termYears} months`
}

export function termAnomaly(termYears: number | null): string | null {
  if (termYears == null) return null
  if (termYears > 120) return `${termYears} is unusually long for a term, likely an amortization in the term field`
  if (termYears < 6) return `${termYears} is under six months as stored, likely a year count in a months field`
  return null
}
