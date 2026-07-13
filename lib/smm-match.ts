// SMM matching, Zoho backfill proposals, and lapsed-renewal reconciliation —
// pure functions, no I/O. The Zoho searches and the approved-quote read happen
// in the route/page; these functions decide from the results, so they are
// fully testable on synthetic data. Never proposes a write to a populated Zoho
// field; conflicts are listed for Michael, never resolved automatically.

import { normalizeLender } from '@/config/smm-lender-aliases'
import type { Comparable, SmmMortgage, TransactionKind } from '@/lib/smm'

// ─── Matching (email > phone > name) ────────────────────────────────────────
export interface ZohoContactLite {
  id: string
  fullName: string
  email: string | null
  phone: string | null
  mobile: string | null
}

export type MatchBucket = 'matched' | 'ambiguous' | 'unmatched'

export interface Match {
  bucket: MatchBucket
  contactId: string | null
  matchedBy: 'email' | 'phone' | 'name' | null
  candidates: ZohoContactLite[]
}

// Decide the match from the search hits, in descending confidence. A single
// hit is a match; multiple hits are ambiguous (Michael picks); none falls
// through to the next signal. LEAD/prospect rows generally reach 'unmatched',
// which is correct — they are not records yet.
export function decideMatch(hits: {
  email: ZohoContactLite[]
  phone: ZohoContactLite[]
  name: ZohoContactLite[]
}): Match {
  for (const by of ['email', 'phone', 'name'] as const) {
    const h = hits[by]
    if (h.length === 1) return { bucket: 'matched', contactId: h[0].id, matchedBy: by, candidates: [] }
    if (h.length > 1) return { bucket: 'ambiguous', contactId: null, matchedBy: by, candidates: h }
  }
  return { bucket: 'unmatched', contactId: null, matchedBy: null, candidates: [] }
}

// ─── Backfill proposals (empty-field fills only) ────────────────────────────
// The candidate backfill fields. Verified live in the Deals module
// (2026-07-12): Maturity_Date (date) and Mortgage_Rate (double) are writable
// SCALARS and can be filled from the export. Lender_Name EXISTS and is
// writable but is a LOOKUP (needs a lender-record id, not a string), so it is
// not proposed from the export string — reported as a known gap. The route
// passes only the scalar-writable set.
export const BACKFILL_FIELDS = ['Maturity_Date', 'Lender_Name', 'Mortgage_Rate'] as const
export type BackfillField = (typeof BACKFILL_FIELDS)[number]

// The subset the route may actually write (scalars only).
export const WRITABLE_SCALAR_BACKFILL_FIELDS: readonly string[] = ['Maturity_Date', 'Mortgage_Rate']

export interface ZohoDealFields {
  Maturity_Date: string | null
  Lender_Name: string | null
  Mortgage_Rate: number | null
}

export interface ExportFields {
  maturityDate: string | null
  lenderName: string | null // the export's raw lender string
  rate: number | null
}

export interface BackfillFill {
  field: BackfillField
  value: string | number
}
export interface FieldConflict {
  field: string
  zohoValue: string
  exportValue: string
}
export interface BackfillProposal {
  fills: BackfillFill[]
  conflicts: FieldConflict[]
}

function lendersDiffer(zoho: string, exp: string): boolean {
  const z = normalizeLender(zoho)
  const e = normalizeLender(exp)
  // Compare by canonical slug when both resolve, else by display.
  if (z.slug && e.slug) return z.slug !== e.slug
  return z.display.toLowerCase() !== e.display.toLowerCase()
}

