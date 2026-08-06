// Pure derivations for the commitment-conditions checklist (Phase B2).
// Isomorphic: no fetches, no Clerk, no env — so the room's client component
// and the unit tests share one source of truth. Two axes live on a condition
// (fox-underwriting migration 0035): `status` is the human-decision lifecycle
// (the existing satisfied/moot/waived gate) and `presence` is the machine's
// document-collection axis (needs_input up to obtained; verified is a human
// tap). The room shows ONE pill derived from both.
//
// The colour rule is the shell's attention currency: lime/`decision` renders
// ONLY where a human action is queued — here, the needs_input pill (and, in
// the component, the Verify affordance). obtained is amber ("in review",
// because presence is not verification); verified and satisfied are green;
// requested and waived are neutral.

export type ConditionPresence = 'needs_input' | 'requested' | 'obtained' | 'verified' | 'not_applicable'

export type PillTone = 'green' | 'amber' | 'lime' | 'gray'

export interface StatusPill {
  label: string
  tone: PillTone
}

/** The single displayed pill, derived from the decision status first, then the
 * document-presence axis. `status` wins when it is a terminal human decision
 * (satisfied / waived); otherwise presence drives it. A null/unknown presence
 * is neutral, NEVER lime — lime is reserved for needs_input so it always means
 * "a human action is queued here". */
export function conditionStatusPill(input: {
  status: string
  presence: string | null
}): StatusPill {
  if (input.status === 'satisfied') return { label: 'satisfied', tone: 'green' }
  if (input.status === 'waived') return { label: 'waived', tone: 'gray' }
  switch (input.presence) {
    case 'needs_input':
      return { label: 'needs input', tone: 'lime' }
    case 'requested':
      return { label: 'requested', tone: 'gray' }
    case 'obtained':
      return { label: 'obtained · in review', tone: 'amber' }
    case 'verified':
      return { label: 'verified', tone: 'green' }
    case 'not_applicable':
      // An underwriting constraint (fox-underwriting migration 0038): adjudicated
      // at underwriting, not a document to collect — never lime, never outstanding.
      return { label: 'underwriting', tone: 'gray' }
    default:
      return { label: 'pending', tone: 'gray' }
  }
}

/** A row is "collected" when its document is in hand (presence obtained or
 * verified) OR the human marked the condition satisfied. Verify is not
 * required to count as collected — obtained already is. */
export function isCollected(input: { status: string; presence: string | null }): boolean {
  return (
    input.presence === 'obtained' ||
    input.presence === 'verified' ||
    input.status === 'satisfied'
  )
}

/** The affordance to verify presence (human-only, presence -> verified) is
 * offered on rows the machine has NOT yet verified and the human has NOT
 * terminally decided. */
export function canVerify(input: { status: string; presence: string | null }): boolean {
  if (input.status === 'satisfied' || input.status === 'waived') return false
  return input.presence === 'obtained' || input.presence === 'requested' || input.presence === 'needs_input'
}

// ─── The row's reading state (handoff 56) ────────────────────────────────────
//
// Michael read the shipped checklist on a live file and called the layout
// unreadable. The rebuild puts ONE line on screen per condition and hides the
// detail behind expansion, so the four states below are what a person scans.
// They are DERIVED from the stored axes; none of them is a new stored value.
//
//   nothing      no document is on file yet
//   on_file      a document is on file (the interim reading, below)
//   problems     a document is on file and its check did not clear
//   done         a human decided it (satisfied or waived)
//   underwriting an adjudication constraint, never a document to chase
//
// THE INTERIM READING, AND IT IS DESIGNED TO BE DELETED. The document check
// does not exist yet: not one condition in the book carries
// presence_detail.analysis. So a document that is present but not decided says
// only that it is ON FILE and claims nothing about having been read. The
// `meets` and gap branches are written against the shape the check will store,
// so the day it ships the two checked states light up with no change here, and
// the "nothing has read it yet" line disappears on its own.

export type ChecklistStateKey = 'nothing' | 'on_file' | 'problems' | 'done' | 'underwriting'

