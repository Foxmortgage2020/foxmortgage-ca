// The documents desk model (B6): grouping, the analysis (verdict) join, and the
// waiting-request derivation. Pure — no I/O, no demo — so every branch the desk
// can render is asserted here.

import { describe, it, expect } from 'vitest'
import { buildDocumentsDesk } from '@/lib/documents-desk'
import type { DocumentRow, DealConditionRow } from '@/lib/underwriting'

let n = 0
function doc(p: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: p.id ?? `d-${++n}`,
    docType: p.docType ?? 'pay_stub',
    source: p.source ?? 'upload',
    receivedAt: p.receivedAt ?? '2026-07-04T09:00:00Z',
    reviewStatus: p.reviewStatus ?? 'pending',
    createdAt: p.createdAt ?? '2026-07-04T09:00:00Z',
    provenance: p.provenance ?? 'real',
    borrowerId: p.borrowerId ?? null,
  }
}

function cond(p: Partial<DealConditionRow> = {}): DealConditionRow {
  return {
    id: p.id ?? `c-${++n}`,
    dealRef: null,
    text: p.text ?? 'a condition',
    owner: p.owner ?? 'borrower',
    status: p.status ?? 'open',
    dueDate: p.dueDate ?? null,
    condNumber: p.condNumber ?? null,
    source: p.source ?? 'commitment',
    evidenceRefCount: p.evidenceRefCount ?? 0,
    category: p.category ?? null,
    kind: p.kind ?? null,
    precheckStatus: p.precheckStatus ?? null,
    presence: p.presence ?? null,
    presenceDetail: p.presenceDetail ?? null,
    docKind: p.docKind ?? null,
    borrowerId: p.borrowerId ?? null,
    gateStatus: p.gateStatus ?? 'approved',
    verifiedBy: p.verifiedBy ?? null,
    verifiedAt: p.verifiedAt ?? null,
    sourcePage: p.sourcePage ?? null,
    sourceSnippet: p.sourceSnippet ?? null,
    confidence: p.confidence ?? null,
    loadBearing: p.loadBearing ?? false,
    humanEditedFields: p.humanEditedFields ?? [],
    requirement: p.requirement ?? null,
  }
}

// A condition carrying an analysis verdict for a document.
function analysisCond(verdict: string, opts: { documentId?: string | null; docKind?: string; borrowerId?: string | null; asOf?: string } = {}): DealConditionRow {
  return cond({
    docKind: opts.docKind ?? 't4_noa',
    borrowerId: opts.borrowerId ?? 'b-1',
    presence: 'obtained',
    presenceDetail: {
      matched_finmo_name: 'x',
      analysis: { verdict, document_id: opts.documentId ?? null, as_of: opts.asOf ?? '2026-07-01' },
    },
  })
}

describe('buildDocumentsDesk — empty + basic states', () => {
  it('empty inputs yield an empty desk', () => {
    const desk = buildDocumentsDesk([], [])
    expect(desk.isEmpty).toBe(true)
    expect(desk.counts.total).toBe(0)
  })

  it('approved and reviewed documents are Done (green); rejected is Done (red)', () => {
    const desk = buildDocumentsDesk(
      [
        doc({ id: 'a', reviewStatus: 'approved' }),
        doc({ id: 'b', reviewStatus: 'reviewed' }),
        doc({ id: 'c', reviewStatus: 'rejected' }),
      ],
      [],
    )
    expect(desk.done).toHaveLength(3)
    expect(desk.needsEyes).toHaveLength(0)
    const byKey = Object.fromEntries(desk.done.map(c => [c.key, c]))
    expect(byKey['doc:a']!.state.tone).toBe('green')
    expect(byKey['doc:b']!.state.tone).toBe('green')
    expect(byKey['doc:c']!.state.tone).toBe('red')
    expect(byKey['doc:c']!.state.label).toBe('Rejected')
  })

  it('a received-pending document with no verdict is Needs your eyes (navy outline)', () => {
    const desk = buildDocumentsDesk([doc({ id: 'a', reviewStatus: 'pending' })], [])
    expect(desk.needsEyes).toHaveLength(1)
    expect(desk.needsEyes[0]!.state.tone).toBe('navy-outline')
    expect(desk.needsEyes[0]!.state.label).toBe('In review')
  })

  it('an unknown review status surfaces under Needs your eyes, never silently Done', () => {
    const desk = buildDocumentsDesk([doc({ id: 'a', reviewStatus: 'quarantined' })], [])
    expect(desk.needsEyes).toHaveLength(1)
    expect(desk.done).toHaveLength(0)
  })

  it('a synthetic document is a loud red card under Needs your eyes and never Done', () => {
    const desk = buildDocumentsDesk([doc({ id: 'a', reviewStatus: 'approved', provenance: 'synthetic' })], [])
    expect(desk.done).toHaveLength(0)
    expect(desk.needsEyes).toHaveLength(1)
    expect(desk.needsEyes[0]!.synthetic).toBe(true)
    expect(desk.needsEyes[0]!.state.tone).toBe('red')
    expect(desk.needsEyes[0]!.analysis).toBeNull()
  })
})

