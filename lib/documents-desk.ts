// The documents desk (B6.2): the UNIT is the Finmo document REQUEST, not the
// received file. The practice runs on requests — what Finmo asked the client
// for, what has arrived, what is still outstanding — so the desk reads the
// synced Finmo request list (document_index) as its rows and enriches each with
// our own read: whether files have arrived, and, where a commitment condition
// bridges to it, the AI verdict and the human-confirmed state.
//
// Findings that shape this model (docs/documents-desk-b62-2026-07-18.md):
//   - There is NO direct DB link from a request (finmo_request_id) to a stored
//     file (documents.id). The only bridge is a commitment condition whose
//     presence_detail carries matched_request_id (= the request) AND analysis
//     (verdict + document_id). Many files have no commitment conditions at all
//     (F053107: 21 requests, 0 conditions), so a request often stands on
//     document_index alone.
//   - "Received" is derived from number_of_files / has_src, NOT a status token
//     (Finmo's status is requested | for_review | approved | … verbatim).
//   - No human-approval is stored per request; document_index.status='approved'
//     is Finmo's approval, verified is per-condition. Both are rendered honestly.
//
// Presentation over reads the page already makes (plus the newly-granted
// document_index). No writes. Never lime: an AI flag is amber; reviewing is
// work, not a queued platform decision.

import type { DealConditionRow } from './underwriting'
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
}

export type RequestState = 'waiting' | 'received' | 'ai_passed' | 'ai_flagged' | 'reviewed'
// The filter pill a card belongs to.
export type RequestFilterKey = 'waiting' | 'look' | 'done'

export interface RequestAnalysis {
  tone: 'green' | 'amber' | 'red'
  verdictLabel: string
  reason: string | null
  documentId: string | null
  asOf: string | null
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
  received: ReceivedInfo | null
  analysis: RequestAnalysis | null
  reviewedAt: string | null
  reviewedKind: 'finmo_approved' | 'confirmed' | null
  requestedAt: string | null
  // The stored document this request's verdict analysed (for the evidence
  // reparent). Only set when a bridging condition carried analysis.document_id.
  documentId: string | null
  // A deterministic freshness advisory (B6.3): the newest received file is past
  // its configured window. `days` = age of that file in days. An advisory that
  // NEVER hides or demotes an approval — it renders beside the chip. Null when
  // there is no window or no honest received date.
  stale: { days: number } | null
  borrowerKey: string
  borrowerLabel: string
}

export interface BorrowerSection {
  key: string
  label: string
  cards: RequestCard[]
  done: number
  total: number
}

export interface RequestsDesk {
  sections: BorrowerSection[]
  progress: { done: number; total: number }
  filterCounts: { all: number; waiting: number; look: number; done: number }
  isEmpty: boolean
}

export interface BorrowerInfo {
  finmoBorrowerId: string | null
  fullName: string
  // The structured kinship field (workbench migration 0046), used to
  // disambiguate same-given-name section headers (B6.3). Null when the
  // application states none (typically the primary).
  relationship: string | null
}

const GENERAL = '__general__'

const givenName = (full: string | null | undefined): string | null => {
  const t = (full ?? '').trim()
  if (!t) return null
  return t.split(/\s+/)[0]!
}

const humanize = (s: string) => s.replace(/_/g, ' ')

const VERDICT: Record<string, { tone: 'green' | 'amber' | 'red'; label: string }> = {
  meets: { tone: 'green', label: 'Meets the requirement' },
  short: { tone: 'red', label: 'Short of the requirement' },
  stale: { tone: 'red', label: 'Document is stale' },
  rule_unmet: { tone: 'red', label: 'A document rule is unmet' },
  needs_review: { tone: 'amber', label: 'Needs review' },
  kind_mismatch: { tone: 'amber', label: 'Does not match' },
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
  const v = VERDICT[key] ?? VERDICT.needs_review
  const reason =
    typeof a.rule_note === 'string' && a.rule_note.trim()
      ? a.rule_note
      : typeof a.reasoning === 'string' && a.reasoning.trim()
        ? a.reasoning
        : null
  return {
    tone: v.tone,
    verdictLabel: v.label,
    reason,
    documentId: typeof a.document_id === 'string' ? a.document_id : null,
    asOf: typeof a.as_of === 'string' ? a.as_of : null,
  }
}