export interface ChecklistState {
  key: ChecklistStateKey
  /** One short line stating the current state in plain words, rendered under
   *  the label on the collapsed row. */
  line: string
  /** A failed check is the one state that opens on arrival. */
  openByDefault: boolean
}

// The stored analysis verdicts that mean the check found something. `meets` is
// the pass; needs_review and kind_mismatch are unresolved rather than clean, so
// they read as a problem too (an unresolved check is still Michael's move).
const GAP_VERDICTS = new Set(['short', 'stale', 'rule_unmet'])
const UNRESOLVED_VERDICTS = new Set(['needs_review', 'kind_mismatch'])

/** The row's state, from the two stored axes plus the analysis verdict when one
 * exists. A human decision is terminal and leads; then the constraint case;
 * then the check; then document presence; then the honest default. */
export function conditionChecklistState(input: {
  status: string
  presence: string | null
  /** The verdict stored on presence_detail.analysis. Null everywhere in the
   *  book today, which is why the on_file line claims nothing about a read. */
  analysisVerdict?: string | null
  /** Who tapped Verify, and when, already formatted by the caller so this
   *  module stays free of date formatting. */
  verifiedBy?: string | null
  verifiedOn?: string | null
}): ChecklistState {
  // A HUMAN DECISION IS TERMINAL. Neither satisfied nor waived records who or
  // when on the condition row: `conditions` carries verified_by/verified_at and
  // nothing else, and the acting human lives on the audit_log entry by design
  // (guardrail 19). So the line points at the record rather than inventing one.
  if (input.status === 'satisfied') {
    return { key: 'done', line: 'You marked this satisfied. The audit log records who and when.', openByDefault: false }
  }
  if (input.status === 'waived') {
    return { key: 'done', line: 'Waived with a note. The audit log records who and when.', openByDefault: false }
  }
  // An underwriting constraint is adjudicated, not collected. It is neither
  // outstanding nor collected, and it is never a chase.
  if (input.presence === 'not_applicable') {
    return { key: 'underwriting', line: 'Settled at underwriting. There is no document to collect.', openByDefault: false }
  }

  const verdict = input.analysisVerdict ?? null
  if (verdict && GAP_VERDICTS.has(verdict)) {
    return { key: 'problems', line: 'A document is on file and the check found a problem.', openByDefault: true }
  }
  if (verdict && UNRESOLVED_VERDICTS.has(verdict)) {
    return { key: 'problems', line: 'A document is on file and the check could not clear it.', openByDefault: true }
  }
  if (verdict === 'meets') {
    return { key: 'on_file', line: 'On file, and the check passed.', openByDefault: false }
  }

  if (input.presence === 'verified') {
    const who = input.verifiedBy ? ` by ${input.verifiedBy}` : ''
    const when = input.verifiedOn ? ` on ${input.verifiedOn}` : ''
    return { key: 'on_file', line: `On file, confirmed by hand${who}${when}.`, openByDefault: false }
  }
  // evidence_attached is the older status-axis way of saying the same thing a
  // presence of obtained says, and files predating the presence axis carry only
  // that. Both mean a document arrived.
  if (input.presence === 'obtained' || input.status === 'evidence_attached') {
    return { key: 'on_file', line: 'On file. Nothing has read it yet.', openByDefault: false }
  }
  // pre_checked is a system pass on the CONDITION, not a document landing, so
  // it stays in the nothing-on-file glyph and says which it is.
  if (input.status === 'pre_checked') {
    return { key: 'nothing', line: 'Pre-checked by the system. No document is on file yet.', openByDefault: false }
  }
  if (input.presence === 'requested') {
    return { key: 'nothing', line: 'Requested. Nothing on file yet.', openByDefault: false }
  }
  return { key: 'nothing', line: 'Nothing on file yet.', openByDefault: false }
}

