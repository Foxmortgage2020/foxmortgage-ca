// SMM parsing + opportunity model tests. Runs ONLY on the synthetic fixture
// (tests/fixtures/smm-sample.csv), all fictional data. The real client export
// is never read here. Proves the parsing conventions, placeholder detection,
// co-borrower collapse, lender normalization, the sign convention + sanity
// check, and Fox's opportunity analysis.

import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  analyzeOpportunity,
  balanceAfter,
  checkSignConvention,
  collapseCoBorrowers,
  diffUploads,
  isAnalyzable,
  isPlaceholder,
  monthsElapsed,
  parseCsv,
  parseDateField,
  parseMoney,
  parsePercent,
  parseSmmRow,
  penaltyEstimate,
  reconcileBalance,
  threeMonthsInterest,
  type Comparable,
  type SmmParsedRow,
} from '@/lib/smm'
import { normalizeLender } from '@/config/smm-lender-aliases'

const FIX = join(process.cwd(), 'tests/fixtures')
function loadRows(name: string): SmmParsedRow[] {
  return parseCsv(readFileSync(join(FIX, name), 'utf-8')).map(parseSmmRow)
}
const TODAY = '2026-07-12'

describe('field parsers', () => {
  it('money: dash is null (never zero), negatives and commas parse', () => {
    expect(parseMoney('$596,000.00')).toEqual({ value: 596000, error: null })
    expect(parseMoney('-$3,266.63')).toEqual({ value: -3266.63, error: null })
    expect(parseMoney('-')).toEqual({ value: null, error: null })
    expect(parseMoney('')).toEqual({ value: null, error: null })
    expect(parseMoney('$1.00')).toEqual({ value: 1, error: null })
    const bad = parseMoney('PENDING')
    expect(bad.value).toBeNull()
    expect(bad.error).toMatch(/unrecognized money/)
  })
  it('percent and date', () => {
    expect(parsePercent('4.94%')).toEqual({ value: 4.94, error: null })
    expect(parsePercent('-')).toEqual({ value: null, error: null })
    expect(parseDateField('2026-10-01')).toEqual({ value: '2026-10-01', error: null })
    expect(parseDateField('-')).toEqual({ value: null, error: null })
    expect(parseDateField('nope').error).toMatch(/unrecognized date/)
  })
})

describe('the synthetic fixture parses to the expected structure', () => {
  const rows = loadRows('smm-sample.csv')
  it('has 24 raw rows', () => {
    expect(rows).toHaveLength(24)
  })
  it('collapses two co-borrower groups (2 duplicate rows) to 22 mortgages', () => {
    const { mortgages, collapsedCount } = collapseCoBorrowers(rows)
    expect(collapsedCount).toBe(2)
    expect(mortgages).toHaveLength(22)
    // The collapsed record retains both borrowers.
    const dual = mortgages.find(m => m.borrowers.length > 1)!
    expect(dual.borrowers.length).toBe(2)
    expect(dual.borrowers.map(b => b.email).sort()).toContain('corey.langsford@example.com')
  })
  it('does not merge two different households that share address, balance, and maturity', () => {
    // The key leads with Household ID, so co-borrowers (same household) still
    // collapse but two DISTINCT households never merge — including the worst
    // case where both carry a null balance and null maturity.
    const base = {
      'File reference': 'F', 'First name': 'A', 'Last name': 'B', 'Client type': 'CLIENT',
      Email: '', Phone: '', 'Property address': '9 Shared Rd', 'Property type': 'detached', 'Property occupancy': 'owner_occupied',
      'Estimated home value': '', 'Mortgage amount': '', 'Mortgage outstanding balance': '', 'Mortgage rate': '',
      'Mortgage rate type': '', 'Mortgage closing date': '', 'Mortgage start date': '', 'Mortgage maturity date': '',
      'Mortgage amortization (months)': '', 'Mortgage term (months)': '', 'Mortgage lender': '', 'Mortgage insurance type': '',
      'Savings potential': '', 'Payment relief (monthly)': '', 'Accessible equity': '', 'Purchasing power': '',
    }
    const two = [parseSmmRow({ ...base, 'Household ID': 'HH-A' }), parseSmmRow({ ...base, 'Household ID': 'HH-B' })]
    const { mortgages, collapsedCount } = collapseCoBorrowers(two)
    expect(mortgages).toHaveLength(2)
    expect(collapsedCount).toBe(0)
  })
  it('detects exactly one placeholder ($1) and one parse failure', () => {
    expect(rows.filter(isPlaceholder)).toHaveLength(1)
    const failures = rows.filter(r => r.parseErrors.length > 0)
    expect(failures).toHaveLength(1)
    expect(failures[0].parseErrors[0].field).toBe('Mortgage outstanding balance')
    // The placeholder and the parse failure are the only two not analyzable;
    // the dash-savings row still analyzes (rate + balance are present).
    expect(rows.filter(isAnalyzable).length).toBe(22)
  })
  it('normalizes every messy lender variant in the fixture (none unmapped)', () => {
    const unmapped = rows.filter(r => r.lenderRaw && !r.lender.mapped)
    expect(unmapped).toHaveLength(0)
    // The First National family collapses to one slug; Excalibur is distinct.
    expect(normalizeLender('First National Financial')).toMatchObject({ slug: 'first-national', inBook: true })
    expect(normalizeLender('First National - Excalibur')).toMatchObject({ slug: 'first-national-excalibur' })
    expect(normalizeLender('RFA Prime')).toMatchObject({ slug: 'rfa' })
    // Out-of-book display lenders map for display but carry no book competitor.
    expect(normalizeLender('CIBC')).toMatchObject({ display: 'CIBC', inBook: false, mapped: true })
    // A truly unknown string is unmapped (listed per upload).
    expect(normalizeLender('Some New Lender')).toMatchObject({ mapped: false, inBook: false, display: 'Some New Lender' })
  })
})