// Propose fills only for EMPTY Zoho fields the export can fill; list conflicts
// (both present, materially different) separately with NO proposed value.
export function proposeBackfill(
  zoho: ZohoDealFields,
  exp: ExportFields,
  writable: ReadonlySet<string>,
): BackfillProposal {
  const fills: BackfillFill[] = []
  const conflicts: FieldConflict[] = []

  // Maturity_Date
  if (writable.has('Maturity_Date')) {
    if (!zoho.Maturity_Date && exp.maturityDate) fills.push({ field: 'Maturity_Date', value: exp.maturityDate })
    else if (zoho.Maturity_Date && exp.maturityDate && zoho.Maturity_Date.slice(0, 10) !== exp.maturityDate.slice(0, 10))
      conflicts.push({ field: 'Maturity_Date', zohoValue: zoho.Maturity_Date.slice(0, 10), exportValue: exp.maturityDate.slice(0, 10) })
  }
  // Lender_Name
  if (writable.has('Lender_Name')) {
    if (!zoho.Lender_Name && exp.lenderName) fills.push({ field: 'Lender_Name', value: normalizeLender(exp.lenderName).display })
    else if (zoho.Lender_Name && exp.lenderName && lendersDiffer(zoho.Lender_Name, exp.lenderName))
      conflicts.push({ field: 'Lender_Name', zohoValue: zoho.Lender_Name, exportValue: normalizeLender(exp.lenderName).display })
  }
  // Mortgage_Rate (material threshold 0.1%)
  if (writable.has('Mortgage_Rate')) {
    if (zoho.Mortgage_Rate == null && exp.rate != null) fills.push({ field: 'Mortgage_Rate', value: exp.rate })
    else if (zoho.Mortgage_Rate != null && exp.rate != null && Math.abs(zoho.Mortgage_Rate - exp.rate) > 0.1)
      conflicts.push({ field: 'Mortgage_Rate', zohoValue: `${zoho.Mortgage_Rate}%`, exportValue: `${exp.rate}%` })
  }
  return { fills, conflicts }
}

// ─── Lapsed-renewal reconciliation ──────────────────────────────────────────
export type ReconClass = 'still_with_lender' | 'lender_changed' | 'unmonitored'

export interface Reconciliation {
  reconClass: ReconClass
  recoverable: boolean
  zohoLender: string | null
  exportLender: string | null
  conflicts: FieldConflict[]
  note: string
}

// Compare Zoho's last-known position for a lapsed renewal against the export's
// current position. Still-with-original-lender is recoverable (an automatic
// lender renewal to unwind); lender-changed means the client moved and the
// system cannot tell if the deal was won or lost; unmonitored means the export
// knows nothing.
export function reconcileLapsed(
  zoho: { lender: string | null; rate: number | null; maturity: string | null },
  exp: SmmMortgage | null,
): Reconciliation {
  if (!exp) {
    return {
      reconClass: 'unmonitored',
      recoverable: false,
      zohoLender: zoho.lender,
      exportLender: null,
      conflicts: [],
      note: 'Not in the export. Unmonitored, so nothing is known: enroll or investigate.',
    }
  }
  const conflicts: FieldConflict[] = []
  const p = exp.primary
  if (zoho.rate != null && p.rate != null && Math.abs(zoho.rate - p.rate) > 0.1) {
    conflicts.push({ field: 'rate', zohoValue: `${zoho.rate}%`, exportValue: `${p.rate}%` })
  }
  if (zoho.maturity && p.maturityDate && zoho.maturity.slice(0, 10) !== p.maturityDate.slice(0, 10)) {
    conflicts.push({ field: 'maturity', zohoValue: zoho.maturity.slice(0, 10), exportValue: p.maturityDate.slice(0, 10) })
  }
  const exportLenderDisplay = normalizeLender(p.lenderRaw).display
  const changed = zoho.lender ? lendersDiffer(zoho.lender, p.lenderRaw) : Boolean(p.lenderRaw)
  if (changed) {
    return {
      reconClass: 'lender_changed',
      recoverable: false,
      zohoLender: zoho.lender,
      exportLender: exportLenderDisplay,
      conflicts,
      note: 'The lender changed since maturity. Whether Michael wrote the new deal or lost it cannot be told from the data; mark it retained or lost.',
    }
  }
  return {
    reconClass: 'still_with_lender',
    recoverable: true,
    zohoLender: zoho.lender,
    exportLender: exportLenderDisplay,
    conflicts,
    note: 'Still with the original lender past maturity: almost certainly an automatic lender renewal. Recoverable, and a high-value call.',
  }
}

