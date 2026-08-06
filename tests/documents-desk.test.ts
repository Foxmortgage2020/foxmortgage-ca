// The documents desk model (B6.2): the REQUEST is the unit. States derive from
// what Finmo asked for + what arrived + the (optional) bridging condition's
// verdict and human-confirmed state. Borrower-sectioned; commitment-only
// requests render too.

import { describe, it, expect } from 'vitest'
import { buildRequestsDesk, residualDocuments } from '@/lib/documents-desk'
import type { DocumentRequestRow, BorrowerInfo, ResidualDocInput } from '@/lib/documents-desk'
import type { DealConditionRow, RequestReviewRow, RequestDecisionRow, RequestVerdict } from '@/lib/underwriting'

// A per-document AI request verdict (document_request_reviews).
function review(finmoRequestId: string, verdict: RequestVerdict, p: Partial<RequestReviewRow> = {}): RequestReviewRow {
  return {
    documentId: p.documentId ?? `doc-${++n}`,
    finmoRequestId,
    docKind: p.docKind ?? null,
    borrowerId: p.borrowerId ?? null,
    verdict,
    reasons: p.reasons ?? [{ code: 'x', severity: verdict === 'flagged' ? 'high' : verdict === 'questions' ? 'question' : 'advisory', message: 'a cited reason', citation: null }],
    contentDate: p.contentDate ?? null,
    contentDates: p.contentDates ?? null,
    analyzedAt: p.analyzedAt ?? '2026-07-06T00:00:00Z',
  }
}

// Michael's recorded decision (document_request_decisions).
function decision(finmoRequestId: string, verdict: 'approved' | 'sent_back', p: Partial<RequestDecisionRow> = {}): RequestDecisionRow {
  return {
    finmoRequestId,
    verdict,
    note: p.note ?? (verdict === 'sent_back' ? 'please resend a clearer copy' : null),
    decidedByEmail: p.decidedByEmail ?? 'michael@app.foxmortgage.ca',
    decidedAt: p.decidedAt ?? '2026-07-09T00:00:00Z',
  }
}

let n = 0
const NOW = Date.parse('2026-07-18T00:00:00Z')
function req(p: Partial<DocumentRequestRow> = {}): DocumentRequestRow {
  return {
    finmoRequestId: p.finmoRequestId ?? `fr-${++n}`,
    borrowerFinmoId: p.borrowerFinmoId ?? null,
    borrowerName: p.borrowerName ?? null,
    documentName: p.documentName ?? 'Some Document',
    status: p.status ?? 'requested',
    numberOfFiles: p.numberOfFiles ?? 0,
    hasSrc: p.hasSrc ?? false,
    filename: p.filename ?? null,
    requestedAt: p.requestedAt ?? '2026-07-02T00:00:00Z',
    finmoUpdatedAt: p.finmoUpdatedAt ?? null,
    withdrawnAt: p.withdrawnAt ?? null,
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
    documentId: null,
    loadBearing: p.loadBearing ?? false,
    humanEditedFields: p.humanEditedFields ?? [],
    requirement: p.requirement ?? null,
  }
}

// A condition that bridges a request and carries a verdict.
function bridge(requestId: string, verdict: string, opts: { documentId?: string | null; docKind?: string; borrowerId?: string | null; presence?: DealConditionRow['presence'] } = {}): DealConditionRow {
  return cond({
    docKind: opts.docKind ?? 'letter_of_employment',
    borrowerId: opts.borrowerId ?? null,
    presence: opts.presence ?? 'obtained',
    presenceDetail: {
      matched_request_id: requestId,
      analysis: { verdict, document_id: opts.documentId ?? null, rule_note: 'a plain reason', as_of: '2026-07-01' },
    },
  })
}

const allCards = (desk: ReturnType<typeof buildRequestsDesk>) => desk.sections.flatMap(s => s.cards)
const cardFor = (desk: ReturnType<typeof buildRequestsDesk>, key: string) => allCards(desk).find(c => c.key === key)