describe('buildDocumentsDesk — the analysis (verdict) join', () => {
  it('attaches a gap verdict by document_id (hard join) and raises the state to amber', () => {
    const desk = buildDocumentsDesk(
      [doc({ id: 'd1', docType: 't4_noa', borrowerId: 'b-1', reviewStatus: 'pending' })],
      [analysisCond('short', { documentId: 'd1' })],
    )
    const card = desk.needsEyes.find(c => c.key === 'doc:d1')!
    expect(card.state.tone).toBe('amber')
    expect(card.state.label).toBe('Needs attention')
    expect(card.analysis?.tone).toBe('red')
    expect(card.analysis?.label).toBe('Short of the requirement')
    expect(card.analysis?.source).toBe('Analysis (draft)')
    expect(card.analysis?.asOf).toBe('2026-07-01')
  })

  it('a meets verdict is green and keeps the state calm (navy outline, not amber)', () => {
    const desk = buildDocumentsDesk(
      [doc({ id: 'd1', docType: 't4_noa', borrowerId: 'b-1', reviewStatus: 'pending' })],
      [analysisCond('meets', { documentId: 'd1' })],
    )
    const card = desk.needsEyes.find(c => c.key === 'doc:d1')!
    expect(card.analysis?.tone).toBe('green')
    expect(card.state.tone).toBe('navy-outline')
  })

  it('a needs_review verdict is amber on both the state chip and the analysis chip', () => {
    const desk = buildDocumentsDesk(
      [doc({ id: 'd1', docType: 't4_noa', borrowerId: 'b-1', reviewStatus: 'pending' })],
      [analysisCond('needs_review', { documentId: 'd1' })],
    )
    const card = desk.needsEyes.find(c => c.key === 'doc:d1')!
    expect(card.state.tone).toBe('amber')
    expect(card.analysis?.tone).toBe('amber')
  })

  it('an unknown verdict falls to needs_review (amber), never green', () => {
    const desk = buildDocumentsDesk(
      [doc({ id: 'd1', docType: 't4_noa', borrowerId: 'b-1', reviewStatus: 'pending' })],
      [analysisCond('some_future_verdict', { documentId: 'd1' })],
    )
    expect(desk.needsEyes[0]!.analysis?.tone).toBe('amber')
  })

  it('falls back to a (kind, borrower) match when the analysis carries no document_id and the pairing is unique', () => {
    const desk = buildDocumentsDesk(
      [doc({ id: 'd1', docType: 't4_noa', borrowerId: 'b-1', reviewStatus: 'pending' })],
      [analysisCond('short', { documentId: null, docKind: 't4_noa', borrowerId: 'b-1' })],
    )
    expect(desk.needsEyes[0]!.analysis?.label).toBe('Short of the requirement')
  })

  it('does NOT attribute an unstamped verdict when two documents share the (kind, borrower) pairing', () => {
    const desk = buildDocumentsDesk(
      [
        doc({ id: 'd1', docType: 't4_noa', borrowerId: 'b-1', reviewStatus: 'pending' }),
        doc({ id: 'd2', docType: 't4_noa', borrowerId: 'b-1', reviewStatus: 'pending' }),
      ],
      [analysisCond('short', { documentId: null, docKind: 't4_noa', borrowerId: 'b-1' })],
    )
    expect(desk.needsEyes.every(c => c.analysis === null)).toBe(true)
  })

  it('a verdict stamped for one document never leaks onto a different document of the same kind', () => {
    const desk = buildDocumentsDesk(
      [
        doc({ id: 'd1', docType: 't4_noa', borrowerId: 'b-1', reviewStatus: 'pending' }),
        doc({ id: 'd2', docType: 't4_noa', borrowerId: 'b-1', reviewStatus: 'pending' }),
      ],
      [analysisCond('short', { documentId: 'd1' })],
    )
    expect(desk.needsEyes.find(c => c.key === 'doc:d1')!.analysis).not.toBeNull()
    expect(desk.needsEyes.find(c => c.key === 'doc:d2')!.analysis).toBeNull()
  })
})

