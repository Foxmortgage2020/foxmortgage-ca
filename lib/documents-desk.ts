// The documents desk (B6): the pure model that turns the deal room's two
// existing reads — received documents (getDealDocuments) and the approved
// checklist (getApprovedConditions) — into three at-a-glance groups:
//
//   Needs your eyes   received documents awaiting Michael's review
//   Waiting on the client   documents requested but not yet received
//   Done   documents Michael has reviewed (approved / reviewed / rejected)
//
// This is PRESENTATION over reads the deal page already makes: no fetcher, no
// gate, no write. The document-intelligence VERDICT (pass / short / needs
// review) lives on the CONDITION, in `presenceDetail.analysis`, keyed by
// `document_id` — so a received document's card can carry its verdict, named
// as a draft. When the analysis carries no document_id (the workbench does not
// always stamp one yet — B5 deferred item), the verdict is attributed by
// (doc kind, borrower) ONLY when that pairing is unambiguous; never guessed.
//
// No arithmetic here — every number the analysis shows was computed on the
// workbench (guardrail 1); this reads the stored verdict. Never lime: a chip
// states, it never queues.

import type { DocumentRow, DealConditionRow } from './underwriting'

export type DeskGroup = 'needs_eyes' | 'waiting' | 'done'

// The card's top-level STATE chip. 'navy-outline' is the received-pending-review
// treatment the brief calls for (navy outline, not a filled tone); the other
// four map onto the ds StatusChip tones.
export type StateTone = 'green' | 'amber' | 'red' | 'gray' | 'navy-outline'

export interface StateChip {
  tone: StateTone
  label: string
}

// The analysis (verdict) chip. green = meets, red = a genuine gap, amber =
// awaiting judgment. Mirrors the ConditionsChecklist VERDICT_TONE so the two
// surfaces speak one vocabulary. `source` is always named so the card never
// presents a draft as a settled fact.
export interface DeskAnalysis {
  tone: 'green' | 'amber' | 'red'
  label: string
  asOf: string | null
  source: string
}

export interface DeskDate {
  kind: 'received' | 'due' | 'requested'
  // ISO string for received/due; null for a bare "requested" with no due date.
  value: string | null
}

export interface DocumentCard {
  key: string
  name: string
  borrowerId: string | null
  // 'upload' | 'finmo' | 'generated' | 'commitment' … for a received document;
  // null for a requested (not-yet-received) card.
  source: string | null
  synthetic: boolean
  state: StateChip
  analysis: DeskAnalysis | null
  date: DeskDate | null
  group: DeskGroup
  origin: 'document' | 'condition'
}

export interface DocumentsDesk {
  needsEyes: DocumentCard[]
  waiting: DocumentCard[]
  done: DocumentCard[]
  counts: { needsEyes: number; waiting: number; done: number; total: number }
  isEmpty: boolean
}

// A received document is at rest (Done) once Michael has reviewed it. The
// observed review_status vocabulary is approved | reviewed | pending |
// rejected (workbench-owned; an unknown value is surfaced for a look, never
// silently filed as done).
const DONE_POSITIVE = new Set(['approved', 'reviewed', 'accepted'])
const DONE_NEGATIVE = new Set(['rejected'])

// The requested-but-not-received presence states (the collection axis before a
// document arrives). 'obtained'/'verified' mean it is in — those surface as
// received document cards, not waiting cards.
const AWAITING_PRESENCE = new Set(['needs_input', 'requested'])

// A condition is a document request only when it names a document kind AND is
// still open (not satisfied/waived).
function isOpenDocumentRequest(c: DealConditionRow): boolean {
  return (
    !!c.docKind &&
    c.status !== 'satisfied' &&
    c.status !== 'waived' &&
    !!c.presence &&
    AWAITING_PRESENCE.has(c.presence)
  )
}

// verdict -> the analysis chip's tone + short label. Kept in lockstep with
// ConditionsChecklist's VERDICT_TONE (same words Michael reads there).
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
  document_id?: unknown
  as_of?: unknown
}

