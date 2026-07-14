// Lender-knowledge claims pipeline: pure helper coverage (grouping,
// staleness wording, document status wording, held-count reading) plus the
// penalty-methodology consumer — an approved ird_comparison_basis claim
// flips methodologyKnown for that lender only, its source rides the
// savings-analysis log, and the framing math never moves (3MI stays the
// floor whether the methodology is known or not).

import { describe, expect, it } from 'vitest'
import {
  CLAIM_TOPIC_ORDER,
  claimCitation,
  claimStalenessNote,
  documentStatusWording,
  groupApprovedByTopic,
  groupPendingByDocument,
  heldForAsOfCount,
  selectIrdBasisClaim,
  topicLabel,
} from '../lib/knowledge-claims'
import { lenderMethodologyFor, methodologyFromClaim } from '../lib/lenders'
import { penaltyEstimate, parseSmmRow } from '../lib/smm'
import { analyzeMortgage } from '../lib/smm-analysis'
import { buildSavingsLogEntry, type SavingsLogInputs } from '../lib/savings-log'
import type { BookQuote } from '../lib/smm-match'
import type { KnowledgeClaimRow } from '../lib/underwriting'

function claim(over: Partial<KnowledgeClaimRow>): KnowledgeClaimRow {
  return {
    id: 'c-1',
    lenderSlug: 'sample-bank',
    program: null,
    topic: 'policy',
    claimKey: 'some_claim',
    claimValue: null,
    claimText: 'A synthetic claim.',
    sourceDocumentId: 'doc-1',
    sourcePage: 3,
    sourceSnippet: 'snippet',
    asOfDate: '2026-07-01',
    asOfSource: 'document date',
    status: 'approved',
    confidence: 0.9,
    extractedBy: 'test',
    createdAt: '2026-07-01T00:00:00Z',
    decidedAt: '2026-07-02T00:00:00Z',
    ...over,
  }
}

describe('groupApprovedByTopic', () => {
  it('renders topics in the canonical order and drops pending claims', () => {
    const groups = groupApprovedByTopic([
      claim({ id: 'a', topic: 'contact' }),
      claim({ id: 'b', topic: 'penalty_methodology' }),
      claim({ id: 'c', topic: 'compensation' }),
      claim({ id: 'd', topic: 'compensation', status: 'pending' }),
    ])
    expect(groups.map(g => g.topic)).toEqual(['penalty_methodology', 'compensation', 'contact'])
    expect(groups.find(g => g.topic === 'compensation')!.claims.map(c => c.id)).toEqual(['c'])
  })

  it('sorts an unknown future topic after the known ones instead of dropping it', () => {
    const groups = groupApprovedByTopic([
      claim({ id: 'a', topic: 'brand_new_topic' }),
      claim({ id: 'b', topic: 'process' }),
    ])
    expect(groups.map(g => g.topic)).toEqual(['process', 'brand_new_topic'])
  })

  it('the canonical order is the spec order', () => {
    expect([...CLAIM_TOPIC_ORDER]).toEqual([
      'penalty_methodology',
      'compensation',
      'program_criteria',
      'product',
      'policy',
      'process',
      'contact',
    ])
  })
})

describe('claimStalenessNote', () => {
  it('says nothing inside twelve months, plain words past them', () => {
    expect(claimStalenessNote('2026-07-01', '2026-07-14')).toBeNull()
    expect(claimStalenessNote('2025-07-14', '2026-07-14')).toBeNull() // exactly 365 days
    expect(claimStalenessNote('2025-07-13', '2026-07-14')).toBe(
      'over a year old — confirm before relying on it',
    )
  })

  it('never fires on a null as-of (that state has its own wording)', () => {
    expect(claimStalenessNote(null, '2026-07-14')).toBeNull()
  })
})

describe('claimCitation', () => {
  it('carries document name, page, and as-of', () => {
    expect(claimCitation(claim({}), 'Broker guide 2026')).toBe('Broker guide 2026, p.3, as of 2026-07-01')
  })

  it('degrades honestly when parts are missing', () => {
    expect(claimCitation(claim({ sourcePage: null, asOfDate: null }), null)).toBe(
      'source document, no as-of recorded',
    )
  })
})

