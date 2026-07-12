// SMM matching, backfill, and lapsed-reconciliation tests. Synthetic data
// only. Proves the confidence-ordered match, the empty-field-only backfill
// with conflicts listed (Aitken fill, Reinders maturity conflict), the lapsed
// reconciliation classes (Scanlon still-with-lender, Jackett lender-changed,
// Pellerin stale-rate conflict), and the approved comparable.

import { describe, expect, it } from 'vitest'
import { parseSmmRow, type SmmMortgage } from '@/lib/smm'
import {
  bestFixedComparable,
  decideMatch,
  findExportByName,
  indexMortgagesByName,
  insuranceToProductClass,
  proposeBackfill,
  reconcileLapsed,
  retentionSummary,
  type BookQuote,
  type ZohoContactLite,
} from '@/lib/smm-match'

const contact = (id: string): ZohoContactLite => ({ id, fullName: 'X', email: 'x@y.com', phone: '1', mobile: null })

describe('match decision (email > phone > name)', () => {
  it('single email hit matches; multiple are ambiguous', () => {
    expect(decideMatch({ email: [contact('c1')], phone: [], name: [] })).toMatchObject({ bucket: 'matched', contactId: 'c1', matchedBy: 'email' })
    expect(decideMatch({ email: [contact('c1'), contact('c2')], phone: [], name: [] })).toMatchObject({ bucket: 'ambiguous', matchedBy: 'email' })
  })
  it('falls through email to phone to name, then unmatched', () => {
    expect(decideMatch({ email: [], phone: [contact('c3')], name: [] })).toMatchObject({ bucket: 'matched', matchedBy: 'phone' })
    expect(decideMatch({ email: [], phone: [], name: [contact('c4')] })).toMatchObject({ bucket: 'matched', matchedBy: 'name' })
    expect(decideMatch({ email: [], phone: [], name: [] })).toMatchObject({ bucket: 'unmatched', contactId: null })
  })
})

describe('backfill proposals (empty fields only, conflicts listed)', () => {
  const writable = new Set(['Maturity_Date', 'Lender_Name', 'Mortgage_Rate'])
  it('fills an empty maturity from the export (the Aitken case)', () => {
    const p = proposeBackfill(
      { Maturity_Date: null, Lender_Name: 'RFA', Mortgage_Rate: 1.99 },
      { maturityDate: '2026-10-01', lenderName: 'RFA Prime', rate: 1.99 },
      writable,
    )
    expect(p.fills).toContainEqual({ field: 'Maturity_Date', value: '2026-10-01' })
    // Lender already populated + same canonical slug -> no fill, no conflict.
    expect(p.fills.find(f => f.field === 'Lender_Name')).toBeUndefined()
    expect(p.conflicts).toHaveLength(0)
  })
  it('never proposes overwriting a populated field; lists the conflict (the Reinders maturity case)', () => {
    const p = proposeBackfill(
      { Maturity_Date: '2026-11-18', Lender_Name: 'First National', Mortgage_Rate: 4.05 },
      { maturityDate: '2031-06-18', lenderName: 'First National - Prime', rate: 4.05 },
      writable,
    )
    expect(p.fills).toHaveLength(0)
    expect(p.conflicts).toContainEqual({ field: 'Maturity_Date', zohoValue: '2026-11-18', exportValue: '2031-06-18' })
  })
  it('only proposes fields that are writable', () => {
    const p = proposeBackfill(
      { Maturity_Date: null, Lender_Name: null, Mortgage_Rate: null },
      { maturityDate: '2026-10-01', lenderName: 'RFA', rate: 4.0 },
      new Set(['Maturity_Date']),
    )
    expect(p.fills.map(f => f.field)).toEqual(['Maturity_Date'])
  })
})

