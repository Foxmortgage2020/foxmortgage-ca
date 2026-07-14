// Savings-analysis reproducibility (Task 7): a logged entry's inputs replayed
// against its calc version reproduce its figures exactly, the inputs hash is
// canonical, and demo mode writes nothing. Synthetic fixtures only.

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/demo', () => ({ isDemoMode: () => true }))

import { parseSmmRow } from '@/lib/smm'
import type { BookQuote } from '@/lib/smm-match'
import { analyzeMortgage } from '@/lib/smm-analysis'
import {
  buildSavingsLogEntry,
  replaySavingsAnalysis,
  SAVINGS_CALC_VERSION,
  savingsInputsHash,
  type SavingsLogInputs,
} from '@/lib/savings-log'
import { recordSavingsAnalysis, recordSavingsAnalysisBatch } from '@/lib/smm-store'

const ASOF = '2026-07-13'

// The seasoned proving shape from the Task 3 golden set.
function seasonedRow() {
  return parseSmmRow({
    'Household ID': 'H-log', 'File reference': 'F', 'First name': 'A', 'Last name': 'B', 'Client type': 'CLIENT',
    Email: 'a@b.com', Phone: '1', 'Property address': '1 St', 'Property type': 'detached', 'Property occupancy': 'owner_occupied',
    'Estimated home value': '$700,000.00', 'Mortgage amount': '$500,000.00', 'Mortgage outstanding balance': '$480,116.59',
    'Mortgage rate': '5.50%', 'Mortgage rate type': 'fixed', 'Mortgage closing date': '2024-07-01', 'Mortgage start date': '2024-07-01',
    'Mortgage maturity date': '2029-07-01', 'Mortgage amortization (months)': '300', 'Mortgage term (months)': '60',
    'Mortgage lender': 'MCAP', 'Mortgage insurance type': 'Uninsurable', 'Savings potential': '$800.00',
    'Payment relief (monthly)': '$400.00', 'Accessible equity': '$150,000.00', 'Purchasing power': '$100,000.00',
  })
}

const BOOK: BookQuote[] = [
  { rate: 4.59, rateType: 'fixed', termMonths: 60, productClass: 'conventional', asOfDate: '2026-06-30', status: 'approved', lenderSlug: 'rfa', primeVariance: null, eligibilitySource: 'variant:(none)' },
  { rate: null, rateType: 'adjustable', termMonths: 60, productClass: 'conventional', asOfDate: '2026-07-09', status: 'approved', lenderSlug: 'first-national', primeVariance: -0.5, eligibilitySource: 'variant:(none)' },
]

function entryFor(crossFamilyApproved = false) {
  const row = seasonedRow()
  const { analysis } = analyzeMortgage(row, BOOK, ASOF, { crossFamilyApproved })
  return buildSavingsLogEntry({
    row,
    analysis,
    surface: 'pdf',
    uploadId: null,
    actingEmail: 'test@foxmortgage.ca',
    todayYMD: ASOF,
    methodologyKnown: false,
    crossFamilyApproved,
  })
}

