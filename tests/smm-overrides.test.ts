// Manual comparable overrides (Task 3): the override drives the analysis and
// the log, replay reproduces it, the candidate list is eligibility-gated by
// construction (a BC lender can never be picked), no GET can create or apply
// one, and demo writes nothing. Synthetic fixtures only.

import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/demo', () => ({ isDemoMode: () => true }))

import { parseSmmRow } from '@/lib/smm'
import type { BookQuote } from '@/lib/smm-match'
import { analyzeMortgage, comparableKey, overrideCandidates } from '@/lib/smm-analysis'
import { buildSavingsLogEntry, replaySavingsAnalysis, type SavingsLogInputs } from '@/lib/savings-log'
import { activeOverrides, retireOverride, setOverride } from '@/lib/smm-store'

const ASOF = '2026-07-13'

function seasonedRow(over: Record<string, string> = {}) {
  return parseSmmRow({
    'Household ID': 'H-ovr', 'File reference': 'F', 'First name': 'A', 'Last name': 'B', 'Client type': 'CLIENT',
    Email: 'a@b.com', Phone: '1', 'Property address': '1 St', 'Property type': 'detached', 'Property occupancy': 'owner_occupied',
    'Estimated home value': '$700,000.00', 'Mortgage amount': '$500,000.00', 'Mortgage outstanding balance': '$480,116.59',
    'Mortgage rate': '5.50%', 'Mortgage rate type': 'fixed', 'Mortgage closing date': '2024-07-01', 'Mortgage start date': '2024-07-01',
    'Mortgage maturity date': '2029-07-01', 'Mortgage amortization (months)': '300', 'Mortgage term (months)': '60',
    'Mortgage lender': 'MCAP', 'Mortgage insurance type': 'Uninsurable', 'Savings potential': '$800.00',
    'Payment relief (monthly)': '$400.00', 'Accessible equity': '$150,000.00', 'Purchasing power': '$100,000.00',
    ...over,
  })
}

const BOOK: BookQuote[] = [
  { rate: 4.59, rateType: 'fixed', termMonths: 60, productClass: 'conventional', asOfDate: '2026-06-30', status: 'approved', lenderSlug: 'rfa', primeVariance: null, eligibilitySource: 'variant:(none)' },
  { rate: 4.79, rateType: 'fixed', termMonths: 36, productClass: 'conventional', asOfDate: '2026-07-02', status: 'approved', lenderSlug: 'mcap', primeVariance: null, eligibilitySource: 'variant:(none)' },
  // A BC credit union: province-ineligible for this Ontario client. It must
  // never appear as an override candidate.
  { rate: 3.2, rateType: 'fixed', termMonths: 60, productClass: 'conventional', asOfDate: '2026-07-09', status: 'approved', lenderSlug: 'kootenay', primeVariance: null, eligibilitySource: 'variant:(none)' },
]

const DESK_OVERRIDE = {
  type: 'desk_rate' as const,
  comparable: { rate: 4.44, lender: 'Neo Financial', asOf: null, termMonths: 60, kind: 'fixed' as const, rateType: 'fixed' },
  reason: 'BDM quoted below sheet for this file size',
  sourceNote: 'quoted by BDM on call, 2026-07-13',
}

