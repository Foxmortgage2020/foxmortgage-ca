// Client PDF smoke tests (Session 6): the generator must produce a valid
// document across the whole floating vocabulary, including the honest
// prime-unavailable path and verbatim program-notes pagination. Set
// RATES_PDF_OUT=/path/dir to also write the artifacts for eyes-on review
// (used for the session evidence screenshots).

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateRatesPdf, ratesPdfFilename } from '@/lib/rates-pdf'
import { DEFAULT_SCENARIO, type RatesReference, type Scenario } from '@/lib/scenario'
import type { RateQuoteFullRow } from '@/lib/underwriting'

const REF: RatesReference = {
  prime: { value: 4.45, as_of: '2026-07-09', source: 'CMLS sheet July 9, 2026' },
  lender_overrides: {},
  floating_mechanisms: {
    convention: {
      adjustable:
        'An adjustable rate mortgage (ARM) reprices the PAYMENT when prime moves: the payment changes and the amortization schedule stays protected.',
      variable:
        'A variable rate mortgage (VRM) holds the payment static when prime moves: rising prime shifts the interest/principal split and can extend effective amortization (trigger-rate exposure).',
      source: 'UNDERWRITING.md 1.3',
    },
    lenders: {
      mcap: {
        product_label: 'VIP MPower ARM',
        rate_type: 'adjustable',
        payment_behaviour: 'payment_adjusts',
        basis: 'printed_label_plus_convention',
        note: 'MCAP prices its floating products as ARM; ARM denotes a payment that adjusts with prime.',
        source: 'MCAP best-rates email, July 9, 2026',
        as_of: '2026-07-09',
      },
      scotia: {
        product_label: 'Flex Closed',
        rate_type: 'variable',
        payment_behaviour: 'payment_static',
        basis: 'printed_label_plus_convention',
        note: 'Scotia labels its floating products VRM; the Flex behaviour awaits lender documentation.',
        source: 'Scotia sheet June 25, 2026',
        as_of: '2026-07-06',
      },
    },
  },
  quote_slug_coverage: { mapped: { mcap: ['mcap'], scotia: ['scotia'] }, unmapped: [] },
}

function q(over: Partial<RateQuoteFullRow>): RateQuoteFullRow {
  return {
    id: 'TEST-q',
    intelItemId: 'TEST-intel',
    lenderSlug: 'mcap',
    productClass: 'insurable',
    variant: null,
    termMonths: 60,
    rate: 4.19,
    rateType: 'fixed',
    primeVariance: null,
    cashbackPct: null,
    programNotes: null,
    compBps: 100,
    asOfDate: '2026-07-09',
    expiryDate: null,
    sourcePage: 2,
    sourceSnippet: 'TEST synthetic row for PDF proof',
    confidence: 0.92,
    status: 'approved',
    extractedBy: 'claude/rates-v2',
    createdAt: '2026-07-10T00:00:00Z',
    reviewedAt: null,
    approvedVia: 'sheet:TEST',
    heldReason: null,
    ...over,
  }
}

const SCENARIO: Scenario = {
  ...DEFAULT_SCENARIO,
  amount: 650_000,
  propertyValue: 1_000_000,
  termMonths: 60,
}

const PINS: RateQuoteFullRow[] = [
  q({ id: 'TEST-fixed', lenderSlug: 'scotia', rate: 4.19, rateType: 'fixed' }),
  q({
    id: 'TEST-arm',
    lenderSlug: 'mcap',
    rateType: 'adjustable',
    rate: null,
    primeVariance: -0.75,
    variant: 'ltv75-80',
  }),
  q({
    id: 'TEST-arm-cb',
    lenderSlug: 'mcap',
    rateType: 'adjustable',
    rate: null,
    primeVariance: -0.15,
    cashbackPct: 3,
    programNotes:
      'Cash back is 3% of the mortgage amount, advanced at closing.\nClawback applies on prepayment or transfer before maturity.\nNot combinable with other promotional pricing.',
  }),
]

const LENDER_INFO = {
  scotia: { name: 'Scotiabank', asOf: '2026-07-06' },
  mcap: { name: 'MCAP', asOf: '2026-07-09' },
}

describe('rates PDF across the floating vocabulary', () => {
  it('generates with computed effective rates, mechanism lines, and cash back footnotes', async () => {
    const bytes = await generateRatesPdf({
      scenario: SCENARIO,
      quotes: PINS,
      lenderInfo: LENDER_INFO,
      reference: REF,
      generatedDate: '2026-07-10',
      sourceFileRef: 'TEST-PDF-PROOF',
    })
    expect(bytes.length).toBeGreaterThan(2000)
    expect(String.fromCharCode.apply(null, Array.from(bytes.slice(0, 5)))).toBe('%PDF-')
    if (process.env.RATES_PDF_OUT) {
      mkdirSync(process.env.RATES_PDF_OUT, { recursive: true })
      writeFileSync(join(process.env.RATES_PDF_OUT, 'proof-with-prime.pdf'), bytes)
    }
  })

  it('generates the honest prime-unavailable document when the reference is null', async () => {
    const bytes = await generateRatesPdf({
      scenario: SCENARIO,
      quotes: PINS,
      lenderInfo: LENDER_INFO,
      reference: null,
      generatedDate: '2026-07-10',
      sourceFileRef: null,
    })
    expect(bytes.length).toBeGreaterThan(2000)
    if (process.env.RATES_PDF_OUT) {
      mkdirSync(process.env.RATES_PDF_OUT, { recursive: true })
      writeFileSync(join(process.env.RATES_PDF_OUT, 'proof-no-prime.pdf'), bytes)
    }
  })

  it('names the file by date only, never client data', () => {
    expect(ratesPdfFilename('2026-07-10')).toBe('rates-comparison-2026-07-10.pdf')
  })
})