describe('buildRequestsDesk — Finmo request states', () => {
  it('empty inputs yield an empty desk', () => {
    const desk = buildRequestsDesk([], [])
    expect(desk.isEmpty).toBe(true)
    expect(desk.progress).toEqual({ done: 0, total: 0 })
  })

  it('a requested request with nothing received is waiting', () => {
    const desk = buildRequestsDesk([req({ finmoRequestId: 'r1', status: 'requested', numberOfFiles: 0 })], [])
    expect(cardFor(desk, 'req:r1')!.state).toBe('waiting')
    expect(cardFor(desk, 'req:r1')!.filter).toBe('waiting')
  })

  it('files received with no verdict is "received" (ready for your look)', () => {
    const desk = buildRequestsDesk([req({ finmoRequestId: 'r1', status: 'for_review', numberOfFiles: 2 })], [])
    expect(cardFor(desk, 'req:r1')!.state).toBe('received')
    expect(cardFor(desk, 'req:r1')!.received).toMatchObject({ count: 2 })
  })

  it('has_src alone (0 files) still counts as received', () => {
    const desk = buildRequestsDesk([req({ finmoRequestId: 'r1', status: 'for_review', numberOfFiles: 0, hasSrc: true })], [])
    expect(cardFor(desk, 'req:r1')!.state).toBe('received')
    expect(cardFor(desk, 'req:r1')!.received!.count).toBe(1)
  })

  it('a Finmo-approved request is reviewed (approved), counted done', () => {
    const desk = buildRequestsDesk([req({ finmoRequestId: 'r1', status: 'approved', numberOfFiles: 1, finmoUpdatedAt: '2026-07-05T00:00:00Z' })], [])
    const c = cardFor(desk, 'req:r1')!
    expect(c.state).toBe('reviewed')
    expect(c.reviewedKind).toBe('finmo_approved')
    expect(c.reviewedAt).toBe('2026-07-05T00:00:00Z')
    expect(desk.progress.done).toBe(1)
  })
})