describe('the override drives the analysis', () => {
  it('replaces the comparable, badges the analysis, and suppresses the default attachments', () => {
    const { analysis } = analyzeMortgage(seasonedRow(), BOOK, ASOF, { override: DESK_OVERRIDE })
    expect(analysis.comparable?.rate).toBe(4.44)
    expect(analysis.comparable?.asOf).toBeNull() // never a sheet date
    expect(analysis.override?.type).toBe('desk_rate')
    expect(analysis.override?.reason).toContain('BDM')
    expect(analysis.alternative).toBeNull()
    expect(analysis.graduation).toBeNull()
  })

  it('the reconciliation gate outranks an override: an unreconciled file still blocks', () => {
    const { analysis } = analyzeMortgage(
      seasonedRow({ 'Mortgage outstanding balance': '$455,000.00' }),
      BOOK,
      ASOF,
      { override: DESK_OVERRIDE },
    )
    expect(analysis.bucket).toBe('review')
    expect(analysis.override).toBeNull() // a blocked file states nothing, override included
    expect(analysis.currentPayment).toBeNull()
  })

  it('logs the override and REPLAYS the overridden figures exactly', () => {
    const row = seasonedRow()
    const { analysis } = analyzeMortgage(row, BOOK, ASOF, { override: DESK_OVERRIDE })
    const entry = buildSavingsLogEntry({
      row,
      analysis,
      surface: 'pdf',
      uploadId: null,
      actingEmail: 'test@foxmortgage.ca',
      todayYMD: ASOF,
      methodologyKnown: false,
      crossFamilyApproved: false,
    })
    const override = entry.override as Record<string, unknown>
    expect(override).toMatchObject({ type: 'desk_rate', rate: 4.44, reason: 'BDM quoted below sheet for this file size' })
    expect(entry.acting_email).toBe('test@foxmortgage.ca')
    const inputs = entry.inputs as SavingsLogInputs
    expect(inputs.override?.type).toBe('desk_rate')
    const replayed = replaySavingsAnalysis(inputs)
    expect(replayed).toEqual(entry.figures)
  })
})

describe('override candidates are eligibility-gated by construction', () => {
  it('a BC-only lender never appears, so it can never be picked or matched', () => {
    const candidates = overrideCandidates(seasonedRow(), BOOK, ASOF)
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.some(c => c.lenderSlug === 'kootenay')).toBe(false)
    // The refusal path: a crafted key for the BC quote matches nothing.
    const craftedKey = 'kootenay|fixed|60|2026-07-09|r3.2'
    expect(candidates.find(c => comparableKey(c) === craftedKey)).toBeUndefined()
  })

  it('candidates are same-tier only, and empty for unknown-tier paper', () => {
    const candidates = overrideCandidates(seasonedRow(), BOOK, ASOF)
    expect(candidates.every(c => ['rfa', 'mcap'].includes(c.lenderSlug ?? ''))).toBe(true)
    expect(overrideCandidates(seasonedRow({ 'Mortgage lender': 'Mystery Corp' }), BOOK, ASOF)).toEqual([])
  })
})

describe('no GET can create or apply an override', () => {
  it('the override route exports POST only', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/portal/admin/opportunities/override/route.ts'), 'utf-8')
    expect(src).toMatch(/export async function POST/)
    expect(src).not.toMatch(/export async function GET/)
  })
  it('the PDF GET never honors approval or override params from the query string', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/api/portal/admin/opportunities/[householdId]/pdf/route.ts'),
      'utf-8',
    )
    const getBody = src.slice(src.indexOf('export async function GET'), src.indexOf('export async function POST'))
    expect(getBody).toContain('crossFamilyApproved: false')
    expect(getBody).toContain('graduationApproved: false')
  })
})

describe('the override store is silent in demo mode', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    process.env.FOXCA_SUPABASE_URL = 'https://demo.example.co'
    process.env.FOXCA_SUPABASE_KEY = 'demo-key'
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network must not be reached in demo'))
  })
  afterEach(() => fetchSpy.mockRestore())

  it('writes refused, reads empty, zero network calls', async () => {
    const set = await setOverride({
      householdId: 'H',
      uploadId: null,
      overrideType: 'desk_rate',
      comparable: {},
      sourceNote: 's',
      reason: 'r',
      actingEmail: 'x@y.com',
    })
    const ret = await retireOverride('id', 'x@y.com')
    const list = await activeOverrides()
    expect(set).toMatchObject({ configured: true, ok: false })
    expect(ret).toMatchObject({ configured: true, ok: false })
    expect(list).toMatchObject({ configured: true, ok: true, data: [] })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
