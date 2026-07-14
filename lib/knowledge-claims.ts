// Pure helpers for the lender-knowledge claims pipeline: topic grouping,
// as-of staleness wording, document status wording, and the approvals-tab
// document grouping. Isomorphic — no fetches, no Clerk, no env — so the
// server pages, the client components, and the unit tests all share one
// implementation (tests/knowledge-claims.test.ts).

import { daysBetweenYMD } from '@/lib/knowledge'
import type { KnowledgeClaimRow, KnowledgeDocumentRow } from '@/lib/underwriting'

// The upload kind vocabulary (a CONTRACT with the gates upload endpoint).
// Lives here rather than lib/gates.ts because the upload form is a client
// component and lib/gates.ts is server-only; lib/gates.ts re-exports it.
export const KNOWLEDGE_UPLOAD_KINDS = [
  'broker_guide',
  'comp_schedule',
  'policy_bulletin',
  'rate_guide',
  'other',
] as const
export type KnowledgeUploadKind = (typeof KNOWLEDGE_UPLOAD_KINDS)[number]

// Render order for approved-knowledge sections. Unknown topics (a future
// vocabulary addition) sort after the known ones rather than vanishing.
export const CLAIM_TOPIC_ORDER = [
  'penalty_methodology',
  'compensation',
  'program_criteria',
  'product',
  'policy',
  'process',
  'contact',
] as const

export function topicLabel(topic: string): string {
  return topic.replace(/_/g, ' ')
}

export interface TopicGroup {
  topic: string
  claims: KnowledgeClaimRow[]
}

export function groupApprovedByTopic(claims: KnowledgeClaimRow[]): TopicGroup[] {
  const approved = claims.filter(c => c.status === 'approved')
  const byTopic = new Map<string, KnowledgeClaimRow[]>()
  for (const c of approved) {
    const list = byTopic.get(c.topic)
    if (list) list.push(c)
    else byTopic.set(c.topic, [c])
  }
  const known = CLAIM_TOPIC_ORDER.filter(t => byTopic.has(t)).map(t => ({ topic: t as string, claims: byTopic.get(t)! }))
  const unknown = Array.from(byTopic.keys())
    .filter(t => !(CLAIM_TOPIC_ORDER as readonly string[]).includes(t))
    .sort()
    .map(t => ({ topic: t, claims: byTopic.get(t)! }))
  return [...known, ...unknown]
}

// A claim's as-of older than 12 months gets plain words appended, never a
// silent render. Null as-of never reaches this (approval requires a date).
export const CLAIM_STALE_DAYS = 365

export function claimStalenessNote(asOf: string | null, todayYMD: string): string | null {
  if (!asOf) return null
  const days = daysBetweenYMD(asOf, todayYMD)
  if (days === null || days <= CLAIM_STALE_DAYS) return null
  return 'over a year old — confirm before relying on it'
}

// The citation chip text: document name (documents.doc_type), page, as-of.
export function claimCitation(
  claim: Pick<KnowledgeClaimRow, 'sourcePage' | 'asOfDate'>,
  docName: string | null,
): string {
  const parts = [docName ?? 'source document']
  if (claim.sourcePage !== null) parts.push(`p.${claim.sourcePage}`)
  parts.push(claim.asOfDate ? `as of ${claim.asOfDate}` : 'no as-of recorded')
  return parts.join(', ')
}

// ─── Per-document status trail wording ──────────────────────────────────────

export interface DocStatusWording {
  text: string
  tone: 'gray' | 'amber' | 'green' | 'red'
}

export function documentStatusWording(
  doc: Pick<KnowledgeDocumentRow, 'knowledgeStatus' | 'knowledgeError'>,
  pendingCount: number,
  approvedCount: number,
): DocStatusWording {
  switch (doc.knowledgeStatus) {
    case 'uploaded':
      return { text: 'processing queued', tone: 'gray' }
    case 'processing':
      return { text: 'processing', tone: 'gray' }
    case 'extracted':
      if (pendingCount > 0) {
        return {
          text: `${pendingCount} claim${pendingCount === 1 ? '' : 's'} awaiting approval`,
          tone: 'amber',
        }
      }
      if (approvedCount > 0) return { text: 'live', tone: 'green' }
      return { text: 'no claims live (every claim was decided against)', tone: 'gray' }
    case 'no_claims':
      return { text: 'indexed for search (no structured claims)', tone: 'gray' }
    case 'extraction_failed':
      return {
        text: `extraction FAILED: ${doc.knowledgeError ?? 'no error recorded'}`,
        tone: 'red',
      }
    default:
      return { text: 'status unknown', tone: 'gray' }
  }
}

// ─── Approvals tab: pending claims grouped by source document ───────────────

export interface PendingDocGroup {
  documentId: string | null
  docName: string
  lenderSlug: string
  claims: KnowledgeClaimRow[]
}

export function groupPendingByDocument(
  claims: KnowledgeClaimRow[],
  docs: Pick<KnowledgeDocumentRow, 'id' | 'docType'>[],
): PendingDocGroup[] {
  const nameById = new Map(docs.map(d => [d.id, d.docType]))
  const groups: PendingDocGroup[] = []
  const byDoc = new Map<string, PendingDocGroup>()
  for (const c of claims) {
    if (c.status !== 'pending') continue
    const key = c.sourceDocumentId ?? `no-document:${c.lenderSlug}`
    let group = byDoc.get(key)
    if (!group) {
      group = {
        documentId: c.sourceDocumentId,
        docName: (c.sourceDocumentId && nameById.get(c.sourceDocumentId)) || 'Untitled document',
        lenderSlug: c.lenderSlug,
        claims: [],
      }
      byDoc.set(key, group)
      groups.push(group)
    }
    group.claims.push(c)
  }
  return groups
}

// The knowledge-docs batch decision returns held-out claims as heldForAsOf;
// the shape is the gate's (array of held claims or a count). Read it
// defensively so a contract evolution never crashes the toast.
export function heldForAsOfCount(v: unknown): number {
  if (Array.isArray(v)) return v.length
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v
  return 0
}

// ─── Penalty-methodology consumer: the ird_comparison_basis claim pick ──────
// Approved, LENDER-WIDE claims only (program === null), fail closed: a
// program-scoped basis describes ONE program's penalty math, and applying
// it lender-wide would assert a methodology the lender's other products may
// not follow — so a scoped claim never flips method-known here. The as-of
// date rides along so the savings log records WHEN the fact was true, not
// just which row said it. Returns the exact shape lib/lenders.ts
// methodologyFromClaim consumes.

export function selectIrdBasisClaim(
  claims: Pick<KnowledgeClaimRow, 'id' | 'claimKey' | 'status' | 'program' | 'claimValue' | 'asOfDate'>[],
): { claim_value: unknown; id: string; asOfDate: string | null } | null {
  const pick = claims.find(
    c => c.status === 'approved' && c.claimKey === 'ird_comparison_basis' && c.program === null,
  )
  if (!pick) return null
  return { claim_value: pick.claimValue, id: pick.id, asOfDate: pick.asOfDate }
}