describe('sign convention + sanity check', () => {
  it('the fixture passes: low-rate rows carry negative savings, not positive', () => {
    const rows = loadRows('smm-sample.csv')
    expect(checkSignConvention(rows).ok).toBe(true)
  })
  it('an inverted file (1.5% showing +$5,000) trips the sanity check', () => {
    const rows = loadRows('smm-inverted.csv')
    const check = checkSignConvention(rows)
    expect(check.ok).toBe(false)
    expect(check.violations[0].rate).toBe(1.5)
  })
})

describe('penalty framing', () => {
  it('floating is three months of interest; fixed without methodology asserts no single number', () => {
    const tmi = threeMonthsInterest(400000, 5)
    expect(tmi).toBeCloseTo(400000 * 0.05 * 0.25, 2)
    const floating = penaltyEstimate(400000, 5, 'variable', false)
    expect(floating.methodologyKnown).toBe(true)
    expect(floating.framing).toMatch(/three months/i)
    const fixedNoMethod = penaltyEstimate(400000, 5, 'fixed', false)
    expect(fixedNoMethod.methodologyKnown).toBe(false)
    expect(fixedNoMethod.framing).toMatch(/not documented/i)
  })
})

describe('schedule reconstruction + the reconciliation gate', () => {
  it('monthsElapsed counts whole payment months from the start date', () => {
    expect(monthsElapsed('2024-07-01', '2026-07-13')).toBe(24)
    expect(monthsElapsed('2026-06-18', '2026-07-13')).toBe(0) // day-of-month not reached
    expect(monthsElapsed('2027-01-01', '2026-07-13')).toBe(0) // a future start clamps, never negative
  })

  it('models the balance forward from origination to the cent (worked example)', () => {
    // $500,000 at 5.50% over 300 months pays $3,051.96 a month; after 24
    // payments the balance lands at $480,116.51. The schedule is confirmed.
    expect(balanceAfter(500_000, 5.5, 300, 24)).toBeCloseTo(480_116.51, 1)
  })

  it('reconciles a clean feed balance and blocks a corrupt one', () => {
    const clean = reconcileBalance(500_000, 5.5, 300, 24, 480_116.59)
    expect(clean.ok).toBe(true)
    expect(clean.driftPct).toBeLessThan(0.01)
    const corrupt = reconcileBalance(500_000, 5.5, 300, 24, 455_000)
    expect(corrupt.ok).toBe(false)
    expect(corrupt.driftPct).toBeGreaterThan(0.5)
  })
})