// Defensively read a condition's analysis blob (presenceDetail is
// Record<string, unknown> | null; the analysis is a nested object).
function analysisOf(c: DealConditionRow): RawAnalysis | null {
  const a = c.presenceDetail?.analysis
  return a && typeof a === 'object' ? (a as RawAnalysis) : null
}

function toDeskAnalysis(a: RawAnalysis): DeskAnalysis {
  const key = typeof a.verdict === 'string' ? a.verdict : ''
  const v = VERDICT[key] ?? VERDICT.needs_review
  return {
    tone: v.tone,
    label: v.label,
    asOf: typeof a.as_of === 'string' ? a.as_of : null,
    source: 'Analysis (draft)',
  }
}

const kbKey = (docType: string | null, borrowerId: string | null) => `${docType ?? ''}|${borrowerId ?? ''}`

/**
 * Build the documents desk from the deal room's existing reads.
 *
 * @param documents received documents (getDealDocuments)
 * @param conditions the approved checklist (getApprovedConditions) — the source
 *   of both the "waiting" requests and the per-document verdicts.
 */
export function buildDocumentsDesk(
  documents: DocumentRow[],
  conditions: DealConditionRow[],
): DocumentsDesk {
  // 1. Analysis join tables. Hard join first: analysis.document_id -> analysis.
  //    Fallback: for analyses that carry NO document_id, index by (kind,
  //    borrower); only usable when that pairing is unique on both sides.
  const byDocId = new Map<string, RawAnalysis>()
  const byKindBorrowerCandidates = new Map<string, RawAnalysis[]>()
  for (const c of conditions) {
    const a = analysisOf(c)
    if (!a) continue
    if (typeof a.document_id === 'string' && a.document_id) {
      byDocId.set(a.document_id, a)
    } else {
      const k = kbKey(c.docKind, c.borrowerId)
      const list = byKindBorrowerCandidates.get(k) ?? []
      list.push(a)
      byKindBorrowerCandidates.set(k, list)
    }
  }
  // How many received documents share each (kind, borrower) — an ambiguous
  // fallback (2+ documents, or 2+ candidate analyses) attributes to none.
  const docCountByKb = new Map<string, number>()
  for (const d of documents) {
    const k = kbKey(d.docType, d.borrowerId)
    docCountByKb.set(k, (docCountByKb.get(k) ?? 0) + 1)
  }

  const analysisForDoc = (d: DocumentRow): DeskAnalysis | null => {
    const hard = byDocId.get(d.id)
    if (hard) return toDeskAnalysis(hard)
    const k = kbKey(d.docType, d.borrowerId)
    const candidates = byKindBorrowerCandidates.get(k)
    if (candidates && candidates.length === 1 && (docCountByKb.get(k) ?? 0) === 1) {
      return toDeskAnalysis(candidates[0]!)
    }
    return null
  }

  const needsEyes: DocumentCard[] = []
  const waiting: DocumentCard[] = []
  const done: DocumentCard[] = []

  // Received documents (the documents table).
  const receivedKb = new Set<string>()
  for (const d of documents) {
    // Only a REAL, non-rejected document counts as "arrived" for the waiting
    // dedup below. A synthetic stand-in has not arrived (the client still owes
    // the real document, guardrail 20), and a rejected document leaves the
    // request open — neither should suppress a Waiting card.
    if (d.provenance === 'real' && d.reviewStatus !== 'rejected') {
      receivedKb.add(kbKey(d.docType, d.borrowerId))
    }
    const analysis = analysisForDoc(d)
    const date: DeskDate = { kind: 'received', value: d.receivedAt }

    if (d.provenance === 'synthetic') {
      // A synthetic stand-in is never a lender document and can never be
      // approved — it needs replacing, so it stays under Needs your eyes, loud.
      needsEyes.push({
        key: `doc:${d.id}`,
        name: d.docType,
        borrowerId: d.borrowerId,
        source: d.source,
        synthetic: true,
        state: { tone: 'red', label: 'Synthetic' },
        analysis: null,
        date,
        group: 'needs_eyes',
        origin: 'document',
      })
      continue
    }

    if (DONE_POSITIVE.has(d.reviewStatus)) {
      done.push({
        key: `doc:${d.id}`,
        name: d.docType,
        borrowerId: d.borrowerId,
        source: d.source,
        synthetic: false,
        state: { tone: 'green', label: chipLabel(d.reviewStatus) },
        analysis,
        date,
        group: 'done',
        origin: 'document',
      })
    } else if (DONE_NEGATIVE.has(d.reviewStatus)) {
      done.push({
        key: `doc:${d.id}`,
        name: d.docType,
        borrowerId: d.borrowerId,
        source: d.source,
        synthetic: false,
        state: { tone: 'red', label: 'Rejected' },
        analysis,
        date,
        group: 'done',
        origin: 'document',
      })
    } else {
      // Received, not yet reviewed (pending or an unknown status) — the first
      // group's whole purpose. A concerning draft verdict (a gap or a
      // needs-review) raises the state chip to amber "Needs attention"; a clean
      // or absent verdict is a calm navy-outline "In review".
      const concerning = !!analysis && analysis.tone !== 'green'
      needsEyes.push({
        key: `doc:${d.id}`,
        name: d.docType,
        borrowerId: d.borrowerId,
        source: d.source,
        synthetic: false,
        state: concerning
          ? { tone: 'amber', label: 'Needs attention' }
          : { tone: 'navy-outline', label: 'In review' },
        analysis,
        date,
        group: 'needs_eyes',
        origin: 'document',
      })
    }
  }

  // Requested documents (open document-conditions not yet received). Suppress a
  // request whose document has in fact arrived (same kind + borrower present in
  // the documents table) — a not-yet-recomputed condition never double-shows.
  for (const c of conditions) {
    if (!isOpenDocumentRequest(c)) continue
    if (receivedKb.has(kbKey(c.docKind, c.borrowerId))) continue
    waiting.push({
      key: `req:${c.id}`,
      name: c.docKind!,
      borrowerId: c.borrowerId,
      source: null,
      synthetic: false,
      state: { tone: 'gray', label: 'Requested' },
      analysis: null,
      date: c.dueDate ? { kind: 'due', value: c.dueDate } : { kind: 'requested', value: null },
      group: 'waiting',
      origin: 'condition',
    })
  }

  // Sort: Needs eyes — synthetic first, then gaps (red), then amber, then plain,
  // newest received first within a tier. Waiting — soonest due first. Done —
  // newest first.
  needsEyes.sort((a, b) => needsEyesRank(a) - needsEyesRank(b) || byReceivedDesc(a, b))
  waiting.sort(byDueAsc)
  done.sort(byReceivedDesc)

  const counts = {
    needsEyes: needsEyes.length,
    waiting: waiting.length,
    done: done.length,
    total: needsEyes.length + waiting.length + done.length,
  }
  return { needsEyes, waiting, done, counts, isEmpty: counts.total === 0 }
}

function chipLabel(reviewStatus: string): string {
  if (reviewStatus === 'approved') return 'Approved'
  if (reviewStatus === 'reviewed') return 'Reviewed'
  if (reviewStatus === 'accepted') return 'Accepted'
  return reviewStatus.replace(/_/g, ' ')
}

function needsEyesRank(c: DocumentCard): number {
  if (c.synthetic) return 0
  if (c.analysis?.tone === 'red') return 1
  if (c.analysis?.tone === 'amber') return 2
  return 3
}

function byReceivedDesc(a: DocumentCard, b: DocumentCard): number {
  const av = a.date?.kind === 'received' ? a.date.value : null
  const bv = b.date?.kind === 'received' ? b.date.value : null
  if (av && bv) return bv.localeCompare(av)
  if (av) return -1
  if (bv) return 1
  return 0
}

function byDueAsc(a: DocumentCard, b: DocumentCard): number {
  const av = a.date?.value ?? null
  const bv = b.date?.value ?? null
  if (av && bv) return av.localeCompare(bv)
  if (av) return -1
  if (bv) return 1
  return 0
}