const matchedRequestIdOf = (c: DealConditionRow): string | null => {
  const m = c.presenceDetail?.matched_request_id
  return typeof m === 'string' && m ? m : null
}

// The lifecycle state of a card, from what arrived + the (optional) verdict +
// the (optional) human/Finmo approval. Order of precedence: a concerning verdict
// is always the loudest; then a confirmed/approved resting state; then waiting;
// then received (passed vs plain).
function deriveState(opts: {
  received: boolean
  analysis: RequestAnalysis | null
  verified: boolean
  finmoApproved: boolean
}): RequestState {
  const { received, analysis, verified, finmoApproved } = opts
  // A human confirmation (verified) is the terminal state and wins over a draft
  // AI flag — Michael looked and decided. A Finmo approval, by contrast, does NOT
  // silence our own flag: a stale document Finmo accepted is still worth flagging.
  if (verified) return 'reviewed'
  if (analysis && analysis.tone !== 'green') return 'ai_flagged'
  if (finmoApproved) return 'reviewed'
  if (!received) return 'waiting'
  if (analysis && analysis.tone === 'green') return 'ai_passed'
  return 'received'
}

const filterOf = (s: RequestState): RequestFilterKey =>
  s === 'waiting' ? 'waiting' : s === 'reviewed' ? 'done' : 'look'

// Sort within a section: AI-flagged first, then STALE (just below flagged),
// then the rest by state. A stale card that is also flagged stays with the
// flagged group (rank 0) — the flag is the louder signal.
const REST_RANK: Record<RequestState, number> = {
  ai_flagged: 0, // unused (handled first); kept total
  received: 0,
  ai_passed: 1,
  waiting: 2,
  reviewed: 3,
}
function rankOf(c: RequestCard): number {
  if (c.state === 'ai_flagged') return 0
  if (c.stale) return 1
  return 2 + REST_RANK[c.state]
}

/**
 * Build the request-centric desk. `requests` are document_index rows; `conditions`
 * are the approved checklist (the bridge to verdicts + the source of
 * commitment-only requests); `borrowerInfoById` maps a condition's workbench
 * borrower id to its Finmo id + full name for section grouping.
 */