describe('buildDocumentsDesk — waiting on the client (requested documents)', () => {
  it('an open document-condition awaiting input is a gray Requested card', () => {
    const desk = buildDocumentsDesk(
      [],
      [cond({ id: 'c1', docKind: 'letter_of_employment', presence: 'needs_input', status: 'open', dueDate: '2026-07-20' })],
    )
    expect(desk.waiting).toHaveLength(1)
    expect(desk.waiting[0]!.state.tone).toBe('gray')
    expect(desk.waiting[0]!.name).toBe('letter_of_employment')
    expect(desk.waiting[0]!.date).toEqual({ kind: 'due', value: '2026-07-20' })
  })

  it('a condition with no doc kind is never a waiting card (it is not a document request)', () => {
    const desk = buildDocumentsDesk([], [cond({ docKind: null, presence: 'needs_input', status: 'open' })])
    expect(desk.waiting).toHaveLength(0)
    expect(desk.isEmpty).toBe(true)
  })

  it('obtained / verified / satisfied / waived conditions are not waiting cards', () => {
    const desk = buildDocumentsDesk(
      [],
      [
        cond({ docKind: 'aps', presence: 'obtained', status: 'open' }),
        cond({ docKind: 'id', presence: 'verified', status: 'satisfied' }),
        cond({ docKind: 'appraisal', presence: 'needs_input', status: 'waived' }),
      ],
    )
    expect(desk.waiting).toHaveLength(0)
  })

  it('a request whose document has already arrived is suppressed (no double-show)', () => {
    const desk = buildDocumentsDesk(
      [doc({ id: 'd1', docType: 'void_cheque', borrowerId: 'b-1', reviewStatus: 'pending' })],
      [cond({ docKind: 'void_cheque', borrowerId: 'b-1', presence: 'needs_input', status: 'open' })],
    )
    expect(desk.waiting).toHaveLength(0)
    expect(desk.needsEyes).toHaveLength(1)
  })

  it('a SYNTHETIC document does NOT suppress an open request for the same kind — it has not truly arrived', () => {
    const desk = buildDocumentsDesk(
      [doc({ id: 'd1', docType: 'void_cheque', borrowerId: 'b-1', provenance: 'synthetic', reviewStatus: 'pending' })],
      [cond({ docKind: 'void_cheque', borrowerId: 'b-1', presence: 'needs_input', status: 'open' })],
    )
    expect(desk.waiting).toHaveLength(1) // the client still owes the real document
    expect(desk.needsEyes.some(c => c.synthetic)).toBe(true)
  })

  it('a REJECTED document does NOT suppress an open request for the same kind — the request stays open', () => {
    const desk = buildDocumentsDesk(
      [doc({ id: 'd1', docType: 'void_cheque', borrowerId: 'b-1', reviewStatus: 'rejected' })],
      [cond({ docKind: 'void_cheque', borrowerId: 'b-1', presence: 'needs_input', status: 'open' })],
    )
    expect(desk.waiting).toHaveLength(1)
    expect(desk.done.some(c => c.state.label === 'Rejected')).toBe(true)
  })

  it('waiting cards sort by soonest due date first', () => {
    const desk = buildDocumentsDesk(
      [],
      [
        cond({ id: 'late', docKind: 'aps', presence: 'requested', status: 'open', dueDate: '2026-08-01' }),
        cond({ id: 'soon', docKind: 'id', presence: 'requested', status: 'open', dueDate: '2026-07-10' }),
      ],
    )
    expect(desk.waiting.map(c => c.key)).toEqual(['req:soon', 'req:late'])
  })
})

describe('buildDocumentsDesk — counts, ordering, and the whole picture', () => {
  it('reports counts and populates all three groups', () => {
    const desk = buildDocumentsDesk(
      [
        doc({ id: 'done1', reviewStatus: 'reviewed' }),
        doc({ id: 'eyes1', reviewStatus: 'pending' }),
      ],
      [cond({ docKind: 'fire_insurance_binder', presence: 'needs_input', status: 'open' })],
    )
    expect(desk.counts).toEqual({ needsEyes: 1, waiting: 1, done: 1, total: 3 })
    expect(desk.isEmpty).toBe(false)
  })

  it('Needs your eyes orders synthetic first, then gaps, then plain', () => {
    const desk = buildDocumentsDesk(
      [
        doc({ id: 'plain', docType: 'void_cheque', reviewStatus: 'pending' }),
        doc({ id: 'gap', docType: 't4_noa', borrowerId: 'b-1', reviewStatus: 'pending' }),
        doc({ id: 'synth', docType: 'aps', reviewStatus: 'pending', provenance: 'synthetic' }),
      ],
      [analysisCond('short', { documentId: 'gap' })],
    )
    expect(desk.needsEyes.map(c => c.key)).toEqual(['doc:synth', 'doc:gap', 'doc:plain'])
  })

  it('Done orders newest received first', () => {
    const desk = buildDocumentsDesk(
      [
        doc({ id: 'old', reviewStatus: 'approved', receivedAt: '2026-07-01T00:00:00Z' }),
        doc({ id: 'new', reviewStatus: 'approved', receivedAt: '2026-07-09T00:00:00Z' }),
      ],
      [],
    )
    expect(desk.done.map(c => c.key)).toEqual(['doc:new', 'doc:old'])
  })
})
