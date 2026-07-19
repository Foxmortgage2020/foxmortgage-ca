// The client document checklist (B8a). The builder reduces the Finmo request
// list to the three states a client understands, reading ONLY the raw status +
// file count — never a verdict — so no internal judgment can reach a client.

import { describe, it, expect } from 'vitest'
import { buildClientChecklist } from '../lib/client-checklist'
import type { DocumentRequestRow } from '../lib/underwriting'

let n = 0
function req(over: Partial<DocumentRequestRow>): DocumentRequestRow {
  n += 1
  return {
    finmoRequestId: `r${n}`,
    borrowerFinmoId: null,
    borrowerName: null,
    documentName: `Document ${n}`,
    status: 'requested',
    numberOfFiles: 0,
    hasSrc: false,
    filename: null,
    requestedAt: null,
    finmoUpdatedAt: null,
    withdrawnAt: null,
    ...over,
  }
}

describe('buildClientChecklist — the three client states', () => {
  it('maps approved to done, for_review and files to received, empty requests to waiting', () => {
    const c = buildClientChecklist([
      req({ status: 'approved' }),
      req({ status: 'approved' }),
      req({ status: 'for_review', numberOfFiles: 0 }), // being looked over, no file count yet
      req({ status: 'requested', numberOfFiles: 3 }), // files in
      req({ status: 'requested', hasSrc: true }), // source present
      req({ status: 'requested', documentName: 'Photo ID' }), // waiting
      req({ status: 'requested', documentName: 'Void cheque' }), // waiting
    ])!
    expect(c.total).toBe(7)
    expect(c.done).toBe(2)
    expect(c.received).toBe(3)
    expect(c.waiting).toBe(2)
    // Single borrower (all null) -> one headerless group with the two names.
    expect(c.groups).toEqual([{ borrower: null, names: ['Photo ID', 'Void cheque'] }])
  })

  it('everything approved reads as done with no waiting groups', () => {
    const c = buildClientChecklist([
      req({ status: 'approved' }),
      req({ status: 'approved' }),
      req({ status: 'approved' }),
    ])!
    expect(c).toMatchObject({ total: 3, done: 3, received: 0, waiting: 0, groups: [] })
  })

  it('returns null when there are no active requests, so the card shows guidance', () => {
    expect(buildClientChecklist([])).toBeNull()
    expect(buildClientChecklist([req({ withdrawnAt: '2026-07-01T00:00:00Z' })])).toBeNull()
  })

  it('drops withdrawn requests from every count', () => {
    const c = buildClientChecklist([
      req({ status: 'approved' }),
      req({ status: 'requested', documentName: 'Still needed' }),
      req({ status: 'approved', withdrawnAt: '2026-07-01T00:00:00Z' }), // withdrawn, ignored
      req({ status: 'requested', withdrawnAt: '2026-07-01T00:00:00Z' }), // withdrawn, ignored
    ])!
    expect(c.total).toBe(2)
    expect(c.done).toBe(1)
    expect(c.waiting).toBe(1)
    expect(c.groups).toEqual([{ borrower: null, names: ['Still needed'] }])
  })

  it('groups the waiting list by borrower given-name when the file has two or more borrowers', () => {
    const c = buildClientChecklist([
      req({ status: 'requested', borrowerName: 'David Mehmi', documentName: 'David pay stub' }),
      req({ status: 'requested', borrowerName: 'David Mehmi', documentName: 'David tax bill' }),
      req({ status: 'requested', borrowerName: 'Lyntje Zinger', documentName: 'Lyntje ID' }),
      req({ status: 'approved', borrowerName: 'Lyntje Zinger' }),
    ])!
    expect(c.groups).toEqual([
      { borrower: 'David', names: ['David pay stub', 'David tax bill'] },
      { borrower: 'Lyntje', names: ['Lyntje ID'] },
    ])
  })

  it('matches the live F053107 shape: 19 active, 15 done, 4 received, 0 waiting', () => {
    const rows: DocumentRequestRow[] = [
      ...Array.from({ length: 15 }, () => req({ status: 'approved', borrowerName: 'David Mehmi', numberOfFiles: 1 })),
      ...Array.from({ length: 4 }, () => req({ status: 'for_review', borrowerName: 'Lyntje Zinger', numberOfFiles: 0 })),
      req({ status: 'approved', withdrawnAt: '2026-07-01T00:00:00Z' }),
      req({ status: 'for_review', withdrawnAt: '2026-07-01T00:00:00Z' }),
    ]
    const c = buildClientChecklist(rows)!
    expect(c).toMatchObject({ total: 19, done: 15, received: 4, waiting: 0 })
    expect(c.groups).toEqual([]) // nothing waiting, so no named groups
  })
})