describe('buildRequestsDesk — the verdict bridge', () => {
  it('a stale verdict flags the request (amber) with a plain reason, sorted first', () => {
    const desk = buildRequestsDesk(
      [
        req({ finmoRequestId: 'ok', status: 'approved', numberOfFiles: 1 }),
        req({ finmoRequestId: 'bad', status: 'for_review', numberOfFiles: 1 }),
      ],
      [bridge('bad', 'stale', { docKind: 'letter_of_employment' })],
    )
    const c = cardFor(desk, 'req:bad')!
    expect(c.state).toBe('ai_flagged')
    expect(c.analysis?.tone).toBe('red')
    expect(c.analysis?.reason).toBe('a plain reason')
    // Flagged sorts before the approved one within its section.
    expect(desk.sections[0]!.cards[0]!.key).toBe('req:bad')
  })

  it('a Finmo-approved request with a non-green verdict stays flagged and does NOT claim reviewed', () => {
    // Finmo accepted it, but our reader flagged it stale — it needs a look, so it
    // is NOT counted done and never shows a contradictory "Approved" line.
    const desk = buildRequestsDesk(
      [req({ finmoRequestId: 'r1', status: 'approved', numberOfFiles: 1, finmoUpdatedAt: '2026-07-05T00:00:00Z' })],
      [bridge('r1', 'stale')],
    )
    const c = cardFor(desk, 'req:r1')!
    expect(c.state).toBe('ai_flagged')
    expect(c.reviewedKind).toBeNull()
    expect(c.reviewedAt).toBeNull()
    expect(c.finmoStatus).toBe('approved') // still visible in the expansion
    expect(desk.progress.done).toBe(0)
  })

  it('a meets verdict on a not-yet-approved request is AI passed', () => {
    const desk = buildRequestsDesk(
      [req({ finmoRequestId: 'r1', status: 'for_review', numberOfFiles: 1 })],
      [bridge('r1', 'meets')],
    )
    expect(cardFor(desk, 'req:r1')!.state).toBe('ai_passed')
  })

  it('a verified bridging condition marks the request confirmed (done)', () => {
    const desk = buildRequestsDesk(
      [req({ finmoRequestId: 'r1', status: 'for_review', numberOfFiles: 1 })],
      [bridge('r1', 'meets', { presence: 'verified' })],
    )
    const c = cardFor(desk, 'req:r1')!
    // A verified condition also carries verifiedAt via the factory default (null),
    // but the kind is 'confirmed'.
    expect(c.state).toBe('reviewed')
    expect(c.reviewedKind).toBe('confirmed')
  })

  it('a human confirmation (verified) wins over a non-green verdict — it is terminal', () => {
    const desk = buildRequestsDesk(
      [req({ finmoRequestId: 'r1', status: 'for_review', numberOfFiles: 1 })],
      [bridge('r1', 'stale', { presence: 'verified' })],
    )
    // Michael verified it despite the draft flag; the card reads Confirmed, not Flagged.
    expect(cardFor(desk, 'req:r1')!.state).toBe('reviewed')
    expect(cardFor(desk, 'req:r1')!.reviewedKind).toBe('confirmed')
  })

  it('the bridging condition is NOT re-shown as its own card', () => {
    const desk = buildRequestsDesk(
      [req({ finmoRequestId: 'r1', status: 'for_review', numberOfFiles: 1 })],
      [bridge('r1', 'meets')],
    )
    expect(allCards(desk)).toHaveLength(1)
    expect(cardFor(desk, 'req:r1')!.documentId).toBeNull()
  })

  it('carries analysis.document_id through for the evidence reparent', () => {
    const desk = buildRequestsDesk(
      [req({ finmoRequestId: 'r1', status: 'for_review', numberOfFiles: 1 })],
      [bridge('r1', 'meets', { documentId: 'doc-9' })],
    )
    expect(cardFor(desk, 'req:r1')!.documentId).toBe('doc-9')
  })
})

describe('buildRequestsDesk — commitment-only requests (Task 3)', () => {
  it('an open document-condition with no Finmo request is a waiting commitment card', () => {
    const desk = buildRequestsDesk([], [cond({ id: 'c1', docKind: 'fire_insurance_binder', presence: 'needs_input' })])
    const c = cardFor(desk, 'cond:c1')!
    expect(c.origin).toBe('commitment')
    expect(c.state).toBe('waiting')
    expect(c.name).toBe('fire insurance binder')
  })

  it('a commitment condition satisfied by an in-hand document renders satisfied (received)', () => {
    const desk = buildRequestsDesk([], [cond({ id: 'c1', docKind: 'disclosure', presence: 'obtained' })])
    expect(cardFor(desk, 'cond:c1')!.state).toBe('received')
  })

  it('a condition with no doc kind is never a card', () => {
    const desk = buildRequestsDesk([], [cond({ docKind: null, presence: 'needs_input' })])
    expect(desk.isEmpty).toBe(true)
  })

  it('an underwriting constraint (not_applicable) is never a card', () => {
    const desk = buildRequestsDesk([], [cond({ docKind: 'other', presence: 'not_applicable' })])
    expect(desk.isEmpty).toBe(true)
  })

  it('a waived document-condition is never a card', () => {
    const desk = buildRequestsDesk([], [cond({ docKind: 'aps', presence: 'obtained', status: 'waived' })])
    expect(desk.isEmpty).toBe(true)
  })
})

