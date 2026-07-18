// Deterministic document freshness (B6.3): the classifier and the window check.

import { describe, it, expect } from 'vitest'
import { freshnessKindFor, freshnessWindowDays, staleness, FRESHNESS_DAYS } from '@/config/doc-freshness'

describe('freshnessKindFor', () => {
  it('maps a commitment doc_kind (authoritative) to a freshness kind', () => {
    expect(freshnessKindFor('pay_stub', null)).toBe('pay_stub')
    expect(freshnessKindFor('t4_noa', null)).toBe('noa')
    expect(freshnessKindFor('void_cheque', null)).toBe('void_cheque')
    expect(freshnessKindFor('ccb', null)).toBe('benefit_statement')
  })
  it('a doc_kind with no freshness meaning gets no kind (no flag)', () => {
    expect(freshnessKindFor('gift_letter', null)).toBeNull()
    expect(freshnessKindFor('signed_commitment', null)).toBeNull()
  })
  it('classifies a free-text Finmo request name by keyword', () => {
    expect(freshnessKindFor(null, 'Pay Stub(s) — most recent')).toBe('pay_stub')
    expect(freshnessKindFor(null, 'Letter of Employment')).toBe('letter_of_employment')
    expect(freshnessKindFor(null, 'Bank Statement (90 days)')).toBe('bank_statement')
    expect(freshnessKindFor(null, 'Canada Child Benefit (CCB) statement')).toBe('benefit_statement')
    expect(freshnessKindFor(null, 'Void Cheque')).toBe('void_cheque')
    expect(freshnessKindFor(null, 'Property Tax Bill')).toBe('property_tax')
    expect(freshnessKindFor(null, 'Notice of Assessment (2 years)')).toBe('noa')
  })
  it('proof of pay deposit is not swallowed by the pay-stub pattern', () => {
    expect(freshnessKindFor(null, 'Proof of pay deposit')).toBe('proof_of_pay_deposit')
  })
  it('an unrecognised name gets no kind', () => {
    expect(freshnessKindFor(null, 'Some Unusual Document')).toBeNull()
  })
})

describe('freshnessWindowDays', () => {
  it('returns the configured days for a windowed kind', () => {
    expect(freshnessWindowDays('pay_stub', null)).toBe(30)
    expect(freshnessWindowDays(null, 'Bank Statement')).toBe(60)
    expect(freshnessWindowDays(null, 'Letter of Employment')).toBe(60)
    expect(freshnessWindowDays(null, 'Child benefit statement')).toBe(90)
  })
  it('a recognised kind with no day window returns null (content rule / no window)', () => {
    expect(freshnessWindowDays('void_cheque', null)).toBeNull() // recognised, no window
    expect(freshnessWindowDays('t4_noa', null)).toBeNull()
    expect(freshnessWindowDays(null, 'Property Tax Bill')).toBeNull()
  })
  it('an unrecognised kind returns null', () => {
    expect(freshnessWindowDays('gift_letter', null)).toBeNull()
    expect(freshnessWindowDays(null, 'Mystery Doc')).toBeNull()
  })
})

describe('staleness', () => {
  const now = Date.parse('2026-07-18T00:00:00Z')
  it('flags a file past its window, reporting the age', () => {
    expect(staleness(30, '2026-06-01T00:00:00Z', now)).toEqual({ days: 47 })
  })
  it('does not flag a file inside its window', () => {
    expect(staleness(30, '2026-07-05T00:00:00Z', now)).toBeNull()
  })
  it('never flags when there is no window', () => {
    expect(staleness(null, '2020-01-01T00:00:00Z', now)).toBeNull()
  })
  it('never flags without an honest timestamp', () => {
    expect(staleness(30, null, now)).toBeNull()
    expect(staleness(30, 'not-a-date', now)).toBeNull()
  })
})

describe('the freshness table (Michael-adjustable)', () => {
  it('carries the drafted defaults', () => {
    expect(FRESHNESS_DAYS.pay_stub).toBe(30)
    expect(FRESHNESS_DAYS.letter_of_employment).toBe(60)
    expect(FRESHNESS_DAYS.benefit_statement).toBe(90)
    expect(FRESHNESS_DAYS.property_tax).toBeNull()
    expect(FRESHNESS_DAYS.noa).toBeNull()
    expect(FRESHNESS_DAYS.id).toBeNull()
  })
})