describe('documentStatusWording', () => {
  const doc = (status: any, error: string | null = null) => ({ knowledgeStatus: status, knowledgeError: error })

  it('speaks each lifecycle state in plain words', () => {
    expect(documentStatusWording(doc('uploaded'), 0, 0)).toEqual({ text: 'processing queued', tone: 'gray' })
    expect(documentStatusWording(doc('processing'), 0, 0)).toEqual({ text: 'processing', tone: 'gray' })
    expect(documentStatusWording(doc('extracted'), 3, 0)).toEqual({
      text: '3 claims awaiting approval',
      tone: 'amber',
    })
    expect(documentStatusWording(doc('extracted'), 1, 0).text).toBe('1 claim awaiting approval')
    expect(documentStatusWording(doc('extracted'), 0, 2)).toEqual({ text: 'live', tone: 'green' })
    expect(documentStatusWording(doc('no_claims'), 0, 0)).toEqual({
      text: 'indexed for search (no structured claims)',
      tone: 'gray',
    })
  })

  it('extraction_failed is loud and carries the recorded error', () => {
    const w = documentStatusWording(doc('extraction_failed', 'scan below OCR floor'), 0, 0)
    expect(w.tone).toBe('red')
    expect(w.text).toContain('scan below OCR floor')
    expect(documentStatusWording(doc('extraction_failed'), 0, 0).text).toContain('no error recorded')
  })

  it('extracted with nothing pending and nothing approved states the decided-against case', () => {
    expect(documentStatusWording(doc('extracted'), 0, 0).tone).toBe('gray')
  })
})

describe('groupPendingByDocument', () => {
  it('groups pending claims per document with the document name', () => {
    const groups = groupPendingByDocument(
      [
        claim({ id: 'a', status: 'pending', sourceDocumentId: 'doc-1' }),
        claim({ id: 'b', status: 'pending', sourceDocumentId: 'doc-1' }),
        claim({ id: 'c', status: 'pending', sourceDocumentId: 'doc-2', lenderSlug: 'other-bank' }),
        claim({ id: 'd', status: 'approved', sourceDocumentId: 'doc-1' }),
      ],
      [
        { id: 'doc-1', docType: 'Broker guide 2026' },
        { id: 'doc-2', docType: 'Comp schedule' },
      ],
    )
    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({ documentId: 'doc-1', docName: 'Broker guide 2026', lenderSlug: 'sample-bank' })
    expect(groups[0].claims.map(c => c.id)).toEqual(['a', 'b'])
    expect(groups[1]).toMatchObject({ documentId: 'doc-2', docName: 'Comp schedule' })
  })

  it('an unnamed or unmatched document renders as Untitled, never crashes', () => {
    const groups = groupPendingByDocument([claim({ status: 'pending', sourceDocumentId: 'missing' })], [])
    expect(groups[0].docName).toBe('Untitled document')
  })
})

describe('heldForAsOfCount', () => {
  it('reads arrays, counts, and garbage defensively', () => {
    expect(heldForAsOfCount([{ claimId: 'a' }, { claimId: 'b' }])).toBe(2)
    expect(heldForAsOfCount(3)).toBe(3)
    expect(heldForAsOfCount(undefined)).toBe(0)
    expect(heldForAsOfCount('two')).toBe(0)
    expect(heldForAsOfCount(-1)).toBe(0)
  })
})

