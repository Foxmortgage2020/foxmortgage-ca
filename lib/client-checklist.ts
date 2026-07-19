// The client's document checklist (B8a, 2026-07-18). Pure, node-testable.
//
// This reads the synced Finmo request list (document_index) and reduces it to
// the THREE states a client understands, and nothing else:
//   - Waiting on you  — nothing received yet, each request named
//   - Received        — files are in and being looked over (a count)
//   - Done            — approved (a count)
//
// WHAT IS DELIBERATELY NOT HERE, and why the client never sees it: this builder
// reads ONLY the raw Finmo request status + the received-file count. It never
// touches an AI verdict, a flag, a freshness advisory, a stale-cycle note, or a
// review reason — those are internal drafts. So no internal judgment can reach
// a client's markup, by construction, not by remembering to strip it.
//
// Finmo's own request NAMES render verbatim: they were written for clients.

import type { DocumentRequestRow } from '@/lib/underwriting'

export interface ClientDocGroup {
  // A borrower's given name for a section header, or null for a single
  // headerless list (a small file, or an account-level request).
  borrower: string | null
  // The Finmo request names still needed, verbatim.
  names: string[]
}

export interface ClientDocChecklist {
  total: number // active, non-withdrawn requests
  done: number // approved
  received: number // files in / being looked over, not yet approved
  waiting: number // nothing received yet
  // The waiting requests, named. Grouped by borrower when the file carries 2+
  // borrowers (the way the desk groups when it reads clearer); one headerless
  // group otherwise.
  groups: ClientDocGroup[]
}

/** The first token of a name, for a section header. Never a full name. */
function givenName(name: string | null): string | null {
  if (!name) return null
  const first = name.trim().split(/\s+/)[0]
  return first || null
}

/**
 * Reduce the Finmo request list to the client's three states. Withdrawn
 * requests are dropped entirely (a request Finmo removed is not the client's
 * problem). Returns null when there are no active requests at all, so the card
 * can fall back to its guidance text rather than render an empty checklist.
 */
export function buildClientChecklist(requests: DocumentRequestRow[]): ClientDocChecklist | null {
  const active = requests.filter((r) => !r.withdrawnAt)
  if (!active.length) return null

  let done = 0
  let received = 0
  const waitingItems: { borrower: string | null; name: string }[] = []

  for (const r of active) {
    if (r.status === 'approved') {
      done++
      continue
    }
    // "for_review" is Finmo's own word for a document it has and is reviewing,
    // so it counts as received even when the file count has not caught up. A
    // physical file count or source is the other way a request is received.
    const beingReviewed = r.status === 'for_review'
    const hasFiles = (r.numberOfFiles ?? 0) > 0 || r.hasSrc
    if (beingReviewed || hasFiles) {
      received++
      continue
    }
    waitingItems.push({ borrower: givenName(r.borrowerName), name: r.documentName })
  }

  // Group the waiting list by borrower only when the FILE has 2+ borrowers.
  const distinct = new Set(active.map((r) => givenName(r.borrowerName)).filter((n): n is string => !!n))
  const grouped = distinct.size >= 2

  const groups: ClientDocGroup[] = []
  if (grouped) {
    const order: (string | null)[] = []
    const byBorrower = new Map<string | null, string[]>()
    for (const w of waitingItems) {
      if (!byBorrower.has(w.borrower)) {
        byBorrower.set(w.borrower, [])
        order.push(w.borrower)
      }
      byBorrower.get(w.borrower)!.push(w.name)
    }
    for (const b of order) groups.push({ borrower: b, names: byBorrower.get(b)! })
  } else if (waitingItems.length) {
    groups.push({ borrower: null, names: waitingItems.map((w) => w.name) })
  }

  return { total: active.length, done, received, waiting: waitingItems.length, groups }
}
