// Committed terms — the pure layer (2026-08-04).
//
// A lender commitment's economic terms, extracted one row per field into the
// workbench's `commitment_terms` and held at `gate_status = 'pending'` until a
// human approves the set. This module holds the row shape, the read
// projection, and every rule the card renders by. It imports nothing from
// next/*, Clerk, or the fetch layer, so both lib/underwriting.ts (the read) and
// the client card can consume it, and the rules can be unit-tested without a
// database. Same split as lib/tasks-shape.ts.
//
// THREE RULES, and they are the whole point of the surface:
//
//   1. THE PRINTED STRING IS THE VALUE. What Michael approves is evidence, not
//      a summary. Every row renders `printed` — the token as the document
//      printed it. `value_numeric` is the machine's parse and is NEVER
//      rendered anywhere: a figure with no visible source is a figure he
//      cannot check, and a resolved figure standing in for a printed one hides
//      the exact disagreement the gate exists to catch.
//   2. A RESOLUTION IS SHOWN BESIDE THE PRINTED TOKEN, NEVER IN PLACE OF IT.
//      Where a row carries a date convention (the maturity case), the printed
//      token, the resolved date, the convention and the basis all render
//      together. Where a row carries a `value_text` that differs from the
//      printed string (the rate-type case: printed "Prime Lending Rate
//      - 0.85%", reads as "variable"), the reading renders as a secondary
//      line. The maturity is why this matters: the document printed
//      06/10/2031, the stored date is 2031-10-06, and read the other way round
//      the renewal moves by four months.
//   3. NOTHING IS DROPPED. An unrecognised field_key sorts last and still
//      renders — a term the portal has no label for is still a term the lender
//      committed to, and silently hiding it would be the worst failure this
//      surface could have.

// The read projection. Kept beside the row type so the two cannot drift.
export const COMMITMENT_TERM_SELECT =
  'id,document_id,field_key,value_text,value_numeric,printed,page,source_snippet,confidence,date_convention,date_convention_basis,extractor,gate_status,created_at,updated_at'

export interface CommitmentTermRow {
  id: string
  documentId: string
  fieldKey: string
  /** The document's own token. This is what renders. */
  printed: string | null
  /** A resolved reading (ISO date, classification). Renders BESIDE printed. */
  valueText: string | null
  /** The machine's parse. Carried for completeness; never rendered. */
  valueNumeric: number | null
  page: number | null
  sourceSnippet: string | null
  confidence: string | null
  dateConvention: string | null
  dateConventionBasis: string | null
  extractor: string | null
  gateStatus: string
  createdAt: string
}

// ── The ten fields, in the order a commitment is read ──────────────────────
// Order is CANONICAL, not the table's. A field the list does not name still
// renders (rule 3), sorted after these.
export const COMMITMENT_TERM_ORDER: readonly string[] = [
  'lender',
  'loan_amount',
  'rate',
  'rate_type',
  'term_months',
  'amortization_months',
  'payment',
  'maturity_date',
  'prepayment_privileges',
  'penalty_basis',
]

const FIELD_LABELS: Record<string, string> = {
  lender: 'Lender',
  loan_amount: 'Loan amount',
  rate: 'Rate',
  rate_type: 'Rate type',
  term_months: 'Term',
  amortization_months: 'Amortization',
  payment: 'Payment',
  maturity_date: 'Maturity date',
  prepayment_privileges: 'Prepayment privileges',
  penalty_basis: 'Penalty basis',
}

/** Plain-language label. An unlabelled key degrades to a readable form of
 *  itself rather than to nothing (rule 3). */
