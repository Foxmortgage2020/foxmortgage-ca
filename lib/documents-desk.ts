// The documents desk (B6.4): the UNIT is the Finmo document REQUEST. The desk
// reads the synced Finmo request list (document_index) as its rows and enriches
// each with the workbench's judgment — the AI verdict that met the document at the
// door (document_request_reviews) or, where a commitment condition covers it, that
// condition's analysis — plus Michael's own recorded review
// (document_request_decisions). Request, arrival, AI verdict, his look, his
// decision, all on one card.
//
// Findings that shape this model (docs/desk-verdicts-b64-2026-07-18.md):
//   - One review row per DOCUMENT; a multi-file request = N documents = N
//     verdicts, so a request card shows its BEST review per the contract rank
//     flagged > questions > stale_cycle > passed.
//   - The desk PREFERS the condition verdict where a commitment condition covers
//     the request (its analysis has judged the document), and the request-review
//     verdict otherwise (F053107 has 0 conditions, 44 reviews).
//   - Visual weight is deliberately NOT the sort rank: `flagged` is the only
//     amber and counts into Needs your look; `questions` is quiet and gets its own
//     filter pill (35 of 44 live reviews are image/illegible — loud it would drown
//     the desk); `stale_cycle` is a soft line, never amber, never demotes an
//     approval; `passed` is a quiet "Looks right".
//   - A withdrawn request (deleted in Finmo, retained) leaves the active groups
//     and all counts, shown under a per-borrower "Withdrawn (N)" expandable.
//   - Michael's decision renders ALONGSIDE, never replacing, the Finmo chip and
//     the AI verdict — the platform's record of HIS review.
//
// Presentation over reads the page already makes plus the newly-granted reviews +
// decisions. No writes here. Never lime: an AI flag is amber; a decision control
// mirrors the renewal approval desk (navy), not the queued-decision token.

import type { DealConditionRow, RequestReviewRow, RequestReviewReason, RequestDecisionRow, RequestVerdict } from './underwriting'
import { freshnessWindowDays, staleness } from '@/config/doc-freshness'

export interface DocumentRequestRow {
  finmoRequestId: string
  borrowerFinmoId: string | null
  borrowerName: string | null
  documentName: string
  // Finmo's own status, stored verbatim: requested | for_review | approved | …
  status: string
  numberOfFiles: number | null
  hasSrc: boolean
  filename: string | null
  requestedAt: string | null
  finmoUpdatedAt: string | null
  // Non-null = the request was deleted in Finmo and is a retained ghost.
  withdrawnAt: string | null
}

export type RequestState =
  | 'waiting'
  | 'received'
  | 'ai_passed'
  | 'ai_flagged'
  | 'ai_questions'
  | 'ai_stale_cycle'
  | 'reviewed'
// The filter pill a card belongs to. `questions` is its own pill so 35 illegible
// image documents never swell "Needs your look".
export type RequestFilterKey = 'waiting' | 'look' | 'questions' | 'done'

// The normalized AI verdict, from either a bridging condition or the request
// review. The card face and expansion weight these deliberately (see below).
export type VerdictKind = RequestVerdict // 'passed' | 'flagged' | 'questions' | 'stale_cycle'

export interface RequestAnalysis {
  tone: 'green' | 'amber' | 'red'
  verdictLabel: string
  reason: string | null
  documentId: string | null
  asOf: string | null
}

// The review-sourced verdict for a request (the best of its documents' reviews).
export interface RequestReview {
  verdict: RequestVerdict
  reasons: RequestReviewReason[]
}

export interface CardDecision {
  verdict: 'approved' | 'sent_back'
  note: string | null
  decidedByEmail: string | null
  decidedAt: string | null
}

export interface ReceivedInfo {
  count: number
  filename: string | null
  updatedAt: string | null
  // We pulled the file bytes into our own store (document_index.has_src).
  pulled: boolean
}