// Index the export's mortgages by every borrower name, so a lapsed Zoho deal
// (which carries a contact name, not a household id) can be reconciled against
// the monitoring export in memory — no per-deal Zoho call. A name that maps to
// MORE THAN ONE household is marked ambiguous (null), so findExportByName
// returns null and the deal reconciles as 'unmonitored' rather than being
// confidently matched to the wrong household and driving a wrong call
// recommendation. A unique name resolves to its one mortgage.
export function indexMortgagesByName(mortgages: SmmMortgage[]): Map<string, SmmMortgage | null> {
  const idx = new Map<string, SmmMortgage | null>()
  for (const m of mortgages) {
    for (const b of m.borrowers) {
      const key = `${b.firstName} ${b.lastName}`.trim().toLowerCase()
      if (!key) continue
      if (!idx.has(key)) idx.set(key, m)
      else if (idx.get(key) !== m) idx.set(key, null) // collision across households → ambiguous
    }
  }
  return idx
}

export function findExportByName(name: string | null, idx: Map<string, SmmMortgage | null>): SmmMortgage | null {
  if (!name) return null
  return idx.get(name.trim().toLowerCase()) ?? null
}

export interface RetentionSummary {
  total: number
  stillWithLender: number
  lenderChanged: number
  unmonitored: number
}
export function retentionSummary(recons: Reconciliation[]): RetentionSummary {
  return {
    total: recons.length,
    stillWithLender: recons.filter(r => r.reconClass === 'still_with_lender').length,
    lenderChanged: recons.filter(r => r.reconClass === 'lender_changed').length,
    unmonitored: recons.filter(r => r.reconClass === 'unmonitored').length,
  }
}

// A mortgage rate below this is not a real rate; it guards the computed floating
// effective rate against data-entry errors (a bad prime variance).
export const SANE_RATE_FLOOR = 0.5

// ─── Best gate-approved comparable (approved quotes only) ────────────────────
export interface BookQuote {
  rate: number | null
  rateType: string // fixed | adjustable | variable
  termMonths: number
  productClass: string
  asOfDate: string | null
  status: string
  lenderSlug: string
  primeVariance: number | null
  // The workbench eligibility columns (for the eligible-comparable filter).
  // Optional so older callers/tests still typecheck; an ABSENT eligibilitySource
  // fail-closes to unclassified (excluded), matching a null column.
  borrowerRequirement?: string | null
  clientCommitment?: string | null
  channelRequirement?: string | null
  transactionTypes?: string[] | null
  eligibilityUnknown?: boolean | null
  eligibilitySource?: string | null
}

export function insuranceToProductClass(ins: string | null): string {
  const s = (ins ?? '').toLowerCase()
  if (s === 'insured') return 'insured'
  if (s === 'insurable') return 'insurable'
  return 'conventional' // Uninsurable and unknown map to conventional
}

// Lowest approved FIXED rate for the client's product class (falling back to
// any class with a stated assumption), carrying its sheet date. Approved-only,
// dated-only, test slugs excluded — the same discipline as the renewal
// benchmark. Server-safe (fixed rates are printed; no prime needed).
export function bestFixedComparable(
  quotes: BookQuote[],
  productClass: string,
  lenderName: (slug: string) => string,
  preferredTermMonths = 60,
): { comparable: Comparable | null; classAssumed: boolean } {
  const fixed = quotes.filter(
    q =>
      q.status === 'approved' &&
      q.rateType === 'fixed' &&
      q.rate != null &&
      q.rate > 0 &&
      q.asOfDate != null &&
      !q.lenderSlug.toLowerCase().includes('test'),
  )
  if (fixed.length === 0) return { comparable: null, classAssumed: false }
  let pool = fixed.filter(q => q.productClass === productClass)
  let classAssumed = false
  if (pool.length === 0) {
    pool = fixed
    classAssumed = true
  }
  const term = pool.filter(q => q.termMonths === preferredTermMonths)
  const chosen = (term.length > 0 ? term : pool).reduce((a, b) => (b.rate! < a.rate! ? b : a))
  return {
    comparable: {
      rate: chosen.rate!,
      lender: lenderName(chosen.lenderSlug),
      asOf: chosen.asOfDate,
      termMonths: chosen.termMonths,
      kind: 'fixed',
    },
    classAssumed,
  }
}

