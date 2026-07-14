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
 * condition counted once. */
export function conditionCounts(
  rows: { dealId: string; status: string; presence: string | null }[],
): Record<string, ConditionCount> {
  // Accumulate total, collected, and the disjoint "no longer outstanding" set.
  const acc: Record<string, { total: number; collected: number; done: number }> = {}
  for (const r of rows) {
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