export interface RequestCard {
  key: string
  name: string
  origin: 'finmo' | 'commitment'
  state: RequestState
  filter: RequestFilterKey
  finmoStatus: string | null
  finmoApproved: boolean
  received: ReceivedInfo | null
  // The normalized AI verdict and where it came from (null when none).
  verdict: VerdictKind | null
  verdictSource: 'condition' | 'review' | null
  // The condition-analysis blob (condition path) — drives the "Analysis (draft)"
  // block and the evidence reparent via documentId.
  analysis: RequestAnalysis | null
  // The request-review verdict + cited reasons (request path).
  review: RequestReview | null
  // The document's own internal date (content_date, from the best review) — the
  // freshness substrate. Surfaced honestly on the card's date line.
  contentDate: string | null
  contentDates: Record<string, string> | null
  // Michael's recorded review (approved / sent_back), shown ALONGSIDE the Finmo
  // chip and AI verdict, never replacing them.
  decision: CardDecision | null
  reviewedAt: string | null
  reviewedKind: 'finmo_approved' | 'confirmed' | null
  requestedAt: string | null
  // The stored document this request's verdict analysed (condition path only, for
  // the evidence reparent). Only set when a bridging condition carried
  // analysis.document_id.
  documentId: string | null
  // A deterministic day-window freshness advisory (B6.3): only computed when NO AI
  // verdict exists (a not-yet-analysed received file), since a verdict's freshness
  // judgment — computed workbench-side from content_date — supersedes the portal's
  // upload-date heuristic. `days` = age of the newest received file. NEVER hides
  // or demotes an approval.
  stale: { days: number } | null
  borrowerKey: string
  borrowerLabel: string
}

// A withdrawn request: retained, hidden from the active groups + counts, shown
// under a per-borrower expandable.
export interface WithdrawnCard {
  key: string
  name: string
  withdrawnAt: string | null
  borrowerKey: string
  borrowerLabel: string
}

export interface BorrowerSection {
  key: string
  label: string
  cards: RequestCard[]
  withdrawn: WithdrawnCard[]
  done: number
  total: number
}

export interface RequestsDesk {
  sections: BorrowerSection[]
  progress: { done: number; total: number }
  filterCounts: { all: number; waiting: number; look: number; questions: number; done: number }
  withdrawnCount: number
  isEmpty: boolean
}

export interface BorrowerInfo {
  finmoBorrowerId: string | null
  fullName: string
  // The structured kinship field (workbench migration 0046), used to
  // disambiguate same-given-name section headers. Null when the application
  // states none (typically the primary).
  relationship: string | null
}

const GENERAL = '__general__'

const givenName = (full: string | null | undefined): string | null => {
  const t = (full ?? '').trim()
  if (!t) return null
  return t.split(/\s+/)[0]!
}

const humanize = (s: string) => s.replace(/_/g, ' ')

const VERDICT: Record<string, { tone: 'green' | 'amber' | 'red' }> = {
  meets: { tone: 'green' },
  short: { tone: 'red' },
  stale: { tone: 'red' },
  rule_unmet: { tone: 'red' },
  needs_review: { tone: 'amber' },
  kind_mismatch: { tone: 'amber' },
}

const VERDICT_LABEL: Record<string, string> = {
  meets: 'Meets the requirement',
  short: 'Short of the requirement',
  stale: 'Document is stale',
  rule_unmet: 'A document rule is unmet',
  needs_review: 'Needs review',
  kind_mismatch: 'Does not match',
}

interface RawAnalysis {
  verdict?: unknown
  reasoning?: unknown
  rule_note?: unknown
  document_id?: unknown
  as_of?: unknown
}

function analysisOf(c: DealConditionRow): RequestAnalysis | null {
  const raw = c.presenceDetail?.analysis
  if (!raw || typeof raw !== 'object') return null
  const a = raw as RawAnalysis
  const key = typeof a.verdict === 'string' ? a.verdict : ''
  const tone = VERDICT[key]?.tone ?? 'amber'
  const label = VERDICT_LABEL[key] ?? 'Needs review'
  const reason =
    typeof a.rule_note === 'string' && a.rule_note.trim()
      ? a.rule_note
      : typeof a.reasoning === 'string' && a.reasoning.trim()
        ? a.reasoning
        : null
  return {
    tone,
    verdictLabel: label,
    reason,
    documentId: typeof a.document_id === 'string' ? a.document_id : null,
    asOf: typeof a.as_of === 'string' ? a.as_of : null,
  }
}