describe('buildRequestsDesk — borrower sections + progress', () => {
  const info = new Map<string, BorrowerInfo>([
    ['b-2', { finmoBorrowerId: 'fin-b-2', fullName: 'Sample Borrower', relationship: 'spouse' }],
  ])

  it('sections by borrower, General first, with per-section and overall progress', () => {
    const desk = buildRequestsDesk(
      [
        req({ finmoRequestId: 'g1', borrowerFinmoId: null, status: 'requested' }),
        req({ finmoRequestId: 'm1', borrowerFinmoId: 'fin-b-1', borrowerName: 'Marty McFixture', status: 'approved', numberOfFiles: 1 }),
        req({ finmoRequestId: 'm2', borrowerFinmoId: 'fin-b-1', borrowerName: 'Marty McFixture', status: 'for_review', numberOfFiles: 1 }),
      ],
      [],
    )
    expect(desk.sections[0]!.key).toBe('__general__')
    expect(desk.sections[0]!.label).toBe('General')
    const marty = desk.sections.find(s => s.label === 'Marty')!
    expect(marty.total).toBe(2)
    expect(marty.done).toBe(1)
    expect(desk.progress).toEqual({ done: 1, total: 3 })
  })

  it('a commitment condition groups into the same section as its borrower Finmo requests', () => {
    const desk = buildRequestsDesk(
      [req({ finmoRequestId: 'r1', borrowerFinmoId: 'fin-b-2', borrowerName: 'Sample Borrower', status: 'approved', numberOfFiles: 1 })],
      [cond({ id: 'c1', docKind: 'disclosure', presence: 'needs_input', borrowerId: 'b-2' })],
      info,
    )
    const section = desk.sections.find(s => s.label === 'Sample')!
    expect(section.cards.map(c => c.key).sort()).toEqual(['cond:c1', 'req:r1'])
  })

  it('filter counts partition the cards', () => {
    const desk = buildRequestsDesk(
      [
        req({ finmoRequestId: 'w', status: 'requested' }),
        req({ finmoRequestId: 'l', status: 'for_review', numberOfFiles: 1 }),
        req({ finmoRequestId: 'd', status: 'approved', numberOfFiles: 1 }),
      ],
      [],
    )
    expect(desk.filterCounts).toEqual({ all: 3, waiting: 1, look: 1, questions: 0, done: 1 })
  })
})

describe('buildRequestsDesk — freshness (B6.3)', () => {
  const now = Date.parse('2026-07-18T00:00:00Z')

  it('an approved-and-stale request shows BOTH truths, counts into look, not done', () => {
    const desk = buildRequestsDesk(
      [req({ finmoRequestId: 'r1', documentName: 'Pay Stub(s)', status: 'approved', numberOfFiles: 1, finmoUpdatedAt: '2026-06-01T00:00:00Z' })],
      [],
      new Map(),
      now,
    )
    const c = cardFor(desk, 'req:r1')!
    // The approval state is untouched — the chip still renders reviewed/Approved.
    expect(c.state).toBe('reviewed')
    expect(c.reviewedKind).toBe('finmo_approved')
    // The staleness advisory rides alongside it, and moves the card into look.
    expect(c.stale).toEqual({ days: 47 })
    expect(c.filter).toBe('look')
    expect(desk.filterCounts.done).toBe(0)
    expect(desk.filterCounts.look).toBe(1)
  })

  it('a no-window kind never flags regardless of age', () => {
    const desk = buildRequestsDesk(
      [req({ finmoRequestId: 'r1', documentName: 'Void Cheque', status: 'approved', numberOfFiles: 1, finmoUpdatedAt: '2020-01-01T00:00:00Z' })],
      [],
      new Map(),
      now,
    )
    const c = cardFor(desk, 'req:r1')!
    expect(c.stale).toBeNull()
    expect(c.filter).toBe('done')
  })

  it('a fresh windowed request does not flag', () => {
    const desk = buildRequestsDesk(
      [req({ finmoRequestId: 'r1', documentName: 'Pay Stub(s)', status: 'for_review', numberOfFiles: 1, finmoUpdatedAt: '2026-07-10T00:00:00Z' })],
      [],
      new Map(),
      now,
    )
    expect(cardFor(desk, 'req:r1')!.stale).toBeNull()
  })

  it('stale sorts just below AI-flagged, above the rest', () => {
    const desk = buildRequestsDesk(
      [
        req({ finmoRequestId: 'appr', borrowerFinmoId: 'b1', borrowerName: 'Dana Okafor', documentName: 'Void Cheque', status: 'approved', numberOfFiles: 1 }),
        req({ finmoRequestId: 'stale', borrowerFinmoId: 'b1', borrowerName: 'Dana Okafor', documentName: 'Pay Stub(s)', status: 'approved', numberOfFiles: 1, finmoUpdatedAt: '2026-05-01T00:00:00Z' }),
        req({ finmoRequestId: 'flag', borrowerFinmoId: 'b1', borrowerName: 'Dana Okafor', documentName: 'Letter of Employment', status: 'for_review', numberOfFiles: 1 }),
      ],
      [bridge('flag', 'stale')],
      new Map(),
      now,
    )
    const dana = desk.sections.find(s => s.label === 'Dana')!
    // flagged first, stale second, the plain approved last.
    expect(dana.cards.map(c => c.key)).toEqual(['req:flag', 'req:stale', 'req:appr'])
  })

  it('a commitment-derived request never flags a day-window staleness (no honest date)', () => {
    const desk = buildRequestsDesk(
      [],
      [cond({ id: 'c1', docKind: 'pay_stub', presence: 'obtained' })],
      new Map(),
      now,
    )
    expect(cardFor(desk, 'cond:c1')!.stale).toBeNull()
  })
})