describe('selectIrdBasisClaim', () => {
  it('picks the approved LENDER-WIDE ird_comparison_basis claim with its as-of date', () => {
    const picked = selectIrdBasisClaim([
      claim({ id: 'p1', claimKey: 'ird_comparison_basis', program: 'excalibur', claimValue: { basis: 'discounted_rate' } }),
      claim({ id: 'p2', claimKey: 'ird_comparison_basis', program: null, claimValue: { basis: 'posted_rate' } }),
      claim({ id: 'p3', claimKey: 'base_comp_bps' }),
    ])
    expect(picked).toEqual({ id: 'p2', claim_value: { basis: 'posted_rate' }, asOfDate: '2026-07-01' })
  })

  it('ignores pending claims and returns null when nothing qualifies', () => {
    expect(
      selectIrdBasisClaim([claim({ claimKey: 'ird_comparison_basis', status: 'pending' })]),
    ).toBeNull()
    expect(selectIrdBasisClaim([])).toBeNull()
  })

  it('FAIL CLOSED: a program-scoped claim never applies lender-wide (does not flip method-known)', () => {
    const picked = selectIrdBasisClaim([
      claim({ id: 'p1', claimKey: 'ird_comparison_basis', program: 'excalibur', claimValue: { basis: 'posted_rate' } }),
    ])
    expect(picked).toBeNull()
    // And therefore the consumer stays methodology-unknown.
    expect(methodologyFromClaim(picked)).toBeNull()
  })
})

// ─── The penalty-methodology consumer ────────────────────────────────────────

describe('methodologyFromClaim', () => {
  it('posted_rate maps to standard, discounted_rate to discounted, each with the DATED claim source', () => {
    expect(
      methodologyFromClaim({ claim_value: { basis: 'posted_rate' }, id: 'claim-1', asOfDate: '2026-07-01' }),
    ).toEqual({
      irdMethod: 'standard',
      source: 'knowledge_claim:claim-1@2026-07-01',
    })
    expect(
      methodologyFromClaim({ claim_value: { basis: 'discounted_rate' }, id: 'claim-2', asOfDate: '2026-06-15' }),
    ).toEqual({
      irdMethod: 'discounted',
      source: 'knowledge_claim:claim-2@2026-06-15',
    })
    // Defensive: a dateless claim still resolves, source undated.
    expect(methodologyFromClaim({ claim_value: { basis: 'posted_rate' }, id: 'claim-3' })?.source).toBe(
      'knowledge_claim:claim-3',
    )
  })

  it('fails closed on every other basis and on malformed values', () => {
    expect(methodologyFromClaim({ claim_value: { basis: 'contract_rate' }, id: 'x' })).toBeNull()
    expect(methodologyFromClaim({ claim_value: { basis: 'reinvestment_rate' }, id: 'x' })).toBeNull()
    expect(methodologyFromClaim({ claim_value: 'posted_rate', id: 'x' })).toBeNull()
    expect(methodologyFromClaim({ claim_value: null, id: 'x' })).toBeNull()
    expect(methodologyFromClaim(null)).toBeNull()
  })
})

// The seasoned proving shape from the savings-log golden set, with the
// lender swapped to one ABSENT from the hardcoded LENDERS table.
function unlistedLenderRow() {
  return parseSmmRow({
    'Household ID': 'H-claim', 'File reference': 'F', 'First name': 'A', 'Last name': 'B', 'Client type': 'CLIENT',
    Email: 'a@b.com', Phone: '1', 'Property address': '1 St', 'Property type': 'detached', 'Property occupancy': 'owner_occupied',
    'Estimated home value': '$700,000.00', 'Mortgage amount': '$500,000.00', 'Mortgage outstanding balance': '$480,116.59',
    'Mortgage rate': '5.50%', 'Mortgage rate type': 'fixed', 'Mortgage closing date': '2024-07-01', 'Mortgage start date': '2024-07-01',
    'Mortgage maturity date': '2029-07-01', 'Mortgage amortization (months)': '300', 'Mortgage term (months)': '60',
    'Mortgage lender': 'Unlisted Lender Co', 'Mortgage insurance type': 'Uninsurable', 'Savings potential': '$800.00',
    'Payment relief (monthly)': '$400.00', 'Accessible equity': '$150,000.00', 'Purchasing power': '$100,000.00',
  })
}

const BOOK: BookQuote[] = [
  { rate: 4.59, rateType: 'fixed', termMonths: 60, productClass: 'conventional', asOfDate: '2026-06-30', status: 'approved', lenderSlug: 'rfa', primeVariance: null, eligibilitySource: 'variant:(none)' },
]