// The verdict a condition analysis maps to: a clean (green) analysis is `passed`;
// anything else is a hard `flagged` — the same behaviour B6.3 had (amber and red
// both flagged), so the condition path is unchanged. A condition analysis never
// yields the soft `questions`/`stale_cycle` (those are request-review concepts).
const verdictOfAnalysis = (a: RequestAnalysis): VerdictKind => (a.tone === 'green' ? 'passed' : 'flagged')

// Rank the request-review verdicts (most → least urgent) so the best review for a
// multi-document request is chosen deterministically.
const VERDICT_RANK: Record<RequestVerdict, number> = { flagged: 0, questions: 1, stale_cycle: 2, passed: 3 }

const matchedRequestIdOf = (c: DealConditionRow): string | null => {
  const m = c.presenceDetail?.matched_request_id
  return typeof m === 'string' && m ? m : null
}

// The lifecycle state of a card, from what arrived + the (optional) verdict + the
// (optional) human-confirmed / Finmo approval. A HARD flag is loudest and is never
// silenced by a Finmo approval; a human confirmation (verified) is terminal; the
// soft verdicts (passed/questions/stale_cycle) yield to a Finmo approval.
function deriveState(opts: {
  received: boolean
  verdict: VerdictKind | null
  verified: boolean
  finmoApproved: boolean
}): RequestState {
  const { received, verdict, verified, finmoApproved } = opts
  if (verified) return 'reviewed'
  if (verdict === 'flagged') return 'ai_flagged'
  if (finmoApproved) return 'reviewed'
  if (!received) return 'waiting'
  if (verdict === 'passed') return 'ai_passed'
  if (verdict === 'questions') return 'ai_questions'
  if (verdict === 'stale_cycle') return 'ai_stale_cycle'
  return 'received'
}

const filterOf = (s: RequestState): RequestFilterKey =>
  s === 'waiting'
    ? 'waiting'
    : s === 'reviewed'
      ? 'done'
      : s === 'ai_questions'
        ? 'questions'
        : 'look'

// Sort within a section. AI-flagged first, then a day-window stale advisory, then
// the soft states, then received / passed / questions, then waiting, then done.
const STATE_RANK: Record<RequestState, number> = {
  ai_flagged: 0,
  ai_stale_cycle: 2,
  received: 3,
  ai_passed: 4,
  ai_questions: 5,
  waiting: 6,
  reviewed: 7,
}
function rankOf(c: RequestCard): number {
  if (c.state === 'ai_flagged') return 0
  if (c.stale) return 1
  return STATE_RANK[c.state]
}

/**
 * Build the request-centric desk. `requests` are document_index rows; `conditions`
 * are the approved checklist (the commitment bridge + commitment-only requests);
 * `borrowerInfoById` maps a condition's workbench borrower id to its Finmo id +
 * full name for section grouping; `reviews` are the per-document AI verdicts;
 * `decisions` are Michael's recorded approvals / send-backs.
 */
