// SMM matching, backfill, and lapsed-reconciliation tests. Synthetic data
// only. Proves the confidence-ordered match, the empty-field-only backfill
// with conflicts listed (Aitken fill, Reinders maturity conflict), the lapsed
// reconciliation classes (Scanlon still-with-lender, Jackett lender-changed,
// Pellerin stale-rate conflict), and the approved comparable.

import { describe, expect, it } from 'vitest'
import { collapseCoBorrowers, parseSmmRow, type SmmMortgage } from '@/lib/smm'
import {
  addressKey,
  appearsRenewedEvidenceKey,
  attributeDeals,
  bestEligibleComparable,
  bestFixedComparable,
  detectAppearsRenewed,
  decideMatch,
  findExportByName,
  identityClaimants,
  indexMortgagesByName,
  insuranceToProductClass,
  proposeBackfill,
  reconcileLapsed,
  retentionSummary,
  type BookQuote,
  type DealEvidence,
  type ZohoContactLite,
} from '@/lib/smm-match'

const contact = (id: string): ZohoContactLite => ({ id, fullName: 'X', email: 'x@y.com', phone: '1', mobile: null })

describe('match decision (email > phone > name), bound to ONE export mortgage', () => {
  it('single email hit with a unique export claimant matches; multiple hits are ambiguous', () => {
    expect(decideMatch({ email: [contact('c1')], phone: [], name: [] }, 1)).toMatchObject({ bucket: 'matched', contactId: 'c1', matchedBy: 'email' })
    expect(decideMatch({ email: [contact('c1'), contact('c2')], phone: [], name: [] }, 1)).toMatchObject({ bucket: 'ambiguous', matchedBy: 'email' })
  })
  it('falls through email to phone to name, then unmatched', () => {
    expect(decideMatch({ email: [], phone: [contact('c3')], name: [] }, 1)).toMatchObject({ bucket: 'matched', matchedBy: 'phone' })
    expect(decideMatch({ email: [], phone: [], name: [contact('c4')] }, 1)).toMatchObject({ bucket: 'matched', matchedBy: 'name' })
    expect(decideMatch({ email: [], phone: [], name: [] }, 1)).toMatchObject({ bucket: 'unmatched', contactId: null })
  })
  it('a single contact hit claimed by TWO export mortgages is shared_identity, never matched', () => {
    // The shared-email collision: the contact resolves, the mortgage does not.
    const m = decideMatch({ email: [contact('c1')], phone: [], name: [] }, 2)
    expect(m.bucket).toBe('shared_identity')
    expect(m.contactId).toBe('c1') // the contact is known; the binding is not
    expect(m.exportClaimants).toBe(2)
  })
})

// ─── Shared identities and deal attribution ──────────────────────────────────
// Two mortgages, one email: the real shape that nearly wrote the wrong
// maturity into a client's record. Synthetic names per the fixture rule.
function rowsFor(list: { hid: string; name: string; email: string; phone?: string; address: string; amount: string; maturity: string }[]) {
  return list.map(x =>
    parseSmmRow({
      'Household ID': x.hid, 'File reference': `F-${x.hid}`, 'First name': x.name.split(' ')[0], 'Last name': x.name.split(' ')[1] ?? '',
      'Client type': 'CLIENT', Email: x.email, Phone: x.phone ?? '519-555-0100', 'Property address': x.address,
      'Property type': 'detached', 'Property occupancy': 'owner_occupied',
      'Estimated home value': '$900,000.00', 'Mortgage amount': x.amount, 'Mortgage outstanding balance': x.amount,
      'Mortgage rate': '4.50%', 'Mortgage rate type': 'fixed', 'Mortgage closing date': '2026-06-01', 'Mortgage start date': '2026-06-01',
      'Mortgage maturity date': x.maturity, 'Mortgage amortization (months)': '300', 'Mortgage term (months)': '60',
      'Mortgage lender': 'MCAP', 'Mortgage insurance type': 'Uninsurable', 'Savings potential': '-', 'Payment relief (monthly)': '-',
      'Accessible equity': '-', 'Purchasing power': '-',
    }),
  )
}

function twoMortgagesOneEmail(): SmmMortgage[] {
  const { mortgages } = collapseCoBorrowers(
    rowsFor([
      { hid: 'h-alpha', name: 'Dana Whitfield', email: 'shared@example.com', address: '22 Birch Ave, Guelph, ON', amount: '$635,000.00', maturity: '2031-06-18' },
      { hid: 'h-beta', name: 'Dana Whitfield', email: 'shared@example.com', address: '9 Larch Lane, Guelph, ON', amount: '$480,000.00', maturity: '2029-07-01' },
      { hid: 'h-other', name: 'Omar Feld', email: 'omar@example.com', phone: '519-555-0199', address: '3 Oak Ct, Fergus, ON', amount: '$300,000.00', maturity: '2030-01-01' },
    ]),
  )
  return mortgages
}