export function termLabel(fieldKey: string): string {
  const known = FIELD_LABELS[fieldKey]
  if (known) return known
  const words = fieldKey.replace(/_/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : fieldKey
}

/** Canonical order; unknown keys last, alphabetically, never dropped. */
export function orderTerms(rows: readonly CommitmentTermRow[]): CommitmentTermRow[] {
  const rank = (k: string) => {
    const i = COMMITMENT_TERM_ORDER.indexOf(k)
    return i === -1 ? COMMITMENT_TERM_ORDER.length : i
  }
  return [...rows].sort((a, b) => {
    const ra = rank(a.fieldKey)
    const rb = rank(b.fieldKey)
    if (ra !== rb) return ra - rb
    if (a.fieldKey !== b.fieldKey) return a.fieldKey.localeCompare(b.fieldKey)
    return a.createdAt.localeCompare(b.createdAt)
  })
}

// ── The set status ─────────────────────────────────────────────────────────
// The gate is per DOCUMENT: a commitment's fields are one lender's one offer,
// so they move together. The card states the set's status, never ten of them.

export type TermSetState = 'empty' | 'pending' | 'approved' | 'rejected' | 'mixed'

export interface TermSetStatus {
  total: number
  pending: number
  approved: number
  rejected: number
  /** Any gate_status outside the three known ones — counted, never hidden. */
  other: number
  state: TermSetState
  /** A decision is only offered while something is actually pending. */
  decidable: boolean
}

export function termSetStatus(rows: readonly CommitmentTermRow[]): TermSetStatus {
  let pending = 0
  let approved = 0
  let rejected = 0
  let other = 0
  for (const r of rows) {
    if (r.gateStatus === 'pending') pending++
    else if (r.gateStatus === 'approved') approved++
    else if (r.gateStatus === 'rejected') rejected++
    else other++
  }
  const total = rows.length
  let state: TermSetState
  if (total === 0) state = 'empty'
  else if (pending === total) state = 'pending'
  else if (approved === total) state = 'approved'
  else if (rejected === total) state = 'rejected'
  else state = 'mixed'
  return { total, pending, approved, rejected, other, state, decidable: pending > 0 }
}

export function termSetStatusLabel(s: TermSetStatus): string {
  switch (s.state) {
    case 'empty':
      return 'No terms extracted'
    case 'pending':
      return `${s.pending} awaiting your decision`
    case 'approved':
      return 'Approved'
    case 'rejected':
      return 'Rejected'
    case 'mixed':
      // A mixed set is not a normal state — the gate moves the whole set. Say
      // exactly what is where rather than picking a winner.
      return `Mixed: ${s.pending} pending, ${s.approved} approved, ${s.rejected} rejected${
        s.other ? `, ${s.other} other` : ''
      }`
  }
}

// ── Per-document grouping ──────────────────────────────────────────────────
// The gate is keyed on the source document, so an amendment landing later gets
// its own set and its own decision. Newest document first.

export interface TermGroup {
  documentId: string
  terms: CommitmentTermRow[]
  status: TermSetStatus
  /** Newest createdAt in the group — the sort key and the "extracted" stamp. */
  extractedAt: string
}

export function groupTermsByDocument(rows: readonly CommitmentTermRow[]): TermGroup[] {
  const byDoc = new Map<string, CommitmentTermRow[]>()
  for (const r of rows) {
    const list = byDoc.get(r.documentId)
    if (list) list.push(r)
    else byDoc.set(r.documentId, [r])
  }
  const groups: TermGroup[] = []
  byDoc.forEach((terms, documentId) => {
    const ordered = orderTerms(terms)
    groups.push({
      documentId,
      terms: ordered,
      status: termSetStatus(ordered),
      extractedAt: terms.reduce(
        (max: string, r: CommitmentTermRow) => (r.createdAt > max ? r.createdAt : max),
        terms[0].createdAt,
      ),
    })
  })
  groups.sort((a, b) => b.extractedAt.localeCompare(a.extractedAt))
  return groups
}

// ── What a row renders ─────────────────────────────────────────────────────

export interface TermDisplay {
  label: string
  /** The document's printed token. Null only when the extractor stored none. */
  printed: string | null
  /** Rendered when printed is null — states the absence, never invents. */
  missingNote: string | null
  /** A resolved reading shown BESIDE printed, never instead of it. */
  reading: { kind: 'date'; value: string; convention: string | null; basis: string | null } | { kind: 'text'; value: string } | null
  page: number | null
  snippet: string | null
  confidence: string | null
}

const CONVENTION_LABELS: Record<string, string> = {
  dmy: 'day-month-year',
  mdy: 'month-day-year',
  ymd: 'year-month-day',
}

export function conventionLabel(convention: string | null): string | null {
  if (!convention) return null
  return CONVENTION_LABELS[convention] ?? convention
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Spell a stored ISO date out. A maturity read the wrong way round moves a
 *  renewal by four months, so the resolved date renders as words plus the ISO
 *  form — never as another ambiguous numeric triple. Parsed by hand: no Date
 *  construction, so no timezone can shift the day. */
export function spellIsoDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!m) return iso
  const [, y, mo, d] = m
  const monthIndex = Number(mo) - 1
  const month = MONTHS[monthIndex]
  if (!month || Number(d) < 1 || Number(d) > 31) return iso
  return `${Number(d)} ${month} ${y} (${iso})`
}

/** The render contract for one row. Rules 1 and 2 live here. */
export function termDisplay(row: CommitmentTermRow): TermDisplay {
  const printed = row.printed && row.printed.trim() ? row.printed : null

  // A date-convention row is the maturity case: the printed token and the
  // resolved date are BOTH shown, with the convention and the basis that
  // produced it, because the disagreement between them is the whole risk.
  let reading: TermDisplay['reading'] = null
  if (row.dateConvention && row.valueText) {
    reading = {
      kind: 'date',
      value: spellIsoDate(row.valueText),
      convention: conventionLabel(row.dateConvention),
      basis: row.dateConventionBasis,
    }
  } else if (row.valueText && row.valueText.trim() && row.valueText.trim() !== printed) {
    // A classification the document did not print in those words (rate_type
    // reads "variable" off "Prime Lending Rate - 0.85%").
    reading = { kind: 'text', value: row.valueText.trim() }
  }

  return {
    label: termLabel(row.fieldKey),
    printed,
    // value_numeric is deliberately NOT a fallback (rule 1). If the extractor
    // printed nothing, say so — a bare figure with no printed source is
    // precisely what this gate must not let through unnoticed.
    missingNote: printed ? null : 'The extractor recorded no printed text for this field.',
    reading,
    page: row.page,
    snippet: row.sourceSnippet && row.sourceSnippet.trim() ? row.sourceSnippet : null,
    confidence: row.confidence,
  }
}

// ── The decision ───────────────────────────────────────────────────────────

export type CommitmentTermsAction = 'approve' | 'reject'
export const COMMITMENT_TERMS_ACTIONS: readonly CommitmentTermsAction[] = ['approve', 'reject']

/** The gates route answers 422 on a malformed id, so the shape is checked
 *  before a 60-second token is minted and spent on a round trip that cannot
 *  succeed. Same reasoning as the conditions proxy mirroring its note rule. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

/** The contract's own ceiling. A longer note is REFUSED rather than truncated:
 *  silently shortening what a person wrote changes the record they meant to
 *  leave. */
export const TERM_NOTE_MAX = 2000