/** The header's three figures, over one already-derived list of states.
 *
 * `collected` and `outstanding` plus the constraint rows partition the list, so
 * every condition is counted once. `needsYou` is a HIGHLIGHTED SUBSET rather
 * than a third slice: it is every row where the machine has done what it can
 * and the next move is Michael's, which spans both a document sitting unread
 * and a check that failed. */
export interface ChecklistTally {
  total: number
  collected: number
  outstanding: number
  needsYou: number
  /** Constraint rows, held out of both figures so neither can read as a chase. */
  settled: number
}

export function checklistTally(states: readonly ChecklistStateKey[]): ChecklistTally {
  let collected = 0
  let outstanding = 0
  let needsYou = 0
  let settled = 0
  for (const s of states) {
    if (s === 'on_file' || s === 'done') collected += 1
    else if (s === 'underwriting') settled += 1
    else outstanding += 1
    if (s === 'on_file' || s === 'problems') needsYou += 1
  }
  return { total: states.length, collected, outstanding, needsYou, settled }
}

// ─── The short label, and the honest gap (handoff 56) ────────────────────────
//
// NOTHING GENERATES A SHORT LABEL TODAY. A condition carries its full text and
// sometimes a document kind, and the kind is set on 11 of the 49 approved
// conditions in the book. So the label is derived, and it is derived the only
// two ways the data allows: name the document where the kind names one, and
// otherwise truncate the text. The real fix is the extractor writing a label
// beside the text, which is a different repo and a separate decision.

const DOC_KIND_LABEL: Record<string, string> = {
  letter_of_employment: 'Letter of employment',
  pay_stub: 'Pay stub',
  t4_noa: 'T4 and notice of assessment',
  void_cheque: 'Void cheque',
  fire_insurance_binder: 'Fire insurance binder',
  gift_letter: 'Gift letter',
  aps: 'Agreement of purchase and sale',
  appraisal: 'Appraisal',
  id: 'Photo identification',
  signed_commitment: 'Signed commitment',
  disclosure: 'Disclosure',
  sale_confirmation: 'Sale confirmation',
  mortgage_statement: 'Mortgage statement',
  property_tax: 'Property tax bill',
  payout_statement: 'Payout statement',
  ccb: 'Child benefit statement',
  product_assessment_form: 'Product assessment form',
  term_portion_amendment: 'Term portion amendment',
}

// A kind that names no document. `other` is the whole set: FOUR of
// BRXM-F057400's twelve approved conditions carry it, so a label taken from the
// kind would print the same word four times down the page, which is worse than
// the truncated text it replaced. Truncation wins for these.
const VAGUE_DOC_KINDS = new Set(['other'])

const LABEL_MAX = 72
const LABEL_MIN_WORD_BREAK = 40

/** The one line a person scans. Prefers the document kind where the kind names
 * a document, and otherwise truncates the condition text at a word boundary. */
export function conditionShortLabel(input: { docKind: string | null; text: string }): {
  label: string
  from: 'doc_kind' | 'text'
  truncated: boolean
} {
  const kind = input.docKind?.trim() ?? ''
  if (kind && !VAGUE_DOC_KINDS.has(kind)) {
    return { label: DOC_KIND_LABEL[kind] ?? kind.replace(/_/g, ' '), from: 'doc_kind', truncated: false }
  }
  const flat = input.text.replace(/\s+/g, ' ').trim()
  if (!flat) return { label: 'Condition text not recorded', from: 'text', truncated: false }
  if (flat.length <= LABEL_MAX) return { label: flat, from: 'text', truncated: false }
  const cut = flat.slice(0, LABEL_MAX)
  const space = cut.lastIndexOf(' ')
  const body = (space > LABEL_MIN_WORD_BREAK ? cut.slice(0, space) : cut).replace(/[\s,.:]+$/, '')
  return { label: `${body}…`, from: 'text', truncated: true }
}

/** Two rows in one group can derive the SAME label. A file with two borrowers
 * carries two letters of employment, and the kind names both identically. The
 * condition number is the honest separator, so it is added to the collapsed
 * label ONLY where a label repeats, and stays in the metadata line otherwise. */