describe('buildRequestsDesk — same-named section disambiguation (B6.3)', () => {
  const twoJordans = (relA: string | null, relB: string | null) =>
    buildRequestsDesk(
      [
        req({ finmoRequestId: 'a', borrowerFinmoId: 'fa', borrowerName: 'Jordan Wells', status: 'requested' }),
        req({ finmoRequestId: 'b', borrowerFinmoId: 'fb', borrowerName: 'Jordan Anand', status: 'requested' }),
      ],
      [],
      new Map<string, BorrowerInfo>([
        ['wa', { finmoBorrowerId: 'fa', fullName: 'Jordan Wells', relationship: relA }],
        ['an', { finmoBorrowerId: 'fb', fullName: 'Jordan Anand', relationship: relB }],
      ]),
    )

  it('disambiguates by distinct relationships', () => {
    const desk = twoJordans('parent', 'spouse')
    expect(desk.sections.map(s => s.label).sort()).toEqual(['Jordan (parent)', 'Jordan (spouse)'])
  })

  it('one relationship known, the other bare (the brief example)', () => {
    const desk = twoJordans(null, 'spouse')
    expect(desk.sections.map(s => s.label).sort()).toEqual(['Jordan', 'Jordan (spouse)'])
  })

  it('falls back to a neutral ordinal when neither has a relationship', () => {
    const desk = twoJordans(null, null)
    expect(desk.sections.map(s => s.label).sort()).toEqual(['Jordan (1)', 'Jordan (2)'])
  })

  it('a unique given name is never decorated', () => {
    const desk = buildRequestsDesk(
      [req({ finmoRequestId: 'a', borrowerFinmoId: 'fa', borrowerName: 'Marcus Tran', status: 'requested' })],
      [],
      new Map<string, BorrowerInfo>([['t', { finmoBorrowerId: 'fa', fullName: 'Marcus Tran', relationship: 'spouse' }]]),
    )
    expect(desk.sections.find(s => s.label === 'Marcus')).toBeDefined()
  })
})