describe('savings-analysis log entries', () => {
  it('carries the calc version, a canonical hash, and every quote with its sheet date', () => {
    const entry = entryFor()
    // v4: methodology_source joined the hashed inputs.
    expect(entry.calc_version).toBe(4)
    expect(SAVINGS_CALC_VERSION).toBe(4)
    expect(String(entry.inputs_hash)).toMatch(/^[0-9a-f]{64}$/)
    const quotes = entry.quotes as { role: string; sheetDate: string | null; rate: number }[]
    expect(quotes.map(q => q.role).sort()).toEqual(['alternative', 'headline'])
    expect(quotes.every(q => q.sheetDate != null)).toBe(true)
    expect(entry.bucket).toBeDefined()
    expect(entry.acting_email).toBe('test@foxmortgage.ca')
  })

  it('the hash is stable across key order and moves when an input moves', () => {
    const inputs = entryFor().inputs as SavingsLogInputs
    const reordered = Object.fromEntries(Object.entries(inputs).reverse()) as unknown as SavingsLogInputs
    expect(savingsInputsHash(reordered)).toBe(savingsInputsHash(inputs))
    expect(savingsInputsHash({ ...inputs, balance: (inputs.balance ?? 0) + 1 })).not.toBe(savingsInputsHash(inputs))
  })

  it('REPLAY: the logged inputs reproduce the logged figures exactly', () => {
    const entry = entryFor()
    const replayed = replaySavingsAnalysis(entry.inputs as SavingsLogInputs)
    expect(replayed).toEqual(entry.figures)
    // And the anchor figures are what the deliverable printed.
    expect((entry.figures as Record<string, unknown>).currentPayment).toBeCloseTo(3051.96, 2)
    expect((entry.figures as Record<string, unknown>).monthlySaving).toBeCloseTo(244.12, 2)
  })

  it('REPLAY: a cross-family approved entry reproduces too, alternative recomputed not echoed', () => {
    const entry = entryFor(true)
    expect(entry.cross_family_approved).toBe(true)
    const replayed = replaySavingsAnalysis(entry.inputs as SavingsLogInputs)
    expect(replayed).toEqual(entry.figures)
    expect((entry.figures as Record<string, unknown>).monthlySaving).toBeCloseTo(409.84, 2)
    expect((entry.figures as Record<string, unknown>).crossFamilyRecommended).toBe(true)
  })

  it('REPLAY: a short-term-approved entry reproduces the shortened horizon and its bucket', () => {
    // A cheaper 1-year beside the covering 3-year: Michael approves the play,
    // the projection shortens to 12 months, and replay reproduces exactly —
    // the applied state rides the inputs (Task 0b).
    const termBook: BookQuote[] = [
      { rate: 4.19, rateType: 'fixed', termMonths: 12, productClass: 'conventional', asOfDate: '2026-07-02', status: 'approved', lenderSlug: 'mcap', primeVariance: null, eligibilitySource: 'variant:(none)' },
      { rate: 4.8, rateType: 'fixed', termMonths: 36, productClass: 'conventional', asOfDate: '2026-06-30', status: 'approved', lenderSlug: 'rfa', primeVariance: null, eligibilitySource: 'variant:(none)' },
    ]
    const row = seasonedRow()
    const { analysis } = analyzeMortgage(row, termBook, ASOF, { shortTermApproved: true })
    expect(analysis.comparable?.termMonths).toBe(12)
    expect(analysis.shortTermRecommended).toBe(true)
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
    expect((entry.inputs as SavingsLogInputs).shortTermApplied).toBe(true)
    const replayed = replaySavingsAnalysis(entry.inputs as SavingsLogInputs)
    expect(replayed).toEqual(entry.figures)
    expect((entry.figures as Record<string, unknown>).horizonMonths).toBe(12)
    expect((entry.figures as Record<string, unknown>).shortTermRecommended).toBe(true)
  })

  it('every logged quote carries its term beside its rate, the short-term flag included', () => {
    const termBook: BookQuote[] = [
      { rate: 4.19, rateType: 'fixed', termMonths: 12, productClass: 'conventional', asOfDate: '2026-07-02', status: 'approved', lenderSlug: 'mcap', primeVariance: null, eligibilitySource: 'variant:(none)' },
      { rate: 4.8, rateType: 'fixed', termMonths: 36, productClass: 'conventional', asOfDate: '2026-06-30', status: 'approved', lenderSlug: 'rfa', primeVariance: null, eligibilitySource: 'variant:(none)' },
    ]
    const row = seasonedRow()
    const { analysis } = analyzeMortgage(row, termBook, ASOF)
    const entry = buildSavingsLogEntry({
      row,
      analysis,
      surface: 'board',
      uploadId: null,
      actingEmail: 'test@foxmortgage.ca',
      todayYMD: ASOF,
      methodologyKnown: false,
      crossFamilyApproved: false,
    })
    const quotes = entry.quotes as { role: string; termMonths: number; rate: number }[]
    expect(quotes.map(q => q.role)).toContain('short_term_flag')
    expect(quotes.every(q => typeof q.termMonths === 'number' && q.termMonths > 0)).toBe(true)
    const headline = quotes.find(q => q.role === 'headline')!
    expect(headline.termMonths).toBe(36)
  })
})

describe('the log store is silent in demo mode', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    process.env.FOXCA_SUPABASE_URL = 'https://demo.example.co'
    process.env.FOXCA_SUPABASE_KEY = 'demo-key'
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network must not be reached in demo'))
  })
  afterEach(() => fetchSpy.mockRestore())

  it('single and batch writes are refused with zero network calls', async () => {
    const one = await recordSavingsAnalysis(entryFor(), false)
    const batch = await recordSavingsAnalysisBatch([entryFor()])
    expect(one).toMatchObject({ configured: true, ok: false })
    expect(batch).toMatchObject({ configured: true, ok: false })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
