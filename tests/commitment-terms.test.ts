// Committed terms (2026-08-04) — the pure rules, the authority contract, and
// the boundary. What is asserted here is what the card promises Michael:
// the printed string is the value, a resolution never replaces it, nothing is
// dropped, and the decision surface carries no way to edit a term.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  COMMITMENT_TERMS_ACTIONS,
  COMMITMENT_TERM_ORDER,
  COMMITMENT_TERM_SELECT,
  TERM_NOTE_MAX,
  conventionLabel,
  groupTermsByDocument,
  isUuid,
  orderTerms,
  spellIsoDate,
  termDisplay,
  termLabel,
  termSetStatus,
  termSetStatusLabel,
  type CommitmentTermRow,
} from '@/lib/commitment-terms'
import { PERMISSIONS, PERMISSION_LABELS, roleCan } from '@/config/authority'
import { demoDealCommitmentTerms } from '@/lib/demo-fixtures'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

function row(over: Partial<CommitmentTermRow> = {}): CommitmentTermRow {
  return {
    id: 'r1',
    documentId: 'doc-1',
    fieldKey: 'lender',
    printed: 'UnionLink Mortgage Limited',
    valueText: null,
    valueNumeric: null,
    page: 1,
    sourceSnippet: 'UnionLink Mortgage Limited Unit 2',
    confidence: 'exact',
    dateConvention: null,
    dateConventionBasis: null,
    extractor: 'commitment-terms@0.1.0',
    gateStatus: 'pending',
    createdAt: '2026-08-05T00:46:19Z',
    ...over,
  }
}

describe('the authority key is the cross-repo contract', () => {
  it("'approvals.commitment_terms.decide' exists and is admin only", () => {
    expect(PERMISSIONS['approvals.commitment_terms.decide']).toEqual(['admin'])
  })

  it('no non-admin role can reach it', () => {
    expect(roleCan(['admin'], 'approvals.commitment_terms.decide')).toBe(true)
    for (const r of ['ops', 'underwriting-reviewer', 'agent', 'investor', 'financial-planner', '']) {
      expect(roleCan([r], 'approvals.commitment_terms.decide'), `${r} must not decide terms`).toBe(false)
    }
    // The combination case: an extra role never adds up to the grant.
    expect(roleCan(['ops', 'agent', 'underwriting-reviewer'], 'approvals.commitment_terms.decide')).toBe(false)
  })

  it('it carries a plain-language label like every other key', () => {
    expect(PERMISSION_LABELS['approvals.commitment_terms.decide']).toBeTruthy()
  })

  it('it twins the conditions gate off the same commitment: both admin only', () => {
    expect(PERMISSIONS['approvals.conditions.decide']).toEqual(
      PERMISSIONS['approvals.commitment_terms.decide'],
    )
  })
})

describe('rule 1 — the printed string is the value, the numeric never renders', () => {
  it('renders printed, not the parsed figure', () => {
    const d = termDisplay(row({ fieldKey: 'rate', printed: 'Prime - 0.85% : 3.60%', valueNumeric: 3.6 }))
    expect(d.printed).toBe('Prime - 0.85% : 3.60%')
    expect(JSON.stringify(d)).not.toContain('3.6"')
    expect(d.reading).toBeNull()
  })

  it('a missing printed string is NAMED, never replaced by the numeric', () => {
    const d = termDisplay(row({ fieldKey: 'loan_amount', printed: null, valueNumeric: 685400 }))
    expect(d.printed).toBeNull()
    expect(d.missingNote).toMatch(/no printed text/i)
    expect(JSON.stringify(d)).not.toContain('685400')
  })

  it('whitespace-only printed counts as missing', () => {
    expect(termDisplay(row({ printed: '   ' })).printed).toBeNull()
  })
})