describe('buildRequestsDesk — the request-review verdict (B6.4 Task 1)', () => {
  const received = (id: string) => req({ finmoRequestId: id, status: 'for_review', numberOfFiles: 1, filename: 'f.pdf' })

  it('a passed review is AI passed, in Needs your look', () => {
    const desk = buildRequestsDesk([received('a')], [], new Map(), NOW, [review('a', 'passed')])
    const c = cardFor(desk, 'req:a')!
    expect(c.state).toBe('ai_passed')
    expect(c.verdict).toBe('passed')
    expect(c.verdictSource).toBe('review')
    expect(c.filter).toBe('look')
  })

  it('a flagged review is amber, in Needs your look, and sorts first', () => {
    const desk = buildRequestsDesk(
      [received('a'), received('b')],
      [],
      new Map(),
      NOW,
      [review('a', 'passed'), review('b', 'flagged', { reasons: [{ code: 'stale', severity: 'high', message: '92 days old', citation: null }] })],
    )
    const b = cardFor(desk, 'req:b')!
    expect(b.state).toBe('ai_flagged')
    expect(b.filter).toBe('look')
    // flagged sorts before passed within the section
    const section = desk.sections[0]!
    expect(section.cards[0]!.key).toBe('req:b')
  })

  it('a questions review gets its OWN pill and does NOT swell Needs your look', () => {
    const desk = buildRequestsDesk([received('a')], [], new Map(), NOW, [review('a', 'questions')])
    const c = cardFor(desk, 'req:a')!
    expect(c.state).toBe('ai_questions')
    expect(c.filter).toBe('questions')
    expect(desk.filterCounts.questions).toBe(1)
    expect(desk.filterCounts.look).toBe(0)
  })

  it('the 35-questions-heavy shape does not drown Needs your look', () => {
    const reqs = Array.from({ length: 35 }, (_, i) => received(`q${i}`))
    const reviews = reqs.map(r => review(r.finmoRequestId, 'questions'))
    reqs.push(received('flag1'))
    reviews.push(review('flag1', 'flagged'))
    const desk = buildRequestsDesk(reqs, [], new Map(), NOW, reviews)
    expect(desk.filterCounts.questions).toBe(35)
    expect(desk.filterCounts.look).toBe(1) // only the single flagged request
  })

  it('a stale_cycle review is a soft state (never flagged), carries the verbatim line', () => {
    const desk = buildRequestsDesk([received('a')], [], new Map(), NOW, [
      review('a', 'stale_cycle', { reasons: [{ code: 'newer_cycle_available', severity: 'advisory', message: 'a newer Notice of Assessment should be available now', citation: null }] }),
    ])
    const c = cardFor(desk, 'req:a')!
    expect(c.state).toBe('ai_stale_cycle')
    expect(c.review?.reasons[0]?.message).toContain('newer Notice of Assessment')
    expect(c.filter).toBe('look')
  })

  it('takes the BEST review per request (flagged beats passed on a multi-document request)', () => {
    const desk = buildRequestsDesk([received('a')], [], new Map(), NOW, [
      review('a', 'passed', { documentId: 'd1' }),
      review('a', 'flagged', { documentId: 'd2' }),
      review('a', 'stale_cycle', { documentId: 'd3' }),
    ])
    expect(cardFor(desk, 'req:a')!.verdict).toBe('flagged')
  })

  it('PREFERS the condition verdict where a commitment condition covers the request', () => {
    // condition says passed (meets), review says flagged — the condition wins.
    const desk = buildRequestsDesk([received('a')], [bridge('a', 'meets')], new Map(), NOW, [review('a', 'flagged')])
    const c = cardFor(desk, 'req:a')!
    expect(c.verdictSource).toBe('condition')
    expect(c.verdict).toBe('passed')
    expect(c.review).toBeNull()
  })

  it('surfaces content_date from the best review onto the card', () => {
    const desk = buildRequestsDesk([received('a')], [], new Map(), NOW, [
      review('a', 'passed', { contentDate: '2026-03-28', contentDates: { pay_date: '2026-03-28' } }),
    ])
    const c = cardFor(desk, 'req:a')!
    expect(c.contentDate).toBe('2026-03-28')
    expect(c.contentDates).toEqual({ pay_date: '2026-03-28' })
  })

  it('a verdict suppresses the B6.3 day-window advisory (never double-flags)', () => {
    // A bank statement past its 60-day window but with a review verdict -> the
    // verdict governs; the portal does NOT also compute a stale advisory.
    const old = req({ finmoRequestId: 'a', documentName: 'Bank Statement', status: 'for_review', numberOfFiles: 1, filename: 'b.pdf', finmoUpdatedAt: '2026-01-01T00:00:00Z' })
    const withVerdict = buildRequestsDesk([old], [], new Map(), NOW, [review('a', 'passed')])
    expect(cardFor(withVerdict, 'req:a')!.stale).toBeNull()
    // With NO verdict, the day-window advisory still fires (B6.3 fallback).
    const noVerdict = buildRequestsDesk([old], [], new Map(), NOW)
    expect(cardFor(noVerdict, 'req:a')!.stale).not.toBeNull()
  })
})