describe('an approved ird_comparison_basis claim flips methodologyKnown for that lender only', () => {
  const ASOF = '2026-07-13'
  const postedClaim = { claim_value: { basis: 'posted_rate' }, id: 'claim-1', asOfDate: '2026-07-01' }

  it('the lender is genuinely absent from LENDERS (the flip can only come from the claim)', () => {
    expect(lenderMethodologyFor('Unlisted Lender Co')).toBeNull()
  })

  it('methodologyKnown = table-known OR claim-known, exactly as the pages compute it', () => {
    const tableKnown = lenderMethodologyFor('Unlisted Lender Co') != null
    expect(tableKnown || methodologyFromClaim(postedClaim) != null).toBe(true)
    // contract_rate does NOT flip.
    expect(tableKnown || methodologyFromClaim({ claim_value: { basis: 'contract_rate' }, id: 'claim-x' }) != null).toBe(false)
    // Another lender without a claim stays unknown — the flip is per lender.
    expect(lenderMethodologyFor('Another Unlisted Co') != null || methodologyFromClaim(null) != null).toBe(false)
    // A table lender stays table-known with the table source (MCAP's existing record).
    expect(lenderMethodologyFor('MCAP')?.irdMethod).toBe('standard')
  })

  it('the log entry carries methodology_source=knowledge_claim:<id>@<as_of>; absent, the key is absent', () => {
    const row = unlistedLenderRow()
    const { analysis } = analyzeMortgage(row, BOOK, ASOF, { methodologyClaim: postedClaim })
    const method = methodologyFromClaim(postedClaim)!
    const entry = buildSavingsLogEntry({
      row,
      analysis,
      surface: 'board',
      uploadId: null,
      actingEmail: 'test@foxmortgage.ca',
      todayYMD: ASOF,
      methodologyKnown: true,
      methodologySource: method.source,
      crossFamilyApproved: false,
    })
    const inputs = entry.inputs as SavingsLogInputs
    expect(inputs.methodologyKnown).toBe(true)
    expect(inputs.methodology_source).toBe('knowledge_claim:claim-1@2026-07-01')

    const { analysis: bare } = analyzeMortgage(row, BOOK, ASOF, {})
    const bareEntry = buildSavingsLogEntry({
      row,
      analysis: bare,
      surface: 'board',
      uploadId: null,
      actingEmail: 'test@foxmortgage.ca',
      todayYMD: ASOF,
      methodologyKnown: false,
      crossFamilyApproved: false,
    })
    expect('methodology_source' in (bareEntry.inputs as Record<string, unknown>)).toBe(false)
  })

  it('framing math is unchanged: 3MI stays the floor whether the methodology is known or not', () => {
    const known = penaltyEstimate(480116.59, 5.5, 'fixed', true)
    const unknown = penaltyEstimate(480116.59, 5.5, 'fixed', false)
    expect(known.estimateForMath).toBe(unknown.estimateForMath)
    expect(known.estimateForMath).toBeCloseTo(480116.59 * 0.055 * 0.25, 6)
    expect(known.methodologyKnown).toBe(true)
    expect(unknown.methodologyKnown).toBe(false)

    // And end to end: the claim changes no figure on the analysis itself.
    const row = unlistedLenderRow()
    const withClaim = analyzeMortgage(row, BOOK, ASOF, { methodologyClaim: postedClaim }).analysis
    const withoutClaim = analyzeMortgage(row, BOOK, ASOF, {}).analysis
    expect(withClaim.bucket).toBe(withoutClaim.bucket)
    expect(withClaim.netBenefit).toBe(withoutClaim.netBenefit)
    expect(withClaim.monthlySaving).toBe(withoutClaim.monthlySaving)
    expect(withClaim.penalty?.threeMonthsInterest ?? null).toBe(withoutClaim.penalty?.threeMonthsInterest ?? null)
  })

  it('topicLabel keeps display wording out of the components', () => {
    expect(topicLabel('penalty_methodology')).toBe('penalty methodology')
  })
})
