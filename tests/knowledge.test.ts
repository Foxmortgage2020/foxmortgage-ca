// Stale-flag logic and figure extraction for the knowledge pages, plus the
// rates digest honesty rule (no delta without two sheet dates).

import { describe, expect, it } from 'vitest'
import { daysBetweenYMD, isStaleAsOf, profileFigureRows, profileKnownGaps } from '../lib/knowledge'
import { computeLenderDigests } from '../lib/rates'
import type { RateQuoteBrowserRow } from '../lib/underwriting'

describe('isStaleAsOf', () => {
  it('flags a profile older than 90 days', () => {
    expect(isStaleAsOf('2026-04-01', '2026-07-09')).toBe(true)
  })

  it('does not flag a fresh profile', () => {
    expect(isStaleAsOf('2026-07-02', '2026-07-09')).toBe(false)
  })

  it('treats exactly 90 days as still fresh, 91 as stale', () => {
    expect(daysBetweenYMD('2026-04-10', '2026-07-09')).toBe(90)
    expect(isStaleAsOf('2026-04-10', '2026-07-09')).toBe(false)
    expect(isStaleAsOf('2026-04-09', '2026-07-09')).toBe(true)
  })

  it('never flags a withheld profile (null as_of); that state renders separately', () => {
    expect(isStaleAsOf(null, '2026-07-09')).toBe(false)
    expect(isStaleAsOf(undefined, '2026-07-09')).toBe(false)
  })

  it('honours a custom threshold', () => {
    expect(isStaleAsOf('2026-07-01', '2026-07-09', 7)).toBe(true)
    expect(isStaleAsOf('2026-07-03', '2026-07-09', 7)).toBe(false)
  })
})

describe('profileFigureRows', () => {
  const profile = {
    slug: 'fn',
    name: 'First National Financial',
    as_of: '2026-07-02',
    status: 'observational',
    source_files: ['knowledge/lender-fn.md'],
    qualifying_rate: {
      rule: { value: 'greater of contract + 2 and 5.25', source: 'MQR', as_of: '2026-06-01', md_evidence: 'x' },
    },
    income: { fluctuating: { method: 'two-year average', variance_threshold_pct: 20 } },
    known_gaps: ['FN broker guideline kit'],
  }

  it('collects figure nodes with their as-of date and source', () => {
    const rows = profileFigureRows(profile as any)
    const rule = rows.find(r => r.path.includes('qualifying rate'))
    expect(rule?.value).toContain('5.25')
    expect(rule?.asOf).toBe('2026-06-01')
    expect(rule?.source).toBe('MQR')
  })

  it('renders scalar leaves as undated context rows and skips meta keys', () => {
    const rows = profileFigureRows(profile as any)
    expect(rows.some(r => r.path === 'income · fluctuating · method')).toBe(true)
    expect(rows.some(r => r.path.startsWith('slug'))).toBe(false)
    expect(rows.some(r => r.path.startsWith('known gaps'))).toBe(false)
  })

  it('returns nothing for a withheld profile', () => {
    expect(profileFigureRows(null)).toEqual([])
    expect(profileKnownGaps(null)).toEqual([])
  })
})

describe('computeLenderDigests', () => {
  const q = (lender: string, rate: number, asOf: string, status = 'approved'): RateQuoteBrowserRow => ({
    id: `${lender}-${rate}-${asOf}`,
    lenderSlug: lender,
    productClass: 'conventional',
    variant: null,
    termMonths: 60,
    rate,
    rateType: 'fixed',
    primeVariance: null,
    cashbackPct: null,
    programNotes: null,
    compBps: null,
    asOfDate: asOf,
    expiryDate: null,
    status,
  })

  it('reports no delta when a lender has only one sheet date', () => {
    const [d] = computeLenderDigests([q('fn', 4.99, '2026-07-02'), q('fn', 5.19, '2026-07-02')])
    expect(d.medianDelta).toBeNull()
    expect(d.newestApprovedAsOf).toBe('2026-07-02')
    expect(d.approvedCount).toBe(2)
  })

  it('computes the median movement between the two most recent dates', () => {
    const [d] = computeLenderDigests([
      q('fn', 5.0, '2026-06-25', 'superseded'),
      q('fn', 5.2, '2026-06-25', 'superseded'),
      q('fn', 4.9, '2026-07-02'),
      q('fn', 5.1, '2026-07-02'),
    ])
    expect(d.medianDelta).toBe(-0.1)
    expect(d.previousAsOf).toBe('2026-06-25')
  })
})