describe('buildRequestsDesk — Michael\'s decision (B6.4 Task 5)', () => {
  const received = (id: string, status = 'for_review') => req({ finmoRequestId: id, status, numberOfFiles: 1, filename: 'f.pdf' })

  it('an approved decision completes the card and carries the badge alongside', () => {
    const desk = buildRequestsDesk([received('a')], [], new Map(), NOW, [review('a', 'passed')], [decision('a', 'approved')])
    const c = cardFor(desk, 'req:a')!
    expect(c.decision?.verdict).toBe('approved')
    expect(c.filter).toBe('done')
    expect(desk.filterCounts.done).toBe(1)
  })

  it('a sent-back decision is recorded but leaves the card visible (not done)', () => {
    const desk = buildRequestsDesk([received('a')], [], new Map(), NOW, [review('a', 'passed')], [decision('a', 'sent_back')])
    const c = cardFor(desk, 'req:a')!
    expect(c.decision?.verdict).toBe('sent_back')
    expect(c.decision?.note).toContain('resend')
    expect(c.filter).toBe('look') // still needs to resolve
    expect(desk.filterCounts.done).toBe(0)
  })

  it('renders all three truths side by side: Finmo approved, AI flagged, approved by you', () => {
    const desk = buildRequestsDesk(
      [received('a', 'approved')],
      [],
      new Map(),
      NOW,
      [review('a', 'flagged')],
      [decision('a', 'approved')],
    )
    const c = cardFor(desk, 'req:a')!
    expect(c.finmoApproved).toBe(true) // Finmo chip
    expect(c.state).toBe('ai_flagged') // AI verdict is NOT silenced by the Finmo approval
    expect(c.decision?.verdict).toBe('approved') // your decision
    expect(c.filter).toBe('done')
  })
})

describe('buildRequestsDesk — withdrawn requests (B6.4 Task 2)', () => {
  it('a withdrawn request leaves the active groups + counts, shown under its section', () => {
    const desk = buildRequestsDesk(
      [
        req({ finmoRequestId: 'a', borrowerFinmoId: 'fb', borrowerName: 'Priya Anand', status: 'requested' }),
        req({ finmoRequestId: 'gone', borrowerFinmoId: 'fb', borrowerName: 'Priya Anand', documentName: 'Sale Agreement', withdrawnAt: '2026-07-09T00:00:00Z' }),
      ],
      [],
    )
    const section = desk.sections.find(s => s.label === 'Priya')!
    expect(section.cards.map(c => c.key)).toEqual(['req:a']) // only the active one
    expect(section.total).toBe(1)
    expect(section.withdrawn.map(w => w.name)).toEqual(['Sale Agreement'])
    expect(desk.filterCounts.all).toBe(1)
    expect(desk.withdrawnCount).toBe(1)
  })

  it('a section holding only withdrawn ghosts still renders (nothing lost)', () => {
    const desk = buildRequestsDesk(
      [req({ finmoRequestId: 'gone', borrowerFinmoId: 'fz', borrowerName: 'Eli Fraser', documentName: 'Old Request', withdrawnAt: '2026-07-09T00:00:00Z' })],
      [],
    )
    const section = desk.sections.find(s => s.label === 'Eli')!
    expect(section.cards.length).toBe(0)
    expect(section.withdrawn.length).toBe(1)
    expect(desk.isEmpty).toBe(false)
  })
})