export function buildRequestsDesk(
  requests: DocumentRequestRow[],
  conditions: DealConditionRow[],
  borrowerInfoById: Map<string, BorrowerInfo> = new Map(),
  now: number = Date.now(),
  reviews: RequestReviewRow[] = [],
  decisions: RequestDecisionRow[] = [],
): RequestsDesk {
  // Bridge: a condition that names a Finmo request is that request's overlay
  // (verdict + human-confirmed state), not a separate card.
  const condByReq = new Map<string, DealConditionRow>()
  for (const c of conditions) {
    const rid = matchedRequestIdOf(c)
    if (rid) condByReq.set(rid, c)
  }
  // ONLY active (non-withdrawn) requests carry an overlay: a commitment condition
  // that bridged a request Finmo has since deleted must still render as its own
  // card (the obligation is not gone just because Finmo withdrew the request), not
  // be silently merged into a ghost.
  const activeRequestIds = new Set(requests.filter(r => !r.withdrawnAt).map(r => r.finmoRequestId))

  // The best review per request (a multi-document request has N reviews).
  const bestReviewByReq = new Map<string, RequestReviewRow>()
  for (const rv of reviews) {
    if (!rv.finmoRequestId) continue
    const prev = bestReviewByReq.get(rv.finmoRequestId)
    if (!prev || VERDICT_RANK[rv.verdict] < VERDICT_RANK[prev.verdict]) bestReviewByReq.set(rv.finmoRequestId, rv)
  }

  // Michael's current decision per request.
  const decisionByReq = new Map<string, CardDecision>()
  for (const d of decisions) {
    if (decisionByReq.has(d.finmoRequestId)) continue // the fetcher orders newest-first
    decisionByReq.set(d.finmoRequestId, {
      verdict: d.verdict,
      note: d.note,
      decidedByEmail: d.decidedByEmail,
      decidedAt: d.decidedAt,
    })
  }

  const cards: RequestCard[] = []
  const withdrawn: WithdrawnCard[] = []

  // 1. Finmo requests (the unit). Withdrawn ones become quiet ghosts.
  for (const r of requests) {
    const borrowerKey = r.borrowerFinmoId ?? (r.borrowerName ? `name:${r.borrowerName}` : GENERAL)
    const borrowerLabel = givenName(r.borrowerName) ?? 'General'
    if (r.withdrawnAt) {
      withdrawn.push({ key: `wd:${r.finmoRequestId}`, name: r.documentName, withdrawnAt: r.withdrawnAt, borrowerKey, borrowerLabel })
      continue
    }
    const cond = condByReq.get(r.finmoRequestId) ?? null
    const analysis = cond ? analysisOf(cond) : null
    const bestReview = bestReviewByReq.get(r.finmoRequestId) ?? null
    // Prefer the CONDITION verdict where a commitment condition covers the request
    // (its analysis has judged the document); the request-review verdict otherwise.
    const useCondition = analysis !== null
    const verdict: VerdictKind | null = useCondition
      ? verdictOfAnalysis(analysis!)
      : bestReview
        ? bestReview.verdict
        : null
    const verdictSource: 'condition' | 'review' | null = useCondition ? 'condition' : bestReview ? 'review' : null
    const review: RequestReview | null =
      !useCondition && bestReview ? { verdict: bestReview.verdict, reasons: bestReview.reasons } : null
    const contentDate = !useCondition && bestReview ? bestReview.contentDate : null
    const contentDates = !useCondition && bestReview ? bestReview.contentDates : null

    const received = (r.numberOfFiles ?? 0) > 0 || r.hasSrc
    const verified = cond?.presence === 'verified'
    const finmoApproved = r.status === 'approved'
    const state = deriveState({ received, verdict, verified, finmoApproved })
    const isReviewed = state === 'reviewed'
    // The day-window advisory (B6.3) fires ONLY when the workbench produced no
    // verdict (a not-yet-analysed file) — a verdict's content_date-based judgment
    // supersedes the portal's cruder upload-date heuristic, so we never double-flag.
    // When it does fire it prefers content_date over the upload timestamp.
    const stale =
      received && verdict === null
        ? staleness(freshnessWindowDays(null, r.documentName), contentDate ?? r.finmoUpdatedAt, now)
        : null
    const decision = decisionByReq.get(r.finmoRequestId) ?? null

    let filter: RequestFilterKey = stale ? 'look' : filterOf(state)
    // An approved decision completes the card (Michael reviewed and accepted); a
    // send-back is Michael's action but leaves the card visible until it resolves.
    if (decision?.verdict === 'approved') filter = 'done'

    cards.push({
      key: `req:${r.finmoRequestId}`,
      name: r.documentName,
      origin: 'finmo',
      state,
      filter,
      finmoStatus: r.status,
      finmoApproved,
      received: received
        ? {
            count: (r.numberOfFiles ?? 0) > 0 ? (r.numberOfFiles as number) : 1,
            filename: r.filename,
            updatedAt: r.finmoUpdatedAt,
            pulled: r.hasSrc,
          }
        : null,
      verdict,
      verdictSource,
      analysis: useCondition ? analysis : null,
      review,
      contentDate,
      contentDates,
      decision,
      reviewedAt: isReviewed ? (verified ? (cond?.verifiedAt ?? null) : finmoApproved ? r.finmoUpdatedAt : null) : null,
      reviewedKind: isReviewed ? (verified ? 'confirmed' : finmoApproved ? 'finmo_approved' : null) : null,
      requestedAt: r.requestedAt,
      // The analysed document for the evidence reparent: the condition's
      // analysis.document_id, or (review path) the best review's own document, so a
      // request-tied statement document's evidence renders in ITS card, not under
      // the "Not tied to a request" residual.
      documentId: useCondition ? (analysis?.documentId ?? null) : (bestReview?.documentId ?? null),
      stale,
      borrowerKey,
      borrowerLabel,
    })
  }

  // 2. Commitment-derived requests with NO Finmo request row (Task 3): the
  // checklist's own document-chase conditions. A condition that bridged a Finmo
  // request (its matched_request_id is in the request set) is already that
  // request's overlay above and is NOT re-shown.
  for (const c of conditions) {
    if (!c.docKind) continue
    if (c.presence === 'not_applicable') continue // an underwriting constraint, not a doc chase
    const rid = matchedRequestIdOf(c)
    if (rid && activeRequestIds.has(rid)) continue // merged as an active request's overlay
    if (c.status === 'waived') continue
    const analysis = analysisOf(c)
    const verdict = analysis ? verdictOfAnalysis(analysis) : null
    const received = c.presence === 'obtained' || c.presence === 'verified'
    const verified = c.presence === 'verified'
    const state = deriveState({ received, verdict, verified, finmoApproved: false })
    const info = c.borrowerId ? borrowerInfoById.get(c.borrowerId) : undefined
    const borrowerKey = info?.finmoBorrowerId ?? (info?.fullName ? `name:${info.fullName}` : GENERAL)
    cards.push({
      key: `cond:${c.id}`,
      name: humanize(c.docKind),
      origin: 'commitment',
      state,
      filter: filterOf(state),
      finmoStatus: null,
      finmoApproved: false,
      received: received ? { count: 1, filename: null, updatedAt: null, pulled: false } : null,
      verdict,
      verdictSource: analysis ? 'condition' : null,
      analysis,
      review: null,
      contentDate: null,
      contentDates: null,
      decision: null,
      reviewedAt: state === 'reviewed' && verified ? c.verifiedAt : null,
      reviewedKind: state === 'reviewed' && verified ? 'confirmed' : null,
      requestedAt: c.dueDate,
      documentId: analysis?.documentId ?? null,
      // A commitment-derived request carries no honest received timestamp, so it
      // never flags a day-window staleness (no date, no guess).
      stale: null,
      borrowerKey,
      borrowerLabel: info ? (givenName(info.fullName) ?? 'General') : 'General',
    })
  }

  // 3. Section by borrower — General first, then borrowers in sorted-key order.
  // Both active cards and withdrawn ghosts group by the same borrower key.
  const order: string[] = []
  const activeByKey = new Map<string, RequestCard[]>()
  const withdrawnByKey = new Map<string, WithdrawnCard[]>()
  const noteKey = (k: string) => {
    if (!activeByKey.has(k) && !withdrawnByKey.has(k)) order.push(k)
  }
  for (const card of cards) {
    noteKey(card.borrowerKey)
    if (!activeByKey.has(card.borrowerKey)) activeByKey.set(card.borrowerKey, [])
    activeByKey.get(card.borrowerKey)!.push(card)
  }
  for (const w of withdrawn) {
    noteKey(w.borrowerKey)
    if (!withdrawnByKey.has(w.borrowerKey)) withdrawnByKey.set(w.borrowerKey, [])
    withdrawnByKey.get(w.borrowerKey)!.push(w)
  }
  const sortKeys = order.filter(k => k !== GENERAL).sort() // deterministic; General prepended below
  const orderedKeys = order.includes(GENERAL) ? [GENERAL, ...sortKeys] : sortKeys

  const sections: BorrowerSection[] = orderedKeys.map(k => {
    const list = activeByKey.get(k) ?? []
    list.sort(
      (a, b) =>
        rankOf(a) - rankOf(b) ||
        (a.requestedAt ?? '').localeCompare(b.requestedAt ?? '') ||
        a.name.localeCompare(b.name),
    )
    const wlist = (withdrawnByKey.get(k) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name))
    // Label from an active card where one exists, else a withdrawn-only section's
    // own borrower label (so a section that holds only ghosts still names itself).
    const label = k === GENERAL ? 'General' : (list[0]?.borrowerLabel ?? wlist[0]?.borrowerLabel ?? 'General')
    // "done" is the resolved set: a stale card counts into "look", so done keys on
    // the final filter.
    const done = list.filter(c => c.filter === 'done').length
    return { key: k, label, cards: list, withdrawn: wlist, done, total: list.length }
  })

  // Disambiguate same-given-name section headers: relationship where known
  // ("Lyntje (spouse)"), else a neutral ordinal — never fabricated.
  const relByFinmo = new Map<string, string | null>()
  borrowerInfoById.forEach(info => {
    if (info.finmoBorrowerId) relByFinmo.set(info.finmoBorrowerId, info.relationship)
  })
  const givenGroups = new Map<string, BorrowerSection[]>()
  for (const s of sections) {
    if (s.key === GENERAL) continue
    givenGroups.set(s.label, [...(givenGroups.get(s.label) ?? []), s])
  }
  givenGroups.forEach(group => {
    if (group.length < 2) return
    const labeled = group.map(s => {
      const rel = relByFinmo.get(s.key) ?? null
      return { s, label: rel ? `${s.label} (${rel})` : s.label }
    })
    const counts = new Map<string, number>()
    labeled.forEach(l => counts.set(l.label, (counts.get(l.label) ?? 0) + 1))
    const running = new Map<string, number>()
    labeled.forEach(l => {
      if ((counts.get(l.label) ?? 0) > 1) {
        const i = (running.get(l.label) ?? 0) + 1
        running.set(l.label, i)
        l.s.label = `${l.label} (${i})`
      } else {
        l.s.label = l.label
      }
    })
  })

  const total = cards.length
  const done = cards.filter(c => c.filter === 'done').length
  const waiting = cards.filter(c => c.filter === 'waiting').length
  const look = cards.filter(c => c.filter === 'look').length
  const questions = cards.filter(c => c.filter === 'questions').length
  return {
    sections,
    progress: { done, total },
    filterCounts: { all: total, waiting, look, questions, done },
    withdrawnCount: withdrawn.length,
    isEmpty: total === 0 && withdrawn.length === 0,
  }
}

// ─── The residual: documents collected but not tied to any request (Task 3) ──
// A `documents` row with no finmo_request_id is a request-less file (an older
// credit report, a consent, a statement whose request is gone). These render in a
// quiet "Not tied to a request (N)" block so nothing collected becomes invisible;
// when a future pull or backfill links them, they graduate into their cards.

export interface ResidualDocInput {
  id: string
  docType: string
  source: string
  receivedAt: string | null
  createdAt: string
  provenance: string
  reviewStatus: string
  finmoRequestId: string | null
}

export interface ResidualDoc {
  key: string
  documentId: string
  kind: string
  source: string
  date: string | null
}

export function residualDocuments(documents: ResidualDocInput[], linkedDocumentIds: Set<string> = new Set()): ResidualDoc[] {
  return documents
    .filter(
      d =>
        d.finmoRequestId === null &&
        d.provenance !== 'synthetic' && // a synthetic stand-in is loud elsewhere (guardrail 20)
        d.reviewStatus !== 'rejected' &&
        !linkedDocumentIds.has(d.id),
    )
    .map(d => ({
      key: `res:${d.id}`,
      documentId: d.id,
      kind: d.docType,
      source: d.source,
      date: d.receivedAt ?? d.createdAt ?? null,
    }))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
}