describe('rule 2 — a resolution sits beside the printed token, never instead of it', () => {
  const maturity = row({
    fieldKey: 'maturity_date',
    printed: '06/10/2031',
    valueText: '2031-10-06',
    dateConvention: 'dmy',
    dateConventionBasis: 'impossible_component: 4 token(s) carry a first component above 12',
    page: 4,
  })

  it('the maturity shows BOTH the printed token and the resolved date', () => {
    const d = termDisplay(maturity)
    expect(d.printed).toBe('06/10/2031')
    expect(d.reading).not.toBeNull()
    expect(d.reading!.kind).toBe('date')
    expect(d.reading!.value).toContain('2031-10-06')
    // Spelled out, because another numeric triple would be just as ambiguous.
    expect(d.reading!.value).toContain('October')
  })

  it('the convention and the basis both render — the reader can check the reasoning', () => {
    const d = termDisplay(maturity)
    expect((d.reading as any).convention).toBe('day-month-year')
    expect((d.reading as any).basis).toContain('impossible_component')
  })

  it('reading 06/10/2031 the other way round would move the renewal by four months', () => {
    // The exact risk the dual render exists to prevent, stated as a test.
    expect(spellIsoDate('2031-10-06')).toContain('6 October 2031')
    expect(spellIsoDate('2031-06-10')).toContain('10 June 2031')
  })

  it('a classification that differs from the printed token renders as a reading', () => {
    const d = termDisplay(
      row({ fieldKey: 'rate_type', printed: 'Prime Lending Rate - 0.85%', valueText: 'variable' }),
    )
    expect(d.printed).toBe('Prime Lending Rate - 0.85%')
    expect(d.reading).toEqual({ kind: 'text', value: 'variable' })
  })

  it('a value_text identical to the printed string adds no noise', () => {
    const d = termDisplay(row({ printed: 'UnionLink Mortgage Limited', valueText: 'UnionLink Mortgage Limited' }))
    expect(d.reading).toBeNull()
  })

  it('spellIsoDate refuses to invent: a non-ISO value passes through unchanged', () => {
    expect(spellIsoDate('06/10/2031')).toBe('06/10/2031')
    expect(spellIsoDate('2031-13-06')).toBe('2031-13-06')
    expect(spellIsoDate('')).toBe('')
  })

  it('an unknown convention code renders verbatim rather than as nothing', () => {
    expect(conventionLabel('dmy')).toBe('day-month-year')
    expect(conventionLabel('ydm')).toBe('ydm')
    expect(conventionLabel(null)).toBeNull()
  })
})

describe('rule 3 — nothing is dropped', () => {
  it('the ten known fields order as a commitment is read', () => {
    expect(COMMITMENT_TERM_ORDER).toEqual([
      'lender',
      'loan_amount',
      'rate',
      'rate_type',
      'term_months',
      'amortization_months',
      'payment',
      'maturity_date',
      'prepayment_privileges',
      'penalty_basis',
    ])
  })

  it('shuffled rows come back in canonical order', () => {
    const shuffled = ['payment', 'lender', 'maturity_date', 'rate'].map((k, i) =>
      row({ id: `r${i}`, fieldKey: k }),
    )
    expect(orderTerms(shuffled).map(r => r.fieldKey)).toEqual(['lender', 'rate', 'payment', 'maturity_date'])
  })

  it('an unrecognised field still renders, sorted last — never filtered away', () => {
    const rows = [row({ id: 'x', fieldKey: 'cashback_pct' }), row({ id: 'y', fieldKey: 'lender' })]
    const out = orderTerms(rows)
    expect(out).toHaveLength(2)
    expect(out.map(r => r.fieldKey)).toEqual(['lender', 'cashback_pct'])
    // And it gets a readable label rather than an empty one.
    expect(termLabel('cashback_pct')).toBe('Cashback pct')
  })

  it('the read projection names every column the rules consume', () => {
    for (const col of [
      'field_key',
      'printed',
      'value_text',
      'value_numeric',
      'page',
      'source_snippet',
      'confidence',
      'date_convention',
      'date_convention_basis',
      'gate_status',
      'document_id',
    ]) {
      expect(COMMITMENT_TERM_SELECT.split(','), `${col} must be selected`).toContain(col)
    }
  })
})

describe('the set status — the gate is per document, so the set moves together', () => {
  const set = (statuses: string[]) => statuses.map((s, i) => row({ id: `r${i}`, gateStatus: s }))

  it('all pending', () => {
    const s = termSetStatus(set(Array(10).fill('pending')))
    expect(s).toMatchObject({ total: 10, pending: 10, state: 'pending', decidable: true })
    expect(termSetStatusLabel(s)).toBe('10 awaiting your decision')
  })

  it('all approved is not decidable — the button is gone, not disabled-looking', () => {
    const s = termSetStatus(set(Array(10).fill('approved')))
    expect(s.state).toBe('approved')
    expect(s.decidable).toBe(false)
  })

  it('all rejected', () => {
    expect(termSetStatus(set(Array(3).fill('rejected'))).state).toBe('rejected')
  })

  it('a mixed set is named exactly, never rounded to a winner', () => {
    const s = termSetStatus(set(['pending', 'approved', 'approved', 'rejected']))
    expect(s.state).toBe('mixed')
    expect(s.decidable).toBe(true)
    expect(termSetStatusLabel(s)).toBe('Mixed: 1 pending, 2 approved, 1 rejected')
  })

  it('an unknown gate_status is counted as other, never silently as approved', () => {
    const s = termSetStatus(set(['pending', 'superseded']))
    expect(s.other).toBe(1)
    expect(s.approved).toBe(0)
    expect(s.state).toBe('mixed')
  })

  it('empty is empty and decides nothing', () => {
    const s = termSetStatus([])
    expect(s.state).toBe('empty')
    expect(s.decidable).toBe(false)
  })
})