export function buildRequestsDesk(
  requests: DocumentRequestRow[],
  conditions: DealConditionRow[],
  borrowerInfoById: Map<string, BorrowerInfo> = new Map(),
  now: number = Date.now(),
): RequestsDesk {
  // Bridge: a condition that names a Finmo request is that request's overlay
  // (verdict + human-confirmed state), not a separate card.
  const condByReq = new Map<string, DealConditionRow>()
  for (const c of conditions) {
    const rid = matchedRequestIdOf(c)
    if (rid) condByReq.set(rid, c)
  }
  const requestIds = new Set(requests.map(r => r.finmoRequestId))

  const cards: RequestCard[] = []

  // 1. Finmo requests (the unit).
  for (const r of requests) {
    const cond = condByReq.get(r.finmoRequestId) ?? null
    const analysis = cond ? analysisOf(cond) : null
    const received = (r.numberOfFiles ?? 0) > 0 || r.hasSrc
    const verified = cond?.presence === 'verified'
    const finmoApproved = r.status === 'approved'
    const state = deriveState({ received, analysis, verified, finmoApproved })
    // The reviewed line renders ONLY when the state is actually reviewed — a
    // Finmo-approved-but-flagged request stays 'ai_flagged' and must NOT also
    // claim "Approved <date>" (its Finmo status still shows in the expansion).
    const isReviewed = state === 'reviewed'
    // Freshness (B6.3): a Finmo request's kind is classified from its name; the
    // newest received file's Finmo timestamp is the honest date. Stale forces the
    // card into "look" without touching the approval state.
    const stale = received ? staleness(freshnessWindowDays(null, r.documentName), r.finmoUpdatedAt, now) : null
    const borrowerKey = r.borrowerFinmoId ?? (r.borrowerName ? `name:${r.borrowerName}` : GENERAL)
    cards.push({
      key: `req:${r.finmoRequestId}`,
      name: r.documentName,
      origin: 'finmo',
      state,
      filter: stale ? 'look' : filterOf(state),
      finmoStatus: r.status,
      received: received
        ? {
            count: (r.numberOfFiles ?? 0) > 0 ? (r.numberOfFiles as number) : 1,
            filename: r.filename,
            updatedAt: r.finmoUpdatedAt,
            pulled: r.hasSrc,
          }
        : null,
      analysis,
      reviewedAt: isReviewed ? (verified ? (cond?.verifiedAt ?? null) : finmoApproved ? r.finmoUpdatedAt : null) : null,
      reviewedKind: isReviewed ? (verified ? 'confirmed' : finmoApproved ? 'finmo_approved' : null) : null,
      requestedAt: r.requestedAt,
      documentId: analysis?.documentId ?? null,
      stale,
      borrowerKey,
      borrowerLabel: givenName(r.borrowerName) ?? 'General',
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
    if (rid && requestIds.has(rid)) continue // merged as a request overlay
    if (c.status === 'waived') continue
    const analysis = analysisOf(c)
    const received = c.presence === 'obtained' || c.presence === 'verified'
    const verified = c.presence === 'verified'
    const state = deriveState({ received, analysis, verified, finmoApproved: false })
    const info = c.borrowerId ? borrowerInfoById.get(c.borrowerId) : undefined
    const borrowerKey = info?.finmoBorrowerId ?? (info?.fullName ? `name:${info.fullName}` : GENERAL)
    cards.push({
      key: `cond:${c.id}`,
      name: humanize(c.docKind),
      origin: 'commitment',
      state,
      filter: filterOf(state),
      finmoStatus: null,
      received: received ? { count: 1, filename: null, updatedAt: null, pulled: false } : null,
      analysis,
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

  // 3. Section by borrower — General first, then borrowers in first-appearance
  // order (Finmo's own categorization). Sort cards within a section by urgency
  // (AI-flagged first), then oldest request first, then name.
  const order: string[] = []
  const byKey = new Map<string, RequestCard[]>()
  for (const card of cards) {
    const k = card.borrowerKey
    if (!byKey.has(k)) {
      byKey.set(k, [])
      order.push(k)
    }
    byKey.get(k)!.push(card)
  }
  const sortKeys = order
    .filter(k => k !== GENERAL)
    .sort() // deterministic; General is prepended below
  const orderedKeys = order.includes(GENERAL) ? [GENERAL, ...sortKeys] : sortKeys

  const sections: BorrowerSection[] = orderedKeys.map(k => {
    const list = byKey.get(k)!
    list.sort(
      (a, b) =>
        rankOf(a) - rankOf(b) ||
        (a.requestedAt ?? '').localeCompare(b.requestedAt ?? '') ||
        a.name.localeCompare(b.name),
    )
    const label = k === GENERAL ? 'General' : list[0]!.borrowerLabel
    // "done" is the resolved-and-not-stale set: a stale card counts into "look".
    const done = list.filter(c => c.filter === 'done').length
    return { key: k, label, cards: list, done, total: list.length }
  })

  // Disambiguate same-given-name section headers (Task 3): relationship where
  // known ("Lyntje (spouse)"), else a neutral ordinal — never fabricated. Ported
  // from the notes layer's precedence idea (structured field, ordinal fallback),
  // adapted to the desk's given-name headers and relationship-first form (dob is
  // not populated, and a section header reads friendlier as "(spouse)").
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
  return {
    sections,
    progress: { done, total },
    filterCounts: { all: total, waiting, look, done },
    isEmpty: total === 0,
  }
}
