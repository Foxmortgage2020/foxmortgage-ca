// Client PDF smoke tests (Session 6): the generator must produce a valid
// document across the whole floating vocabulary, including the honest
// prime-unavailable path and verbatim program-notes pagination. Set
// RATES_PDF_OUT=/path/dir to also write the artifacts for eyes-on review
// (used for the session evidence screenshots).

import zlib from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PDFArray, PDFDocument, PDFName } from 'pdf-lib'
import { generateRatesPdf, ratesPdfFilename, type PdfOfferInput } from '@/lib/rates-pdf'
import { DEFAULT_SCENARIO, type RatesReference, type Scenario } from '@/lib/scenario'
import type { RateQuoteFullRow } from '@/lib/underwriting'

// pdf-lib draws every glyph run as a Flate-compressed content stream with
// text stored as hex string literals (<hex> Tj). To audit what the client
// actually sees, inflate each page's content stream and hex-decode the
// literals back to text. Used by the compensation guard below.
async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes)
  let raw = ''
  for (const page of doc.getPages()) {
    const contents = page.node.get(PDFName.of('Contents'))
    const resolved = doc.context.lookup(contents)
    const refs = resolved instanceof PDFArray ? resolved.asArray() : [contents]
    for (const ref of refs) {
      const stream = doc.context.lookup(ref) as { contents?: Uint8Array } | undefined
      if (!stream?.contents) continue
      let dec: Buffer
      try {
        dec = zlib.inflateSync(Buffer.from(stream.contents))
      } catch {
        dec = Buffer.from(stream.contents)
      }
      raw += dec.toString('latin1')
    }
  }
  let text = ''
  const re = /<([0-9A-Fa-f]+)>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    const hex = m[1]
    for (let i = 0; i + 1 < hex.length; i += 2) {
      text += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16))
    }
  }
  return text
}

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

// Compliance guard (Rates v3 Part 6): lender compensation is a regulated
// topic. The compare tray shows basis points to Michael, but the CLIENT PDF
// must never show compensation to a borrower. Every pinned quote below
// carries a distinctive sentinel comp figure (9137 bps) that appears in no
// other field; the generated document must contain none of it, nor the
// words "bps" or "Compensation", under any input shape.
describe('client PDF never discloses compensation', () => {
  const SENTINEL = 9137
  const comped = (over: Partial<RateQuoteFullRow>) => q({ compBps: SENTINEL, ...over })

  const INPUT_SHAPES: {
    label: string
    quotes: RateQuoteFullRow[]
    reference: RatesReference | null
    offers?: PdfOfferInput[]
  }[] = [
    {
      label: 'fixed + floating + cash back, prime available',
      reference: REF,
      quotes: [
        comped({ id: 'TEST-fx', lenderSlug: 'scotia', rate: 4.19, rateType: 'fixed' }),
        comped({ id: 'TEST-arm', lenderSlug: 'mcap', rateType: 'adjustable', rate: null, primeVariance: -0.75 }),
        comped({
          id: 'TEST-cb',
          lenderSlug: 'mcap',
          rateType: 'adjustable',
          rate: null,
          primeVariance: -0.15,
          cashbackPct: 3,
          programNotes: 'Cash back is 3% of the mortgage amount, advanced at closing.',
        }),
      ],
    },
    {
      label: 'floating only, prime unavailable',
      reference: null,
      quotes: [
        comped({ id: 'TEST-v', lenderSlug: 'scotia', rateType: 'variable', rate: null, primeVariance: -0.9 }),
      ],
    },
    {
      // A pinned OFFER carrying bonus compensation inside its conditions and
      // priced text: the offers desk session's leak vector. Scrubbed like the
      // sheet fields.
      label: 'offer with bonus comp in its conditions and priced text',
      reference: REF,
      quotes: [comped({ id: 'TEST-q', lenderSlug: 'scotia', rate: 4.19, rateType: 'fixed' })],
      offers: [
        {
          lenderName: 'Scotiabank',
          description: 'Limited-time 3yr special',
          ratePct: 4.19,
          ratesText: 'fixed 4.19% with 9137 bps to the broker',
          conditions: [
            'Must use Scotia Mortgage Plus.',
            'Bonus compensation of 9137 bps paid to the broker on funding.',
            'Applications by August 24.',
          ],
          started: '2026-06-25',
          expiry: '2026-08-24',
        },
      ],
    },
    {
      // The priced-text branch specifically: when offerScenarioResult returns
      // no rate (prose offer), the route passes ratePct:null and the PDF draws
      // the verbatim rates_or_amounts text — which can itself carry comp. Force
      // the sentinel to surface ONLY through that branch (clean conditions), so
      // the ratesText redactComp guard is non-vacuously exercised.
      label: 'offer priced-text (no structured rate) carrying comp',
      reference: REF,
      quotes: [comped({ id: 'TEST-pt', lenderSlug: 'scotia', rate: 4.19, rateType: 'fixed' })],
      offers: [
        {
          lenderName: 'Neo',
          description: 'Reduced fixed rate',
          ratePct: null,
          ratesText: 'fixed 4.79%, 9137 bps to the broker',
          conditions: ['Owner-occupied only.'],
          started: null,
          expiry: '2026-08-31',
        },
      ],
    },
    {
      // The real leak vector: compensation text riding inside the verbatim
      // extracted free-text fields (source snippet + program notes), not just
      // the structured compBps. The snippet must not print at all; the program
      // note's comp clause must be scrubbed.
      label: 'compensation text hidden in extracted free-text fields',
      reference: REF,
      quotes: [
        comped({
          id: 'TEST-leak',
          lenderSlug: 'mcap',
          rateType: 'fixed',
          rate: 4.19,
          cashbackPct: 3,
          sourceSnippet: '3yr fixed 4.19% -- finder fee 9137 bps to the broker',
          programNotes:
            'Cash back is 3% of the mortgage amount, advanced at closing.\nCompensation is 9137 bps paid to the broker.\nClawback applies on prepayment.',
        }),
      ],
    },
  ]

  for (const shape of INPUT_SHAPES) {
    it(`omits compensation for: ${shape.label}`, async () => {
      const bytes = await generateRatesPdf({
        scenario: SCENARIO,
        quotes: shape.quotes,
        lenderInfo: LENDER_INFO,
        offers: shape.offers,
        reference: shape.reference,
        generatedDate: '2026-07-10',
        sourceFileRef: null,
      })
      const text = await extractPdfText(bytes)
      // Extraction is non-vacuous: a known heading must be present, so an
      // empty pull can never make the guard pass silently.
      expect(text).toContain('FOX MORTGAGE')
      expect(text).not.toContain(String(SENTINEL))
      expect(text.toLowerCase()).not.toContain('bps')
      expect(text).not.toContain('Compensation')
    })
  }
})

