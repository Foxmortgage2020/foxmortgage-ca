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

// 'shared_identity': the Zoho hits resolve ONE contact, but more than one
// mortgage in the export carries the identity signal, so the contact cannot be
// bound to a single mortgage. A match is a (contact, mortgage) PAIR — a
// contact alone is not a match when two mortgages claim it (the shared-email
// backfill collision: both mortgages would propose different values into the
// same record).
export type MatchBucket = 'matched' | 'shared_identity' | 'ambiguous' | 'unmatched'

export interface Match {
  bucket: MatchBucket
  contactId: string | null
  matchedBy: 'email' | 'phone' | 'name' | null
  candidates: ZohoContactLite[]
  /** How many export mortgages share this mortgage's identity signals (email,
   * phone, or borrower name); 1 means the contact binding is unique. */
  exportClaimants: number
}

// ─── Export-side identity sharing ────────────────────────────────────────────
// One person holding two mortgages carries the same email (and usually the
// same phone and name) on both export rows. Any contact matched through a
// shared signal is claimed by every one of those mortgages, so the claimant
// set is computed BEFORE a match can be called unique. Signals are the union
// over every borrower on the mortgage (a co-borrower's email claims too).
function phoneKey(p: string): string {
  const digits = p.replace(/\D+/g, '')
  return digits.length >= 7 ? digits.slice(-10) : ''
}

function identitySignals(m: SmmMortgage): Set<string> {
  const s = new Set<string>()
  for (const b of m.borrowers) {
    const email = b.email.trim().toLowerCase()
    if (email) s.add(`e:${email}`)
    const phone = phoneKey(b.phone ?? '')
    if (phone) s.add(`p:${phone}`)
    const name = `${b.firstName} ${b.lastName}`.trim().toLowerCase()
    if (name) s.add(`n:${name}`)
  }
  return s
}

/** Every mortgage in the export that shares an identity signal with this one
 * (itself included). More than one claimant means a Zoho contact match cannot
 * name the mortgage without deal-level evidence. */
export function identityClaimants(m: SmmMortgage, all: SmmMortgage[]): SmmMortgage[] {
  const mine = identitySignals(m)
  return all.filter(o => {
    if (o === m) return true
    const theirs = identitySignals(o)
    for (const sig of Array.from(mine)) if (theirs.has(sig)) return true
    return false
  })
}

// Decide the match from the search hits, in descending confidence. A single
// hit is a match ONLY when the export-side claimant count is 1 — an identity
// signal mapping to more than one mortgage in the export is ambiguous by
// definition, and resolves to 'shared_identity' (the contact is known, the
// mortgage is not; deal-level disambiguation or Michael decides). Multiple
// hits are ambiguous (Michael picks); none falls through to the next signal.
// LEAD/prospect rows generally reach 'unmatched', which is correct — they are
// not records yet.
export function decideMatch(
  hits: {
    email: ZohoContactLite[]
    phone: ZohoContactLite[]
    name: ZohoContactLite[]
  },
  exportClaimants: number,
): Match {
  for (const by of ['email', 'phone', 'name'] as const) {
    const h = hits[by]
    if (h.length === 1) {
      if (exportClaimants > 1)
        return { bucket: 'shared_identity', contactId: h[0].id, matchedBy: by, candidates: [], exportClaimants }
      return { bucket: 'matched', contactId: h[0].id, matchedBy: by, candidates: [], exportClaimants }
    }
    if (h.length > 1) return { bucket: 'ambiguous', contactId: null, matchedBy: by, candidates: h, exportClaimants }
  }
  return { bucket: 'unmatched', contactId: null, matchedBy: null, candidates: [], exportClaimants }
}

// ─── Deal-level disambiguation for shared identities ────────────────────────
// When one contact is claimed by several mortgages, its deals are attributed
// by evidence: the property address first (the address defines the mortgage in
// this export), the amount second. A deal that no claimant — or more than one
// claimant — matches is CONTESTED and is never proposed into; it goes to a
// needs-manual-match card and Michael picks.
export interface DealEvidence {
  id: string
  street: string | null
  city: string | null
  amount: number | null
}

// Conservative address key: house number + first street token ("22 Cardigan
// St, Guelph" and "22 Cardigan Street" both key "22 cardigan"). Anything not
// leading with a house number keys as the full normalized line, so it only
// matches on effective equality.
export function addressKey(s: string | null): string | null {
  if (!s) return null
  const norm = s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!norm) return null
  const toks = norm.split(' ')
  if (toks.length >= 2 && /^\d+[a-z]?$/.test(toks[0])) return `${toks[0]} ${toks[1]}`
  return norm
}