describe("Fox's opportunity analysis", () => {
  const cmp = (rate: number): Comparable => ({ rate, lender: 'MCAP', asOf: '2026-07-09', termMonths: 60, kind: 'fixed' })
  function rowFor(over: Record<string, string>): SmmParsedRow {
    return parseSmmRow({
      'Household ID': 'H', 'File reference': 'F', 'First name': 'A', 'Last name': 'B', 'Client type': 'CLIENT',
      Email: 'a@b.com', Phone: '1', 'Property address': '1 St', 'Property type': 'detached', 'Property occupancy': 'owner_occupied',
      // Balance and start date reconcile against the schedule (the gate in
      // analyzeOpportunity models the balance forward from origination): one
      // month elapsed, balance still at the original amount within the band.
      'Estimated home value': '$700,000.00', 'Mortgage amount': '$500,000.00', 'Mortgage outstanding balance': '$500,000.00',
      'Mortgage rate': '5.34%', 'Mortgage rate type': 'fixed', 'Mortgage closing date': '2026-06-05', 'Mortgage start date': '2026-06-05',
      'Mortgage maturity date': '2027-10-05', 'Mortgage amortization (months)': '300', 'Mortgage term (months)': '60',
      'Mortgage lender': 'First National', 'Mortgage insurance type': 'Uninsurable', 'Savings potential': '$500.00',
      'Payment relief (monthly)': '$120.00', 'Accessible equity': '$200,000.00', 'Purchasing power': '$150,000.00',
      ...(over as Record<string, string>),
    })
  }
  it('a high current rate mid-term against a lower comparable is act_now with a real net benefit', () => {
    // Mid-term (maturity years out) so the monthly saving accrues past the penalty.
    const r = rowFor({ 'Mortgage maturity date': '2030-10-05' })
    const a = analyzeOpportunity(r, cmp(4.19), true, TODAY)
    expect(a.monthlyDelta).toBeLessThan(0) // pays less
    expect(a.monthlySaving).toBeGreaterThan(0)
    expect(a.netBenefit).toBeGreaterThan(0)
    expect(a.bucket).toBe('act_now')
    expect(a.comparable?.asOf).toBe('2026-07-09')
  })
  it('a low current rate against a higher comparable is stay_put (breaking costs)', () => {
    const r = rowFor({ 'Mortgage rate': '1.99%' })
    const a = analyzeOpportunity(r, cmp(4.19), true, TODAY)
    expect(a.monthlySaving).toBe(0)
    expect(a.netBenefit).toBeLessThan(0)
    expect(a.bucket).toBe('stay_put')
  })
  it('a placeholder or unanalyzable row is insufficient, never analyzed', () => {
    const ph = rowFor({ 'Mortgage outstanding balance': '$1.00' })
    expect(analyzeOpportunity(ph, cmp(4.19), true, TODAY).bucket).toBe('insufficient')
    const noComp = analyzeOpportunity(rowFor({}), null, true, TODAY)
    expect(noComp.bucket).toBe('insufficient')
  })
  it('a balance that does not reconcile with the schedule is blocked to review, never analyzed', () => {
    // One month in, the balance cannot plausibly be $70k below the original.
    const r = rowFor({ 'Mortgage outstanding balance': '$430,000.00' })
    const a = analyzeOpportunity(r, cmp(4.19), true, TODAY)
    expect(a.bucket).toBe('review')
    expect(a.currentPayment).toBeNull()
    expect(a.newPayment).toBeNull()
    expect(a.netBenefit).toBeNull()
    expect(a.blockReason).toMatch(/does not reconcile/)
    expect(a.blockReason).toContain('$430,000') // both figures and the drift show
    expect(a.blockReason).toMatch(/% drift/)
    expect(a.reconciliation?.ok).toBe(false)
  })
})

describe('upload delta (month over month)', () => {
  it('distinguishes new, improved, resolved, and departed against a modified copy', () => {
    const v1 = loadRows('smm-sample.csv')
    const v2 = loadRows('smm-sample-v2.csv')
    const d = diffUploads(v1, v2)
    expect(d.newOpportunities).toContain('HH23') // added in v2
    expect(d.departed).toContain('HH16') // removed in v2
    expect(d.improved).toContain('HH1') // savings grew
    expect(d.resolved).toContain('HH12') // savings shrank
  })
})