describe('identity claimants (export-side sharing)', () => {
  it('two mortgages sharing an email claim each other; an unrelated mortgage stands alone', () => {
    const [a, b, other] = twoMortgagesOneEmail()
    expect(identityClaimants(a, [a, b, other]).map(m => m.primary.householdId).sort()).toEqual(['h-alpha', 'h-beta'])
    expect(identityClaimants(b, [a, b, other])).toHaveLength(2)
    expect(identityClaimants(other, [a, b, other]).map(m => m.primary.householdId)).toEqual(['h-other'])
  })
  it('a co-borrower email claims too', () => {
    // Distinct phones and names per household, so ONLY the co-borrower email
    // can link the two mortgages.
    const { mortgages } = collapseCoBorrowers([
      ...rowsFor([{ hid: 'h-1', name: 'Pat Quill', email: 'pat@example.com', phone: '519-555-0111', address: '1 Elm St', amount: '$400,000.00', maturity: '2030-05-01' }]),
      ...rowsFor([
        { hid: 'h-2', name: 'Rae Voss', email: 'rae@example.com', phone: '519-555-0122', address: '7 Fir Rd', amount: '$350,000.00', maturity: '2031-02-01' },
        // Pat co-borrows on Rae's mortgage (same household id + address + balance + maturity collapses them)
        { hid: 'h-2', name: 'Pat Quill', email: 'pat@example.com', phone: '519-555-0111', address: '7 Fir Rd', amount: '$350,000.00', maturity: '2031-02-01' },
      ]),
    ])
    expect(mortgages).toHaveLength(2)
    expect(identityClaimants(mortgages[0], mortgages)).toHaveLength(2)
  })
})

describe('deal attribution for shared identities (address first, then amount)', () => {
  const claimants = () => twoMortgagesOneEmail().slice(0, 2)
  it('address keys tolerate suffix and punctuation differences', () => {
    expect(addressKey('22 Birch Ave, Guelph, ON')).toBe(addressKey('22 Birch Avenue'))
    expect(addressKey('22 Birch Ave')).not.toBe(addressKey('9 Larch Lane'))
  })
  it('attributes each deal to the one mortgage whose address matches', () => {
    const deals: DealEvidence[] = [
      { id: 'd1', street: '22 Birch Avenue', city: 'Guelph', amount: null },
      { id: 'd2', street: '9 Larch Lane', city: 'Guelph', amount: null },
    ]
    const attr = attributeDeals(claimants(), deals)
    expect(attr.get('d1')).toBe('h-alpha')
    expect(attr.get('d2')).toBe('h-beta')
  })
  it('falls back to the amount when the deal has no address', () => {
    const attr = attributeDeals(claimants(), [{ id: 'd1', street: null, city: null, amount: 635_000 }])
    expect(attr.get('d1')).toBe('h-alpha')
  })
  it('a deal no mortgage — or more than one mortgage — can claim is contested (null), never guessed', () => {
    const both = twoMortgagesOneEmail().slice(0, 2)
    // No evidence at all: contested.
    expect(attributeDeals(both, [{ id: 'd1', street: null, city: null, amount: null }]).get('d1')).toBeNull()
    // An amount both mortgages carry: contested even though the amount "matches".
    const { mortgages } = collapseCoBorrowers(
      rowsFor([
        { hid: 'h-a', name: 'Kim Voss', email: 'kim@example.com', address: '4 Ash St', amount: '$500,000.00', maturity: '2031-01-01' },
        { hid: 'h-b', name: 'Kim Voss', email: 'kim@example.com', address: '8 Yew Rd', amount: '$500,000.00', maturity: '2029-03-01' },
      ]),
    )
    expect(attributeDeals(mortgages, [{ id: 'd1', street: null, city: null, amount: 500_000 }]).get('d1')).toBeNull()
  })
})