function mortgage(over: Record<string, string>): SmmMortgage {
  const row = parseSmmRow({
    'Household ID': 'H', 'File reference': 'F', 'First name': 'A', 'Last name': 'B', 'Client type': 'CLIENT',
    Email: 'a@b.com', Phone: '1', 'Property address': '1 St', 'Property type': 'detached', 'Property occupancy': 'owner_occupied',
    'Estimated home value': '$700,000.00', 'Mortgage amount': '$500,000.00', 'Mortgage outstanding balance': '$480,000.00',
    'Mortgage rate': '5.49%', 'Mortgage rate type': 'fixed', 'Mortgage closing date': '2026-02-07', 'Mortgage start date': '2026-02-07',
    'Mortgage maturity date': '2031-02-07', 'Mortgage amortization (months)': '300', 'Mortgage term (months)': '60',
    'Mortgage lender': 'First Ontario Credit Union', 'Mortgage insurance type': 'Uninsurable', 'Savings potential': '$1,254.80',
    'Payment relief (monthly)': '$1,254.80', 'Accessible equity': '$150,000.00', 'Purchasing power': '$100,000.00',
    ...over,
  })
  return { key: 'k', primary: row, borrowers: [] }
}

describe('lapsed reconciliation', () => {
  it('still-with-original-lender is recoverable (the Scanlon case)', () => {
    const r = reconcileLapsed(
      { lender: 'RMG Mortgages', rate: 1.84, maturity: '2026-04-22' },
      mortgage({ 'Mortgage lender': 'RMG Mortgages', 'Mortgage rate': '1.84%', 'Mortgage maturity date': '2026-04-22' }),
    )
    expect(r.reconClass).toBe('still_with_lender')
    expect(r.recoverable).toBe(true)
    expect(r.conflicts).toHaveLength(0)
  })
  it('lender-changed is not recoverable and cannot say won or lost (the Jackett case)', () => {
    const r = reconcileLapsed(
      { lender: 'RMG Mortgages', rate: 4.12, maturity: '2030-04-03' },
      mortgage({ 'Mortgage lender': 'TD Canada Trust', 'Mortgage rate': '4.12%', 'Mortgage maturity date': '2030-04-03' }),
    )
    expect(r.reconClass).toBe('lender_changed')
    expect(r.recoverable).toBe(false)
    expect(r.note).toMatch(/won or lost|cannot be told/i)
  })
  it('flags a stale-rate conflict (the Pellerin case) and never picks a winner', () => {
    const r = reconcileLapsed(
      { lender: 'First Ontario Credit Union', rate: 10.99, maturity: '2031-02-07' },
      mortgage({ 'Mortgage rate': '5.49%' }),
    )
    expect(r.conflicts.some(c => c.field === 'rate' && c.zohoValue === '10.99%' && c.exportValue === '5.49%')).toBe(true)
  })
  it('unmonitored when not in the export', () => {
    const r = reconcileLapsed({ lender: 'RMG Mortgages', rate: 1.84, maturity: '2026-04-22' }, null)
    expect(r.reconClass).toBe('unmonitored')
  })
  it('retention summary counts the classes', () => {
    const s = retentionSummary([
      reconcileLapsed({ lender: 'RMG Mortgages', rate: 1.84, maturity: '2026-04-22' }, mortgage({ 'Mortgage lender': 'RMG Mortgages', 'Mortgage rate': '1.84%', 'Mortgage maturity date': '2026-04-22' })),
      reconcileLapsed({ lender: 'RMG', rate: 4.12, maturity: '2030-04-03' }, mortgage({ 'Mortgage lender': 'TD Canada Trust', 'Mortgage rate': '4.12%', 'Mortgage maturity date': '2030-04-03' })),
      reconcileLapsed({ lender: 'RMG', rate: 1, maturity: '2020-01-01' }, null),
    ])
    expect(s).toMatchObject({ total: 3, stillWithLender: 1, lenderChanged: 1, unmonitored: 1 })
  })
})

