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