export function disambiguateLabels(rows: readonly { condNumber: string | null; label: string }[]): string[] {
  const seen = new Map<string, number>()
  for (const r of rows) {
    const k = r.label.toLowerCase()
    seen.set(k, (seen.get(k) ?? 0) + 1)
  }
  return rows.map(r =>
    (seen.get(r.label.toLowerCase()) ?? 0) > 1 && r.condNumber ? `${r.label} (${r.condNumber})` : r.label,
  )
}

/** THE DEFECT MICHAEL PHOTOGRAPHED. Every condition rendered twice: the text,
 * then the same string again beneath it in grey quotes as the source snippet.
 * On BRXM-F060561 the extractor stored the snippet AND the text identically on
 * all twelve rows, so twelve conditions filled twenty-four paragraphs and the
 * second copy read as new information.
 *
 * The quote now renders only where it says something the text does not, and
 * only inside the expanded row. Whitespace and case are normalised before the
 * comparison, and a quote wholly contained in the text (or containing it) is
 * the same fact stated at a different length, so it is dropped too. */
export function sourceQuoteToShow(text: string, snippet: string | null | undefined): string | null {
  if (!snippet) return null
  const flat = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()
  const a = flat(text)
  const b = flat(snippet)
  if (!b) return null
  if (!a) return snippet.trim()
  if (a === b || a.includes(b) || b.includes(a)) return null
  return snippet.trim()
}

/** THE FALLBACK MATTERS MORE THAN THE GROUPING. Conditions carry no link to a
 * person on most files: BRXM-F060561 has no borrower rows at all, and
 * BRXM-F053724 has two borrowers with zero of its thirty-three conditions
 * linked to either. The extractor captured the names only as a text prefix, and
 * parsing a name out of condition text would break silently the first time a
 * lender wrote one differently. So everything renders under General and this
 * line says why, rather than the page looking as though nobody is assigned. */
export function borrowerGroupingNote(input: {
  borrowerCount: number
  linkedRowCount: number
  rowCount: number
}): string | null {
  if (input.rowCount === 0 || input.linkedRowCount > 0) return null
  if (input.borrowerCount === 0) {
    return 'All of these sit under General because no borrower is on record for this file. The commitment does not say who each condition belongs to, and nothing here guesses it from the wording.'
  }
  const n = input.borrowerCount
  return `All of these sit under General because none of them is linked to a person. This file has ${n} ${n === 1 ? 'borrower' : 'borrowers'} on record, and nothing here guesses which one a condition belongs to from its wording.`
}

// ─── Ordering (handoff 55) ───────────────────────────────────────────────────

/** Numeric-aware compare for condition numbers, which are STRINGS in the
 * schema (`cond_number: string | null`) because a lender may number a
 * condition "7a". Sorting them as text renders 1, 10, 11, 12, 2 — the defect
 * Michael photographed. Rules: rows whose number starts with an integer sort
 * by that integer (full-string compare breaks ties, so 7 < 7a < 8), numbered
 * rows sort before unnumbered prose numbers, and rows with no number at all
 * sort LAST, in their incoming order. */
export function compareCondNumber(a: string | null, b: string | null): number {
  const pa = a?.trim() ?? ''
  const pb = b?.trim() ?? ''
  if (!pa && !pb) return 0
  if (!pa) return 1
  if (!pb) return -1
  const na = /^\d+/.exec(pa)
  const nb = /^\d+/.exec(pb)
  if (na && nb) {
    const d = parseInt(na[0], 10) - parseInt(nb[0], 10)
    // NUMERIC tie-break, not lexicographic: '1.10' must follow '1.2', which is
    // the photographed defect reproduced one level down. numeric:true keeps
    // the '7' < '7a' invariant while comparing digit runs as numbers.
    return d !== 0 ? d : pa.localeCompare(pb, undefined, { numeric: true })
  }
  if (na) return -1
  if (nb) return 1
  return pa.localeCompare(pb, undefined, { numeric: true })
}