// Deepest approved floating discount (most negative prime variance) for the
// class, for context on a variable/adjustable client. The effective rate needs
// prime (a browser-token read), so this returns the discount only.
export function bestFloatingDiscount(
  quotes: BookQuote[],
  productClass: string,
  lenderName: (slug: string) => string,
): { variance: number; lender: string; asOf: string | null } | null {
  const floating = quotes.filter(
    q =>
      q.status === 'approved' &&
      (q.rateType === 'adjustable' || q.rateType === 'variable') &&
      q.primeVariance != null &&
      q.asOfDate != null &&
      !q.lenderSlug.toLowerCase().includes('test'),
  )
  const pool = floating.filter(q => q.productClass === productClass)
  const use = pool.length > 0 ? pool : floating
  if (use.length === 0) return null
  const best = use.reduce((a, b) => (b.primeVariance! < a.primeVariance! ? b : a))
  return { variance: best.primeVariance!, lender: lenderName(best.lenderSlug), asOf: best.asOfDate }
}

// ─── Best ELIGIBLE comparable (province + program + transaction filtered) ────
// The comparable a monitored client can genuinely have: province-eligible (BC
// credit unions excluded), unrestricted for an ordinary borrower (physician /
// bundle / channel / undisclosed-restriction rows excluded — fail-closed), and
// valid for the transaction (a refinance never sees a purchase-only promo). It
// weighs fixed (printed rate) AND floating (effective = prime + variance,
// priced with the server prime mirror) and picks the lowest effective rate, so
// an adjustable client sees the real adjustable best, not a worse fixed. Class
// is HARD, never assumed: a refinance compares only against `productClass`
// quotes; if none exist the comparable is null (honest), never a wrong-class rate.
export function bestEligibleComparable(
  quotes: BookQuote[],
  productClass: string,
  transaction: TransactionKind,
  lenderName: (slug: string) => string,
  primeFor: (slug: string) => number,
  isEligible: (q: BookQuote, transaction: TransactionKind) => boolean,
  preferredTermMonths = 60,
): Comparable | null {
  const priced = quotes
    .filter(
      q =>
        q.status === 'approved' &&
        q.productClass === productClass && // HARD class match — never assumed
        q.asOfDate != null &&
        !q.lenderSlug.toLowerCase().includes('test') &&
        isEligible(q, transaction),
    )
    .map(q => {
      const isFloating = q.rateType === 'adjustable' || q.rateType === 'variable'
      let eff: number | null = null
      let variance: number | null = null
      let primeUsed: number | null = null
      if (q.rateType === 'fixed' && q.rate != null && q.rate > 0) {
        eff = q.rate
      } else if (isFloating && q.rate != null && q.rate > 0) {
        // A floating sheet that printed its own rate: prefer the printed figure
        // (consistent with the rest of the app), and carry the variance for the
        // label without recomputing.
        eff = q.rate
        variance = q.primeVariance
      } else if (isFloating && q.primeVariance != null) {
        primeUsed = primeFor(q.lenderSlug)
        variance = q.primeVariance
        eff = Math.round((primeUsed + q.primeVariance) * 100) / 100
      }
      return { q, eff, variance, primeUsed, isFloating }
    })
    // A comparable rate below a sane floor (a data-entry slip like variance
    // -5.0 -> effective -0.55) is discarded, never chosen as "best": it would
    // otherwise win the lowest-rate reduce and produce a negative payment.
    .filter((x): x is { q: BookQuote; eff: number; variance: number | null; primeUsed: number | null; isFloating: boolean } => x.eff != null && x.eff >= SANE_RATE_FLOOR)
  if (priced.length === 0) return null
  const term = priced.filter(x => x.q.termMonths === preferredTermMonths)
  const chosen = (term.length > 0 ? term : priced).reduce((a, b) => (b.eff < a.eff ? b : a))
  return {
    rate: chosen.eff,
    lender: lenderName(chosen.q.lenderSlug),
    lenderSlug: chosen.q.lenderSlug,
    asOf: chosen.q.asOfDate,
    termMonths: chosen.q.termMonths,
    kind: chosen.isFloating ? 'floating' : 'fixed',
    variance: chosen.variance,
    primeUsed: chosen.primeUsed,
    rateType: chosen.q.rateType,
  }
}