describe('appears-renewed detection (the CRM never heard about the renewal)', () => {
  const zoho = (over: Partial<{ closingDate: string | null; lender: string | null; rate: number | null; maturity: string | null }> = {}) => ({
    closingDate: '2021-08-22' as string | null,
    lender: 'MCAP' as string | null,
    rate: 2.14 as number | null,
    maturity: '2026-08-22' as string | null,
    ...over,
  })
  // The proving shape: the feed shows a mortgage started 2025-09-01 at 4.14
  // while the Zoho deal closed years earlier and says 2.14 maturing 2026.
  const renewedFeed = () =>
    collapseCoBorrowers(
      rowsFor([{ hid: 'h-r', name: 'Lena Marsh', email: 'lena@example.com', address: '5 Elm St', amount: '$910,000.00', maturity: '2030-09-01' }]),
    ).mortgages[0]

  it('flags start-after-close beyond the tolerance, with both sides in evidence', () => {
    const m = renewedFeed()
    m.primary.startDate = '2025-09-01'
    m.primary.rate = 4.14
    const ev = detectAppearsRenewed(zoho(), m)
    expect(ev).not.toBeNull()
    expect(ev?.signals).toContain('start_after_close')
    expect(ev?.signals).toContain('rate_changed')
    expect(ev?.feed.startDate).toBe('2025-09-01')
    expect(ev?.zoho.closingDate).toBe('2021-08-22')
  })

  it('does NOT flag the normal closing-to-first-payment offset (inside 90 days)', () => {
    const m = renewedFeed()
    m.primary.startDate = '2021-09-15' // 24 days after closing
    m.primary.rate = 2.14
    expect(detectAppearsRenewed(zoho({ lender: 'MCAP' }), m)).toBeNull()
  })

  it('rate_changed never fires for a FLOATING feed mortgage (its rate moves with prime)', () => {
    const m = renewedFeed()
    m.primary.startDate = null
    m.primary.rate = 4.39 // prime moved; Zoho holds the origination 2.14
    m.primary.rateType = 'adjustable'
    expect(detectAppearsRenewed(zoho({ lender: 'MCAP' }), m)).toBeNull()
  })

  it('a decline is scoped to its evidence: the key moves when the feed moves', () => {
    const m = renewedFeed()
    m.primary.startDate = '2025-09-01'
    m.primary.rate = 4.14
    const ev1 = detectAppearsRenewed(zoho(), m)!
    m.primary.startDate = '2026-06-01' // the client renewed AGAIN
    const ev2 = detectAppearsRenewed(zoho(), m)!
    expect(appearsRenewedEvidenceKey(ev1)).not.toBe(appearsRenewedEvidenceKey(ev2))
  })

  it('a lender contradiction alone flags; missing data on either side never does', () => {
    const m = renewedFeed()
    m.primary.startDate = null
    m.primary.rate = null
    const ev = detectAppearsRenewed(zoho({ lender: 'RFA' }), m)
    expect(ev?.signals).toEqual(['lender_changed'])
    expect(detectAppearsRenewed(zoho({ closingDate: null, lender: null, rate: null }), m)).toBeNull()
  })
})

describe('ACCEPTANCE: two mortgages, one email — zero automatic proposals, one manual-match card', () => {
  it('both households resolve shared_identity to the same contact; no deal is attributed', () => {
    const all = twoMortgagesOneEmail()
    const [a, b] = all
    // Zoho: the shared email resolves ONE contact with two deals carrying no
    // disambiguating evidence (no street, no amount).
    const hits = { email: [contact('zc-1')], phone: [], name: [] }
    const deals: DealEvidence[] = [
      { id: 'zd-1', street: null, city: null, amount: null },
      { id: 'zd-2', street: null, city: null, amount: null },
    ]
    const cards = new Set<string>()
    for (const m of [a, b]) {
      const claimants = identityClaimants(m, all)
      const match = decideMatch(hits, claimants.length)
      // Never 'matched': no automatic proposal path opens.
      expect(match.bucket).toBe('shared_identity')
      const attribution = attributeDeals(claimants, deals)
      const mine = deals.filter(d => attribution.get(d.id) === m.primary.householdId)
      expect(mine).toHaveLength(0) // zero deals to propose into — zero automatic proposals
      // The scan emits a needs-manual-match card keyed by the CONTACT, so both
      // households land on the same single card.
      cards.add(match.contactId!)
    }
    expect(cards.size).toBe(1)
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

  it('ranks floating on the EFFECTIVE rate from the per-lender prime, never the discount (two-prime fixture)', () => {
    // A credit union pricing off its own 5.50 PLR holds the DEEPEST discount
    // but not the lowest rate: P-1.00 on 5.50 is 4.50 effective, while the
    // bank's shallower P-0.40 on 4.45 prime is 4.05. Variance ranking says the
    // credit union wins by 60 points; effective ranking says it loses by 45.
    const quotes: BookQuote[] = [
      q({ rate: null, rateType: 'adjustable', primeVariance: -1.0, lenderSlug: 'cu-own-prime', eligibilitySource: 'variant:(none)' }),
      q({ rate: null, rateType: 'adjustable', primeVariance: -0.4, lenderSlug: 'bank', eligibilitySource: 'variant:(none)' }),
    ]
    const primeFor = (slug: string) => (slug === 'cu-own-prime' ? 5.5 : 4.45)
    const c = bestEligibleComparable(quotes, 'conventional', 'refinance', name, primeFor, () => true, ['adjustable'])
    expect(c?.lender).toBe('BANK') // the shallower discount, the lower rate
    expect(c?.rate).toBe(4.05)
    expect(c?.variance).toBe(-0.4)
  })

  it('the like-for-like family gate is exact: adjustable never substitutes for variable', () => {
    const quotes: BookQuote[] = [
      q({ rate: null, rateType: 'adjustable', primeVariance: -0.5, eligibilitySource: 'variant:(none)' }),
    ]
    expect(bestEligibleComparable(quotes, 'conventional', 'refinance', name, () => 4.45, () => true, ['variable'])).toBeNull()
    expect(bestEligibleComparable(quotes, 'conventional', 'refinance', name, () => 4.45, () => true, ['adjustable'])).not.toBeNull()
  })
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