describe('grouping by document — an amendment gets its own set and its own button', () => {
  it('splits by document and puts the newest set first', () => {
    const rows = [
      row({ id: 'a', documentId: 'doc-old', createdAt: '2026-07-01T00:00:00Z' }),
      row({ id: 'b', documentId: 'doc-new', createdAt: '2026-08-01T00:00:00Z', fieldKey: 'rate' }),
      row({ id: 'c', documentId: 'doc-new', createdAt: '2026-08-01T00:00:01Z', fieldKey: 'lender' }),
    ]
    const groups = groupTermsByDocument(rows)
    expect(groups.map(g => g.documentId)).toEqual(['doc-new', 'doc-old'])
    expect(groups[0].terms.map(t => t.fieldKey)).toEqual(['lender', 'rate'])
    expect(groups[0].status.total).toBe(2)
    expect(groups[1].status.total).toBe(1)
  })

  it('no rows means no groups', () => {
    expect(groupTermsByDocument([])).toEqual([])
  })
})

describe('the call is guarded before a 60-second token is spent', () => {
  it('the action vocabulary is exactly approve and reject', () => {
    expect(COMMITMENT_TERMS_ACTIONS).toEqual(['approve', 'reject'])
  })

  it('a malformed document id is refused locally', () => {
    expect(isUuid('9424b55c-57d8-413a-9410-ef03627f1199')).toBe(true)
    expect(isUuid('9424B55C-57D8-413A-9410-EF03627F1199')).toBe(true)
    for (const bad of ['', 'not-a-uuid', 'ba8d8b01-09e5-444f-98f4', 42, null, undefined, '../../etc', 'demo-deal-1']) {
      expect(isUuid(bad as any), `${String(bad)} must be refused`).toBe(false)
    }
  })

  it('the note ceiling is the contract-stated 2000', () => {
    expect(TERM_NOTE_MAX).toBe(2000)
  })
})

describe('the route is gated, keyed on the document, and cannot carry a value', () => {
  const route = read('app/api/portal/admin/gates/commitment-terms/[documentId]/decision/route.ts')

  it('checks the authority key before anything else', () => {
    expect(route).toContain("apiPermission('approvals.commitment_terms.decide')")
    const gateAt = route.indexOf('apiPermission')
    const callAt = route.indexOf('decideCommitmentTerms(')
    expect(gateAt).toBeGreaterThan(-1)
    expect(callAt).toBeGreaterThan(gateAt)
  })

  it('refuses a malformed id and an unknown action with 422', () => {
    expect(route).toContain('isUuid(params.documentId)')
    expect(route).toContain('COMMITMENT_TERMS_ACTIONS.includes(action)')
  })

  it('refuses an over-long note rather than truncating what a person wrote', () => {
    expect(route).toContain('TERM_NOTE_MAX')
    expect(route).toMatch(/note\.length > TERM_NOTE_MAX/)
  })

  it('forwards the BROWSER-minted token and mints none of its own', () => {
    expect(route).toContain("req.headers.get('x-gates-token')")
    expect(route).not.toContain('getToken')
    expect(route).not.toContain('auth()')
  })

  it('reads nothing but action and note off the body — no value, page, snippet or status', () => {
    for (const forbidden of ['body?.value', 'body?.printed', 'body?.page', 'body?.snippet', 'body?.gate_status', 'body?.status']) {
      expect(route, `${forbidden} must never be read`).not.toContain(forbidden)
    }
  })
})