describe('client PDF carries a pinned offer with its conditions and expiry', () => {
  it('prints the conditions verbatim and a dated expiry', async () => {
    const offer: PdfOfferInput = {
      lenderName: 'Scotiabank',
      description: 'Limited-time 3yr special',
      ratePct: 4.19,
      ratesText: null,
      conditions: ['Must use Scotia Mortgage Plus.', 'Applications by August 24.'],
      started: '2026-06-25',
      expiry: '2026-08-24',
    }
    const bytes = await generateRatesPdf({
      scenario: SCENARIO,
      quotes: [q({ id: 'TEST-q', lenderSlug: 'scotia', rate: 4.19, rateType: 'fixed', compBps: 100 })],
      lenderInfo: LENDER_INFO,
      offers: [offer],
      reference: REF,
      generatedDate: '2026-07-10',
      sourceFileRef: null,
    })
    const text = await extractPdfText(bytes)
    expect(text).toContain('Promotional offers included')
    expect(text).toContain('Must use Scotia Mortgage Plus')
    expect(text).toContain('2026-08-24')
  })

  it('renders the loud no-end-date warning for a null-expiry offer, never a dash', async () => {
    const offer: PdfOfferInput = {
      lenderName: 'EQ Bank',
      description: 'Reduced 1yr and 2yr fixed',
      ratePct: null,
      ratesText: 'fixed 4.89%',
      conditions: ['FICO 680+.'],
      started: '2026-07-06',
      expiry: null,
    }
    const bytes = await generateRatesPdf({
      scenario: SCENARIO,
      quotes: [q({ id: 'TEST-q', lenderSlug: 'scotia', rate: 4.19, rateType: 'fixed', compBps: 100 })],
      lenderInfo: LENDER_INFO,
      offers: [offer],
      reference: REF,
      generatedDate: '2026-07-10',
      sourceFileRef: null,
    })
    const text = await extractPdfText(bytes)
    expect(text).toContain('no stated end date')
    expect(text).toContain('will not expire on its own')
  })
})
