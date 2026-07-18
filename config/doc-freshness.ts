// Deterministic document freshness windows (B6.3). ONE place, Michael-adjustable:
// every value below is a one-line edit. The desk compares "now" against the
// NEWEST received file's honest timestamp; over the window it shows an advisory
// "May be stale" line (amber) and counts the request into "Needs your look".
//
// A value of `null` means NO day window in v1 — for kinds whose real freshness is
// a CONTENT rule (a tax-year cycle, a current-year requirement, an on-face expiry
// date), which is a future (W2) content-date task and must NEVER be faked with a
// day count. A kind the classifier does not recognise gets no window, so no flag.
//
// The DEFAULTS below are DRAFTS for Michael's sign-off — see the table in
// docs/desk-freshness-b63-2026-07-18.md.

// Canonical freshness kinds -> window in days (or null = no day window in v1).
export const FRESHNESS_DAYS: Record<string, number | null> = {
  pay_stub: 30,
  proof_of_pay_deposit: 30,
  bank_statement: 60,
  mortgage_statement: 60,
  loc_statement: 60,
  letter_of_employment: 60,
  benefit_statement: 90, // CCB and other benefit statements
  property_tax: null, // current-year logic is a content rule (W2)
  noa: null, // tax-year cycle (W2)
  t4: null, // tax-year cycle (W2)
  t1: null, // tax-year cycle (W2)
  id: null, // on-face expiry date (W2)
  void_cheque: null, // no natural freshness window
}

// A document-chase condition's closed doc_kind vocabulary -> a freshness kind.
// Only kinds with a freshness meaning are mapped; anything else returns null and
// therefore gets no window (a gift letter, an appraisal, a commitment: no flag).
function kindFromDocKind(docKind: string): string | null {
  switch (docKind) {
    case 'pay_stub':
      return 'pay_stub'
    case 'letter_of_employment':
      return 'letter_of_employment'
    case 'mortgage_statement':
      return 'mortgage_statement'
    case 'property_tax':
      return 'property_tax'
    case 't4_noa':
      return 'noa'
    case 'id':
      return 'id'
    case 'void_cheque':
      return 'void_cheque'
    case 'ccb':
      return 'benefit_statement'
    default:
      return null
  }
}

// A free-text Finmo request name -> a freshness kind, by keyword. Most specific
// patterns first so "proof of pay deposit" is not swallowed by "pay". Returns
// null when nothing matches — no window, never a guess.
function kindFromName(name: string): string | null {
  const s = name.toLowerCase()
  if (/proof of (pay|income)|pay deposit|direct deposit/.test(s)) return 'proof_of_pay_deposit'
  if (/pay ?stub/.test(s)) return 'pay_stub'
  if (/letter of employment|employment letter/.test(s)) return 'letter_of_employment'
  if (/line of credit|heloc/.test(s)) return 'loc_statement'
  if (/mortgage statement/.test(s)) return 'mortgage_statement'
  if (/bank statement|chequing statement|savings statement/.test(s)) return 'bank_statement'
  if (/child benefit|\bccb\b|benefit statement/.test(s)) return 'benefit_statement'
  if (/property tax/.test(s)) return 'property_tax'
  if (/notice of assessment|\bnoa\b/.test(s)) return 'noa'
  if (/\bt4\b/.test(s)) return 't4'
  if (/\bt1\b/.test(s)) return 't1'
  if (/void ?che/.test(s)) return 'void_cheque'
  if (/identification|\bid\b|passport|driver'?s licen/.test(s)) return 'id'
  return null
}

/**
 * The freshness kind for a request: a commitment condition's doc_kind is
 * authoritative; a Finmo request is classified from its name. Null when
 * unrecognised.
 */
export function freshnessKindFor(docKind: string | null, documentName: string | null): string | null {
  if (docKind) return kindFromDocKind(docKind)
  return kindFromName(documentName ?? '')
}

/** The freshness window in days for a request, or null when there is no day
 * window (unrecognised kind, or a content-rule kind deferred to W2). */
export function freshnessWindowDays(docKind: string | null, documentName: string | null): number | null {
  const kind = freshnessKindFor(docKind, documentName)
  return kind ? (FRESHNESS_DAYS[kind] ?? null) : null
}

const DAY_MS = 86_400_000

/**
 * Whether a received file is past its freshness window. Compares `now` (epoch ms)
 * against the newest received file's timestamp. Returns the age in days when
 * stale, else null. A missing window or a missing/invalid timestamp is never
 * stale (no window, no honest date, no guess).
 */
export function staleness(
  windowDays: number | null,
  updatedAt: string | null | undefined,
  now: number,
): { days: number } | null {
  if (windowDays === null || !updatedAt) return null
  const t = Date.parse(updatedAt)
  if (Number.isNaN(t)) return null
  const days = Math.floor((now - t) / DAY_MS)
  return days > windowDays ? { days } : null
}
