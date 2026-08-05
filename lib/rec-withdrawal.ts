// Withdrawing a record from the September record layer (handoff 50, 2026-08-05)
// — the pure layer.
//
// A WITHDRAWAL IS A DECISION, NEVER A DELETE. Nothing here removes a row and
// nothing downstream of here can. The rec.deals row stays exactly where it is;
// a row lands in `rec.source_decisions` saying a human instructed that the
// loader stop recreating it, and every reader that cares filters on that
// decision. Guardrail 21 in both repos depends on the row surviving, because a
// decision about a record that no longer exists cannot be audited.
//
// THAT IS WHY NONE OF THE COPY IN THIS FILE SAYS "DELETE". Saying delete would
// send Michael looking for a bin that does not exist, and would misdescribe
// what he just did to the one person who will have to explain it later.
//
// TWO HONEST LIMITS, stated in the copy rather than discovered afterwards:
//   1. A withdrawal does not restore a row somebody removed by hand. It
//      releases the loader, and the next run recreates the row.
//   2. A reversal does not un-supersede anything. It sets the withdrawal to
//      superseded and lets the loader resume.
//
// PURE. No next/*, no Clerk, no fetch — the same split lib/beta-file.ts and
// lib/commitment-terms.ts follow, so every rule below is unit-tested without a
// database and the page, the route and the tests read one source.

// ─── The reason ─────────────────────────────────────────────────────────────
// The gate demands 3 to 2000 characters. Both bounds are mirrored here so a
// typo never burns a 60-second token on a round trip that cannot succeed, and
// so the person sees the problem in words rather than as a 422.

export const WITHDRAW_REASON_MIN = 3
export const WITHDRAW_REASON_MAX = 2000

export type ReasonCheck = { ok: true; reason: string } | { ok: false; message: string }

/** AN OVER-LONG REASON IS REFUSED, NOT TRUNCATED. Silently shortening what a
 *  person wrote changes the record they meant to leave, and this record is the
 *  only answer to "why did this file go away" three months from now. The same
 *  rule the committed-terms note follows. */
export function checkReason(raw: unknown): ReasonCheck {
  if (typeof raw !== 'string') {
    return { ok: false, message: REASON_REQUIRED_COPY }
  }
  const reason = raw.trim()
  if (reason.length === 0) {
    return { ok: false, message: REASON_REQUIRED_COPY }
  }
  if (reason.length < WITHDRAW_REASON_MIN) {
    return {
      ok: false,
      message: `That reason is ${reason.length} character${
        reason.length === 1 ? '' : 's'
      }. Write at least ${WITHDRAW_REASON_MIN}, because this is the only record of why.`,
    }
  }
  if (reason.length > WITHDRAW_REASON_MAX) {
    return {
      ok: false,
      message: `That reason is ${reason.length} characters. Shorten it to ${WITHDRAW_REASON_MAX} or fewer and it will send exactly as written.`,
    }
  }
  return { ok: true, reason }
}

export const REASON_REQUIRED_COPY =
  'Type a reason first. In three months this is the only record of why the file went away.'

// ─── What a withdrawal actually does, in words ──────────────────────────────
// Rendered above the control on both surfaces. Kept here rather than in the
// component so the board, the file page and the tests cannot drift apart on
// what the button claims.

export const WITHDRAWAL_EXPLAINER =
  'The record is not deleted. It stays where it is, carries this decision, and the loader declines to recreate it on the next run.'

export const WITHDRAWAL_PERMANENCE =
  'A withdrawal can be reversed from the Withdrawn view, which needs its own reason. Reversing releases the loader. It does not restore a row anybody removed by hand and it does not undo anything else.'

export const REVERSAL_EXPLAINER =
  'Reversing sets this withdrawal to superseded and lets the loader recreate the record on its next run. The withdrawal row stays on the table as the record of what happened.'

// ─── The feed, and when a withdrawal is refused ─────────────────────────────
//
// A WITHDRAWAL STOPS THE LIVE FINMO RECEIVER, NOT JUST THE CSV LOADER. That is
// the fact that decides this whole rule, and it is why the signal cannot key on
// `source_system`.
//
// LIVE, 2026-08-05: `source_system = 'finmo'` covers 2 of 160 records.
// `finmo_application_id IS NOT NULL` covers 106, including 17 of the 38
// no-reference records Michael is about to clear. Keying on source_system would
// therefore stay silent on all 17 while quietly cutting their feed, which is
// the exact failure this posture exists to prevent. It keys on
// `finmo_application_id`.
//
// A ROOM CHANGES THE ANSWER. Switching off a live feed on a file somebody is
// actively underwriting is a decision that belongs on that file, not on a sweep
// through a board view, so that combination is REFUSED outright rather than
// warned about — and refused by the route, not only by the button.
//
// The fourth posture (a room but no live feed) is NOT in the brief and is NOT
// refused. It is a caution, because a rec row with a workbench room is still a
// file somebody is working, and withdrawing one silently would be the same
// class of surprise the warning above exists to prevent. Today the two
// populations coincide exactly: all 5 rows carrying a direct workbench_deal_id
// are also Finmo-fed, so this branch changes nothing observable right now and
// exists so it cannot become a silent gap later.

export type FeedPosture = 'plain' | 'room_only' | 'live_feed' | 'refused'