/** A sorted COPY in condition-number order. Applied at render time in the
 * checklist, on both the pending set and the working list, so the fetchers'
 * own orders (due-date for the approved read, text order for the pending one)
 * never reach the screen as the reading order. */
export function sortConditions<T extends { condNumber: string | null }>(rows: readonly T[]): T[] {
  return rows.slice().sort((x, y) => compareCondNumber(x.condNumber, y.condNumber))
}

// ─── Ownership flags (handoff 55) ────────────────────────────────────────────

/** A condition the lender did not clearly assign. The extractor categorised it
 * general_verification rather than a named owner's deliverable, so it sits in
 * the broker list — where it will be SEEN — carrying this flag, instead of in
 * a section that is not worked. */
export function isUnassignedOwnership(category: string | null | undefined): boolean {
  return category === 'general_verification'
}

// ─── Owner grouping (broker-first view) ──────────────────────────────────────

// Michael performs BROKER conditions; those lead his view and the board count
// reflects the work he actually owns. Solicitor / borrower / underwriting /
// product_mechanics are present but grouped separately (collapsed in the room).
export function isBrokerCondition(owner: string | null | undefined): boolean {
  return owner === 'broker'
}

// ─── Counts (board card + room progress line) ────────────────────────────────

export interface ConditionCount {
  total: number
  collected: number
  outstanding: number
}

/** Group rows by deal and count. `total` is every condition; `collected` is
 * the collected set (above); `outstanding` is total minus the DONE set, where
 * done = collected OR waived — a single disjoint set, so a waived-but-collected
 * row is removed exactly once (never double-subtracted). One pass, each
 * condition counted once.
 *
 * `opts.ownerScope='broker'` counts only broker conditions — the work Michael
 * owns — so the board card reflects his outstanding load, not the solicitor's
 * (Task 2). Default counts every owner (unchanged; the pure tests assert it). */
export function conditionCounts(
  rows: { dealId: string; status: string; presence: string | null; owner?: string | null }[],
  opts?: { ownerScope?: 'broker' },
): Record<string, ConditionCount> {
  // Accumulate total, collected, and the disjoint "no longer outstanding" set.
  const acc: Record<string, { total: number; collected: number; done: number }> = {}
  for (const r of rows) {
    if (opts?.ownerScope === 'broker' && !isBrokerCondition(r.owner)) continue
    const a = (acc[r.dealId] ??= { total: 0, collected: 0, done: 0 })
    a.total += 1
    const collected = isCollected(r)
    if (collected) a.collected += 1
    // done is the union of collected, waived, and underwriting constraints
    // (not_applicable — adjudicated, never a document to chase), counted once
    // per row so a constraint never sits as permanent outstanding.
    if (collected || r.status === 'waived' || r.presence === 'not_applicable') a.done += 1
  }
  const out: Record<string, ConditionCount> = {}
  for (const [dealId, a] of Object.entries(acc)) {
    out[dealId] = {
      total: a.total,
      collected: a.collected,
      outstanding: Math.max(0, a.total - a.done),
    }
  }
  return out
}

// ─── Closing countdown (board card + room header) ────────────────────────────

// A file closing within this window reads amber. On the board card the pill
// only goes amber when work also remains (outstanding > 0); in the room header
// the proximity alone is enough.
export const CLOSING_SOON_DAYS = 10

/** Board-card rule: the closing pill is amber when the file closes within the
 * window AND conditions are still outstanding. A file with nothing outstanding
 * is not an alarm however close it is, and a PAST closing date (negative days,
 * e.g. a funded deal) is not "closing soon" — the window is [0, 10]. */
export function closingPillAmber(daysToClose: number | null, outstanding: number): boolean {
  return daysToClose !== null && daysToClose >= 0 && daysToClose <= CLOSING_SOON_DAYS && outstanding > 0
}

/** Room-header rule: proximity alone (no outstanding gate), same [0, 10]
 * window — a closing already in the past is never amber. */
export function closingHeaderAmber(daysToClose: number | null): boolean {
  return daysToClose !== null && daysToClose >= 0 && daysToClose <= CLOSING_SOON_DAYS
}