describe('name index for lapsed reconciliation', () => {
  const withBorrowers = (first: string, last: string): SmmMortgage => {
    const m = mortgage({ 'First name': first, 'Last name': last })
    return { ...m, borrowers: [{ firstName: first, lastName: last, email: '', phone: '', clientType: '', fileRef: '' }] }
  }

  it('indexes by borrower name, case-insensitively', () => {
    const idx = indexMortgagesByName([withBorrowers('Ian', 'Scanlon'), withBorrowers('Joseph', 'Jackett')])
    expect(findExportByName('ian scanlon', idx)).not.toBeNull()
    expect(findExportByName('IAN SCANLON', idx)?.primary.firstName).toBe('Ian')
    expect(findExportByName('Joseph Jackett', idx)?.primary.lastName).toBe('Jackett')
  })

  it('returns null for an unknown name or a null name', () => {
    const idx = indexMortgagesByName([withBorrowers('Ian', 'Scanlon')])
    expect(findExportByName('Nobody Here', idx)).toBeNull()
    expect(findExportByName(null, idx)).toBeNull()
  })

  it('a name shared by two different households is ambiguous (null), never a wrong match', () => {
    // Two distinct "John Smith" households: matching a lapsed John Smith deal to
    // either would risk a wrong lender/rate and a wrong recoverable call.
    const a: SmmMortgage = { ...mortgage({ 'First name': 'John', 'Last name': 'Smith', 'Property address': '1 A St' }), key: 'a', borrowers: [{ firstName: 'John', lastName: 'Smith', email: '', phone: '', clientType: '', fileRef: '' }] }
    const b: SmmMortgage = { ...mortgage({ 'First name': 'John', 'Last name': 'Smith', 'Property address': '2 B St' }), key: 'b', borrowers: [{ firstName: 'John', lastName: 'Smith', email: '', phone: '', clientType: '', fileRef: '' }] }
    const idx = indexMortgagesByName([a, b])
    expect(findExportByName('John Smith', idx)).toBeNull()
    // The lapsed deal then reconciles as unmonitored, not confidently mismatched.
    expect(reconcileLapsed({ lender: 'X', rate: 5, maturity: '2030-01-01' }, findExportByName('John Smith', idx)).reconClass).toBe('unmonitored')
  })

  it('feeds reconcileLapsed end to end: a matched name is not unmonitored', () => {
    const idx = indexMortgagesByName([withBorrowers('Ian', 'Scanlon')])
    const exp = findExportByName('Ian Scanlon', idx)
    const r = reconcileLapsed({ lender: 'First Ontario Credit Union', rate: 5.49, maturity: '2031-02-07' }, exp)
    expect(r.reconClass).not.toBe('unmonitored')
  })
})

describe('best approved comparable', () => {
  const name = (s: string) => s.toUpperCase()
  const q = (over: Partial<BookQuote>): BookQuote => ({ rate: 4.5, rateType: 'fixed', termMonths: 60, productClass: 'conventional', asOfDate: '2026-07-09', status: 'approved', lenderSlug: 'mcap', primeVariance: null, ...over })
  it('insurance maps to product class', () => {
    expect(insuranceToProductClass('Insured')).toBe('insured')
    expect(insuranceToProductClass('Insurable')).toBe('insurable')
    expect(insuranceToProductClass('Uninsurable')).toBe('conventional')
  })
  it('picks the lowest approved fixed for the class, dated, non-test', () => {
    const { comparable, classAssumed } = bestFixedComparable(
      [q({ rate: 4.5 }), q({ rate: 3.99, lenderSlug: 'first-national' }), q({ rate: 1.0, lenderSlug: 'test-portal' }), q({ rate: 3.5, status: 'superseded' }), q({ rate: 3.2, asOfDate: null })],
      'conventional',
      name,
    )
    expect(comparable).toMatchObject({ rate: 3.99, asOf: '2026-07-09', kind: 'fixed' })
    expect(classAssumed).toBe(false)
  })
  it('falls back to any class with an assumed flag when the class has no quote', () => {
    const { comparable, classAssumed } = bestFixedComparable([q({ productClass: 'insured', rate: 4.1 })], 'conventional', name)
    expect(comparable?.rate).toBe(4.1)
    expect(classAssumed).toBe(true)
  })
})