const AMOUNT_MATCH_TOLERANCE = 0.01 // 1% covers rounding, never a different mortgage

function amountMatches(dealAmount: number | null, mortgageAmount: number | null): boolean {
  if (dealAmount == null || mortgageAmount == null || mortgageAmount <= 0) return false
  return Math.abs(dealAmount - mortgageAmount) <= AMOUNT_MATCH_TOLERANCE * mortgageAmount
}

/** Attribute each deal to the ONE claimant whose evidence matches it, or null
 * when contested (matched by several) or unmatched (matched by none). Address
 * evidence outranks amount; a deal two mortgages both claim is never
 * attributed. Keyed by deal id; values are household ids. */
export function attributeDeals(claimants: SmmMortgage[], deals: DealEvidence[]): Map<string, string | null> {
  const out = new Map<string, string | null>()
  for (const d of deals) {
    const dealAddr = addressKey(d.street)
    const byAddress = dealAddr ? claimants.filter(c => addressKey(c.primary.address) === dealAddr) : []
    if (byAddress.length === 1) {
      out.set(d.id, byAddress[0].primary.householdId)
      continue
    }
    if (byAddress.length > 1) {
      out.set(d.id, null) // two mortgages claim the same address: contested
      continue
    }
    const byAmount = claimants.filter(c => amountMatches(d.amount, c.primary.amount))
    out.set(d.id, byAmount.length === 1 ? byAmount[0].primary.householdId : null)
  }
  return out
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

// ─── Appears-renewed detection ───────────────────────────────────────────────
// The CRM never hears about some renewals: the feed shows a NEW mortgage (a
// start date materially later than the Zoho deal's closing date, or a lender
// or rate that contradicts the recorded terms) while the deal still sits on
// the radar as a call. Such a file is APPEARS_RENEWED: suppressed from every
// action pool pending Michael's confirmation, never deleted. The tolerance
// absorbs the normal closing-to-first-payment offset (weeks); a renewal is
// years later.
export const RENEWAL_START_TOLERANCE_DAYS = 90

function daysBetweenYMD(aYMD: string, bYMD: string): number {
  const [ay, am, ad] = aYMD.slice(0, 10).split('-').map(Number)
  const [by, bm, bd] = bYMD.slice(0, 10).split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

export type AppearsRenewedSignal = 'start_after_close' | 'lender_changed' | 'rate_changed'

export interface AppearsRenewedEvidence {
  signals: AppearsRenewedSignal[]
  feed: { startDate: string | null; lender: string; rate: number | null; amount: number | null; maturity: string | null }
  zoho: { closingDate: string | null; lender: string | null; rate: number | null; maturity: string | null }
}

/** Compare a Zoho deal's recorded terms against the matched feed mortgage.
 * Returns the evidence when the feed says the client renewed since the deal
 * closed, else null. Conservative: missing data on either side of a signal
 * means that signal cannot fire. */
export function detectAppearsRenewed(
  zoho: { closingDate: string | null; lender: string | null; rate: number | null; maturity: string | null },
  m: SmmMortgage,
): AppearsRenewedEvidence | null {
  const p = m.primary
  const signals: AppearsRenewedSignal[] = []
  if (zoho.closingDate && p.startDate && daysBetweenYMD(zoho.closingDate, p.startDate) > RENEWAL_START_TOLERANCE_DAYS) {
    signals.push('start_after_close')
  }
  if (zoho.lender && p.lenderRaw && lendersDiffer(zoho.lender, p.lenderRaw)) {
    signals.push('lender_changed')
  }
  // Rate contradiction is a FIXED-rate signal only: a floating client's feed
  // rate legitimately moves with prime while Zoho stores the origination
  // rate, so a prime move must never flag the whole floating book.
  if (
    zoho.rate != null &&
    p.rate != null &&
    (p.rateType ?? '').toLowerCase() === 'fixed' &&
    Math.abs(zoho.rate - p.rate) > 0.1
  ) {
    signals.push('rate_changed')
  }
  if (signals.length === 0) return null
  return {
    signals,
    feed: { startDate: p.startDate, lender: normalizeLender(p.lenderRaw).display, rate: p.rate, amount: p.amount, maturity: p.maturityDate },
    zoho: { closingDate: zoho.closingDate, lender: zoho.lender, rate: zoho.rate, maturity: zoho.maturity },
  }
}

/** The identity of one appears-renewed EVIDENCE state. A decline clears the
 * flag for this evidence only: when the feed later changes (a real renewal
 * after a dismissed false positive), the key changes and the flag returns. */
export function appearsRenewedEvidenceKey(ev: AppearsRenewedEvidence): string {
  return [ev.feed.startDate ?? '', ev.feed.lender, ev.feed.rate ?? '', ev.feed.maturity ?? ''].join('|')
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

// NOTE: bestFloatingDiscount (deepest approved floating discount by variance)
// was deleted here. It had no callers, and ranking floating quotes on the
// variance is exactly the defect the effective-rate convention forbids: prime
// is per-lender (Kootenay PLR 5.50 vs bank prime 4.45), so the deepest
// discount is not the lowest rate. prime_variance is display, never sort order.

// ─── Best ELIGIBLE comparable (province + program + transaction filtered) ────
// The comparable a monitored client can genuinely have: province-eligible (BC
// credit unions excluded), unrestricted for an ordinary borrower (physician /
// bundle / channel / undisclosed-restriction rows excluded — fail-closed), and
// valid for the transaction (a refinance never sees a purchase-only promo).
// `rateFamilies` is the like-for-like gate: the DEFAULT comparable is the
// client's own rate family (fixed client → fixed; adjustable → adjustable;
// variable → variable; adjustable and variable are NEVER collapsed — an ARM
// payment moves with prime, a VRM payment holds). A cross-family option is a
// separate call with the other families, presented as a labelled alternative,
// never the headline. Within the families, floating quotes rank on the
// EFFECTIVE rate computed from the per-lender prime (Kootenay PLR 5.50 vs bank
// prime 4.45); prime_variance is display, never sort order. Class is HARD,
// never assumed: a refinance compares only against `productClass` quotes; if
// none exist the comparable is null (honest), never a wrong-class rate.
export function bestEligibleComparable(
  quotes: BookQuote[],
  productClass: string,
  transaction: TransactionKind,
  lenderName: (slug: string) => string,
  primeFor: (slug: string) => number,
  isEligible: (q: BookQuote, transaction: TransactionKind) => boolean,
  rateFamilies: readonly string[],
  preferredTermMonths = 60,
): Comparable | null {
  const ranked = eligibleComparablesRanked(
    quotes,
    productClass,
    transaction,
    lenderName,
    primeFor,
    isEligible,
    rateFamilies,
    preferredTermMonths,
  )
  return ranked[0] ?? null
}

/** Every eligible comparable, priced and ranked (preferred-term rows first,
 * then the rest, each group by effective rate ascending). bestEligible-
 * Comparable is [0]; the override picker shows the head of this list. */
export function eligibleComparablesRanked(
  quotes: BookQuote[],
  productClass: string,
  transaction: TransactionKind,
  lenderName: (slug: string) => string,
  primeFor: (slug: string) => number,
  isEligible: (q: BookQuote, transaction: TransactionKind) => boolean,
  rateFamilies: readonly string[],
  preferredTermMonths = 60,
): Comparable[] {
  const priced = quotes
    .filter(
      q =>
        q.status === 'approved' &&
        q.productClass === productClass && // HARD class match — never assumed
        rateFamilies.includes(q.rateType) && // like-for-like, exact rate type
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
    // otherwise win the lowest-rate sort and produce a negative payment.
    .filter((x): x is { q: BookQuote; eff: number; variance: number | null; primeUsed: number | null; isFloating: boolean } => x.eff != null && x.eff >= SANE_RATE_FLOOR)
  const toComparable = (x: (typeof priced)[number]): Comparable => ({
    rate: x.eff,
    lender: lenderName(x.q.lenderSlug),
    lenderSlug: x.q.lenderSlug,
    asOf: x.q.asOfDate,
    termMonths: x.q.termMonths,
    kind: x.isFloating ? 'floating' : 'fixed',
    variance: x.variance,
    primeUsed: x.primeUsed,
    rateType: x.q.rateType,
  })
  const preferred = priced.filter(x => x.q.termMonths === preferredTermMonths).sort((a, b) => a.eff - b.eff)
  const rest = priced.filter(x => x.q.termMonths !== preferredTermMonths).sort((a, b) => a.eff - b.eff)
  return [...preferred, ...rest].map(toComparable)
}