describe('the gates client sends the enumerated shape and nothing else', () => {
  const gates = read('lib/gates.ts')

  it('posts to the per-document decision path', () => {
    expect(gates).toContain('/api/gates/commitment-terms/${documentId}/decision')
  })

  it('is demo-blocked like every other decision write', () => {
    expect(gates).toMatch(/decideCommitmentTerms[\s\S]{0,320}DemoWriteBlocked\('decideCommitmentTerms'\)/)
  })

  it('rides withNote, so only action and note can leave', () => {
    expect(gates).toMatch(/decideCommitmentTerms[\s\S]{0,420}withNote\(\{ action \}, note\)/)
  })
})

describe('the card decides, and cannot edit', () => {
  const card = read('components/admin/CommitmentTermsCard.tsx')

  it('the ONLY writes it can make are approve and reject on the terms path', () => {
    const posts = card.match(/fetch\(\s*`?[^`)]*`?/g) ?? []
    expect(posts).toHaveLength(1)
    expect(card).toContain('/api/portal/admin/gates/commitment-terms/')
    const actions = Array.from(new Set(Array.from(card.matchAll(/decide\('(\w+)'\)/g), m => m[1])))
    expect(actions.sort()).toEqual(['approve', 'reject'])
  })

  it('carries NO edit control over a term — the note is the only input', () => {
    // One textarea (the note). No text/number input, no select, no per-term form.
    expect(card).not.toMatch(/<input\b/)
    expect(card).not.toMatch(/<select\b/)
    expect(card).not.toMatch(/<form\b/)
    expect((card.match(/<textarea\b/g) ?? [])).toHaveLength(1)
  })

  it('mints the gates token in the browser, per action, and never caches it', () => {
    expect(card).toContain('useGatesToken')
    expect(card).toContain('await mintGatesToken()')
    expect(card).toContain(`'use client'`)
  })

  it('treats 409 as state to refresh, not as an error to show', () => {
    expect(card).toMatch(/kind === 'conflict'/)
    expect(card).toMatch(/conflict'[\s\S]{0,300}router\.refresh\(\)/)
    expect(card).toMatch(/Already decided/)
  })

  it('two-tap confirm is enforced by TIMESTAMP at tap time, not by a timer alone', () => {
    expect(card).toMatch(/Date\.now\(\) - armed\.at <= ARM_WINDOW_MS/)
  })

  it('never renders the parsed numeric', () => {
    expect(card).not.toContain('valueNumeric')
  })

  it('renders the provenance a value cannot be checked without', () => {
    expect(card).toContain('d.page')
    expect(card).toContain('d.snippet')
    expect(card).toContain('d.confidence')
  })
})

describe('the read stays read-only and demo-safe', () => {
  const uw = read('lib/underwriting.ts')

  it('the terms fetcher goes through the same GET-only wrapper', () => {
    expect(uw).toMatch(/getDealCommitmentTerms[\s\S]{0,600}uwSelect<any>\('commitment_terms'/)
  })

  it('it is scoped by agent AND deal', () => {
    expect(uw).toMatch(/uwSelect<any>\('commitment_terms'[\s\S]{0,300}agent_id: `eq\.\$\{agentId\}`/)
    expect(uw).toMatch(/uwSelect<any>\('commitment_terms'[\s\S]{0,300}deal_id: `eq\.\$\{dealId\}`/)
  })

  it('demo short-circuits BEFORE any network call', () => {
    expect(uw).toMatch(/getDealCommitmentTerms[\s\S]{0,240}if \(isDemoMode\(\)\) return demoResult\(demoDealCommitmentTerms\(dealId\)\)/)
  })

  it('the demo fixture is fictional and exercises the real card', () => {
    const terms = demoDealCommitmentTerms('demo-deal-1')
    expect(terms).toHaveLength(10)
    expect(terms.every(t => t.gateStatus === 'pending')).toBe(true)
    expect(terms.map(t => t.fieldKey).sort()).toEqual([...COMMITMENT_TERM_ORDER].sort())
    // Obviously not a real lender, and no real file ref anywhere.
    expect(terms.find(t => t.fieldKey === 'lender')!.printed).toMatch(/Sample Bank/)
    expect(JSON.stringify(terms)).not.toMatch(/BRXM-|IFMS-|UnionLink/)
    // It carries the two cases the card is built for.
    const mat = terms.find(t => t.fieldKey === 'maturity_date')!
    expect(termDisplay(mat).reading!.kind).toBe('date')
    expect(termDisplay(terms.find(t => t.fieldKey === 'rate_type')!).reading).toEqual({
      kind: 'text',
      value: 'variable',
    })
    // An unknown deal gets nothing rather than someone else's fixture.
    expect(demoDealCommitmentTerms('demo-deal-2')).toEqual([])
  })
})