export interface FeedInput {
  /** rec.deals.finmo_application_id. Presence means a live receiver feeds this
   *  record, whatever its source_system says. */
  finmoApplicationId?: string | null
  /** Whether lib/beta-file.ts resolveRoom finds a workbench room for this
   *  record. Computed on the SERVER from the workbench read, never accepted
   *  from a browser. */
  hasRoom: boolean
}

export function feedPosture(input: FeedInput): FeedPosture {
  const live = typeof input.finmoApplicationId === 'string' && input.finmoApplicationId.trim().length > 0
  if (live && input.hasRoom) return 'refused'
  if (input.hasRoom) return 'room_only'
  if (live) return 'live_feed'
  return 'plain'
}

export function isRefused(input: FeedInput): boolean {
  return feedPosture(input) === 'refused'
}

/** What each posture says out loud. Null where there is nothing worth saying:
 *  a plain record needs no caveat, and inventing one would teach Michael to
 *  read past the two that matter. */
export function postureNotice(posture: FeedPosture): string | null {
  switch (posture) {
    case 'refused':
      return REFUSE_ROOM_COPY
    case 'live_feed':
      return LIVE_FEED_COPY
    case 'room_only':
      return ROOM_ONLY_COPY
    default:
      return null
  }
}

export const REFUSE_ROOM_COPY =
  'This record has a live Finmo feed and an open workbench file. Withdrawing it would switch that feed off on a file somebody is working, so it cannot be done from here. Make that call on the file itself.'

export const LIVE_FEED_COPY =
  'This record has a live Finmo feed. Withdrawing it stops the loader and the live receiver both, so this file will stop updating from Finmo.'

export const ROOM_ONLY_COPY =
  'This record has an open workbench file. Withdrawing it removes the record layer row from the working book while that file is still open.'

// ─── Matching a withdrawal to a record ──────────────────────────────────────
//
// The decision table carries `source_system` + `source_id`, and rec.deals
// carries both as its own columns on all 160 rows. THERE IS NO JOIN. Routing
// this through `rec.source_aliases` would cover 124 rows and leave the rest of
// the board unable to show its own state, which is worse than no feature.
//
// `source_system` is OPTIONAL on the write, so a decision row may carry none. A
// row that names one must match it; a row that names none matches on source_id
// alone, which is unique across every record in the book (verified live).

export interface WithdrawalLike {
  /** The decision's own id. This is the `decisionId` the reverse endpoint
   *  takes, and there is no other way to get it. */
  id: string
  source_system: string | null
  source_id: string
  instructed_by: string | null
  instructed_on: string | null
  reason: string | null
}

export interface RecordKeyLike {
  source_system?: string | null
  source_id?: string | null
}

function norm(v: string | null | undefined): string {
  return (v ?? '').trim()
}

export interface WithdrawalIndex {
  /** system + id, for decision rows that name a system. */
  pairs: Map<string, WithdrawalLike>
  /** id alone, for decision rows that do not. */
  loose: Map<string, WithdrawalLike>
  size: number
}

export function withdrawalKey(system: string | null | undefined, id: string): string {
  return `${norm(system)} ${norm(id)}`
}

export function indexWithdrawals(rows: readonly WithdrawalLike[]): WithdrawalIndex {
  const pairs = new Map<string, WithdrawalLike>()
  const loose = new Map<string, WithdrawalLike>()
  for (const r of rows) {
    const id = norm(r.source_id)
    if (!id) continue
    if (norm(r.source_system)) pairs.set(withdrawalKey(r.source_system, id), r)
    else loose.set(id, r)
  }
  return { pairs, loose, size: pairs.size + loose.size }
}

export function withdrawalFor(
  record: RecordKeyLike,
  index: WithdrawalIndex,
): WithdrawalLike | null {
  const id = norm(record.source_id)
  if (!id) return null
  return index.pairs.get(withdrawalKey(record.source_system, id)) ?? index.loose.get(id) ?? null
}

export function isWithdrawn(record: RecordKeyLike, index: WithdrawalIndex): boolean {
  return withdrawalFor(record, index) !== null
}

/** Split a population into what still counts and what has been withdrawn.
 *
 *  A WITHDRAWN RECORD LEAVES THE PHASE COLUMNS, THE ARCHIVE AND THE INSIGHTS.
 *  That is the whole point of withdrawing one, and leaving it in a weighted
 *  total would mean the forecast keeps counting a file Michael removed. It
 *  never leaves quietly: the Withdrawn switch carries its own count beside
 *  Board and Archive, so the two numbers sit on the same screen and a shrinking
 *  book can always be read against the reason it shrank. */
export function partitionWithdrawn<T extends RecordKeyLike>(
  records: readonly T[],
  index: WithdrawalIndex,
): { live: T[]; withdrawn: T[] } {
  const live: T[] = []
  const withdrawn: T[] = []
  for (const r of records) (isWithdrawn(r, index) ? withdrawn : live).push(r)
  return { live, withdrawn }
}

// ─── Identifiers ────────────────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The reverse endpoint is keyed on the decision's own uuid. A malformed one is
 *  refused here rather than sent, so the failure reads as a validation problem
 *  instead of a 404 from somebody else's server. */
export function isDecisionId(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v.trim())
}

/** A source id is whatever the upstream system calls its record: a Zoho id, a
 *  workbench uuid. It is bounded and non-empty, and nothing more is claimed
 *  about its shape, because guessing at a vocabulary this repo does not own is
 *  how a valid id gets refused. */
export function isSourceId(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 200
}

export const WITHDRAW_ENTITY_TYPE = 'deal'