describe('residualDocuments (B6.4 Task 3)', () => {
  const doc = (p: Partial<ResidualDocInput> = {}): ResidualDocInput => ({
    id: p.id ?? `id-${++n}`,
    docType: p.docType ?? 'credit_report',
    source: p.source ?? 'finmo',
    receivedAt: p.receivedAt ?? '2026-06-28T00:00:00Z',
    createdAt: p.createdAt ?? '2026-06-28T00:00:00Z',
    provenance: p.provenance ?? 'real',
    reviewStatus: p.reviewStatus ?? 'reviewed',
    finmoRequestId: p.finmoRequestId ?? null,
  })

  it('lists documents with no request link, kind/source/date', () => {
    const out = residualDocuments([doc({ id: 'x', docType: 'consent_form' })])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ documentId: 'x', kind: 'consent_form', source: 'finmo' })
  })

  it('excludes request-linked, synthetic, rejected, and already-reparented documents', () => {
    const out = residualDocuments(
      [
        doc({ id: 'linked', finmoRequestId: 'req-1' }),
        doc({ id: 'synthetic', provenance: 'synthetic' }),
        doc({ id: 'rejected', reviewStatus: 'rejected' }),
        doc({ id: 'reparented' }),
        doc({ id: 'keep' }),
      ],
      new Set(['reparented']),
    )
    expect(out.map(d => d.documentId)).toEqual(['keep'])
  })
})

describe('buildRequestsDesk — adversarial-review regressions (B6.4)', () => {
  const received = (id: string) => req({ finmoRequestId: id, status: 'for_review', numberOfFiles: 1, filename: 'f.pdf' })

  it('a review-path card carries the best review document id, so its evidence reparents (not the residual)', () => {
    const desk = buildRequestsDesk([received('a')], [], new Map(), NOW, [review('a', 'flagged', { documentId: 'doc-xyz' })])
    // documentId flows to the card so the desk reparents the evidence into THIS
    // request, rather than mislabelling it under "Not tied to a request".
    expect(cardFor(desk, 'req:a')!.documentId).toBe('doc-xyz')
  })

  it('a commitment-derived card is origin "commitment" (never decidable via the request gate)', () => {
    // The component gates Approve/Send-back on origin==='finmo'; a commitment card
    // carries no finmo_request_id and must never POST a condition id to the gate.
    const desk = buildRequestsDesk(
      [],
      [cond({ id: 'k1', docKind: 'fire_insurance_binder', presence: 'obtained' })],
    )
    const c = cardFor(desk, 'cond:k1')!
    expect(c.origin).toBe('commitment')
    expect(c.received).not.toBeNull()
  })

  it('a condition bridging a WITHDRAWN request still renders as its own card (obligation not lost)', () => {
    const desk = buildRequestsDesk(
      [req({ finmoRequestId: 'gone', documentName: 'LOE', withdrawnAt: '2026-07-09T00:00:00Z' })],
      [cond({ id: 'c9', docKind: 'letter_of_employment', presence: 'needs_input', presenceDetail: { matched_request_id: 'gone' } })],
    )
    // The request is a ghost; the still-open obligation renders as a commitment card.
    expect(desk.withdrawnCount).toBe(1)
    const c = cardFor(desk, 'cond:c9')!
    expect(c.origin).toBe('commitment')
    expect(c.state).toBe('waiting')
  })
})
