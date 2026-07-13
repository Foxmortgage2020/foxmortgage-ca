// The client savings report (Part 2 rebuild) — golden tests. The document is
// generated from analyzeMortgage output through the SAME mapper the route
// uses (savingsPdfInputFromAnalysis), on the seasoned SYNTHETIC identity, and
// the extracted text is asserted against the brief's acceptance list: the
// relief figure, the years-sooner figure, the 3MI minimum labelled as a
// minimum, the break-even penalty, NO net-benefit conclusion on a fixed
// break, NO comparable lender name anywhere, the term beside every rate, no
// forbidden punctuation, and three pages exactly. Compensation never reaches
// a borrower (the sentinel sweep at the bottom).
// Set SAVINGS_PDF_OUT=/path/dir to also write artifacts for eyes-on review.

import zlib from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PDFArray, PDFDocument, PDFName } from 'pdf-lib'
import { parseSmmRow, type FoxAnalysis } from '@/lib/smm'
import type { BookQuote } from '@/lib/smm-match'
import { analyzeMortgage } from '@/lib/smm-analysis'
import {
  generateSavingsPdf,
  savingsPdfFilename,
  savingsPdfInputFromAnalysis,
  type SavingsPdfInput,
} from '@/lib/savings-pdf'

async function extractPdfText(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
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
  const re = /<([0-9A-Fa-f]+)>|\(((?:[^()\\]|\\.)*)\)\s*Tj/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    if (m[1] != null) {
      const hex = m[1]
      for (let i = 0; i + 1 < hex.length; i += 2) text += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16))
    } else if (m[2] != null) {
      text += m[2].replace(/\\(.)/g, '$1')
    }
    text += ' '
  }
  return { text, pages: doc.getPages().length }
}

const ASOF = '2026-07-13'

// The seasoned SYNTHETIC identity (never real client data): $500,000 at 5.50%
// fixed over 300 months, started 2024-07-01, maturing 2029-07-01 — 35 months
// left on the term, 24 payments in, balance on schedule.
function seasonedRow(over: Record<string, string> = {}) {
  return parseSmmRow({
    'Household ID': 'H-pdf', 'File reference': 'F', 'First name': 'Jordan', 'Last name': 'Sample', 'Client type': 'CLIENT',
    Email: 'a@b.com', Phone: '1', 'Property address': '1 St', 'Property type': 'detached', 'Property occupancy': 'owner_occupied',
    'Estimated home value': '$700,000.00', 'Mortgage amount': '$500,000.00', 'Mortgage outstanding balance': '$480,116.59',
    'Mortgage rate': '5.50%', 'Mortgage rate type': 'fixed', 'Mortgage closing date': '2024-07-01', 'Mortgage start date': '2024-07-01',
    'Mortgage maturity date': '2029-07-01', 'Mortgage amortization (months)': '300', 'Mortgage term (months)': '60',
    'Mortgage lender': 'MCAP', 'Mortgage insurance type': 'Uninsurable', 'Savings potential': '$800.00',
    'Payment relief (monthly)': '$400.00', 'Accessible equity': '$150,000.00', 'Purchasing power': '$100,000.00',
    ...over,
  })
}

const ANCHOR_BOOK: BookQuote[] = [
  { rate: 4.59, rateType: 'fixed', termMonths: 60, productClass: 'conventional', asOfDate: '2026-06-30', status: 'approved', lenderSlug: 'rfa', primeVariance: null, eligibilitySource: 'variant:(none)' },
]
const PROVING_BOOK: BookQuote[] = [
  ...ANCHOR_BOOK,
  { rate: null, rateType: 'adjustable', termMonths: 60, productClass: 'conventional', asOfDate: '2026-07-09', status: 'approved', lenderSlug: 'first-national', primeVariance: -0.5, eligibilitySource: 'variant:(none)' },
]

function inputFor(analysis: FoxAnalysis, row = seasonedRow()): SavingsPdfInput {
  return savingsPdfInputFromAnalysis({
    generatedDate: ASOF,
    clientName: `${row.firstName} ${row.lastName}`,
    currentRate: row.rate,
    currentRateType: row.rateType,
    currentLender: row.lender.display,
    balance: row.balance,
    maturity: row.maturityDate,
    analysis,
    showComparable: true,
  })
}

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-CA')

describe('savings report golden (the seasoned fixed refinance)', () => {
  it('renders the three-page choice document with every acceptance string', async () => {
    const { analysis } = analyzeMortgage(seasonedRow(), ANCHOR_BOOK, ASOF)
    expect(analysis.bucket).toBe('act_now')
    const bytes = await generateSavingsPdf(inputFor(analysis))
    if (process.env.SAVINGS_PDF_OUT) {
      mkdirSync(process.env.SAVINGS_PDF_OUT, { recursive: true })
      writeFileSync(join(process.env.SAVINGS_PDF_OUT, 'savings-report-golden.pdf'), bytes)
    }
    const { text, pages } = await extractPdfText(bytes)

    // Three US-letter pages exactly.
    expect(pages).toBe(3)
    expect(text).toContain('FOX MORTGAGE')

    // The relief figure (option 1), from the analysis, not re-derived.
    expect(analysis.monthlySaving).toBeCloseTo(244.12, 2)
    expect(text).toContain('$244 a month back')

    // The years-sooner figure (option 2).
    expect(analysis.samePaymentPlan).not.toBeNull()
    expect(analysis.samePaymentPlan!.monthsSooner).toBe(36)
    expect(text).toContain('3 yrs sooner')
    expect(text).toContain(money(analysis.samePaymentPlan!.paymentsAvoided))

    // The 3MI figure stated as a MINIMUM, and the break-even penalty stated.
    expect(text).toContain('That is the minimum')
    expect(text).toContain(money(analysis.penalty!.threeMonthsInterest))
    const breakEven = analysis.monthlySaving! * analysis.horizonMonths!
    expect(text).toContain(money(breakEven))
    expect(text).toContain('break-even')

    // NO net-benefit conclusion for a fixed break (method unknown here).
    expect(text).not.toContain('worth about')
    expect(text).not.toContain(money(analysis.netBenefit!))
    expect(text).not.toContain('pays for itself')

    // No comparable lender name, anywhere. The client's own lender may print.
    expect(text).not.toMatch(/RFA/i)
    expect(text).toContain('MCAP')
    expect(text).toContain('a lender we work with')

    // The term beside every rate (Task 0 amendment): the rate strip and the
    // comparison table both carry it.
    expect(text).toContain('4.59% fixed, 5-year term')
    expect(text).toContain('4.59% (5-year term)')
    expect(text).toContain('rate sheet dated June 30, 2026')

    // The comparison table draws the logged positions.
    expect(text).toContain('Interest paid by')
    expect(text).toContain(money(analysis.comparison!.option1.balanceAtHorizon))
    expect(text).toContain(money(analysis.comparison!.today.interestPaid))

    // Forbidden punctuation: no em dashes, no exclamation points, no
    // semicolons in prose.
    expect(text).not.toContain('—')
    expect(text).not.toContain('!')
    expect(text).not.toContain(';')

    // Vocabulary contract.
    expect(text).toContain('Strategic Mortgage Monitoring')
    expect(text).toContain('Mortgage Agent Level 2')
    expect(text).not.toMatch(/broker\b/i)
    expect(text).toContain('Page 1 of 3')
    expect(text).toContain('Page 3 of 3')
  })

  it('a documented IRD method still draws no conclusion, only a different confirm path', async () => {
    const { analysis } = analyzeMortgage(seasonedRow(), ANCHOR_BOOK, ASOF)
    const withMethod: FoxAnalysis = {
      ...analysis,
      penalty: { ...analysis.penalty!, methodologyKnown: true, framing: 'Fixed: the greater of three months of interest and the interest-rate differential, per the lender methodology.' },
    }
    const { text } = await extractPdfText(await generateSavingsPdf(inputFor(withMethod)))
    expect(text).not.toContain('worth about')
    expect(text).toContain('That is the minimum')
    expect(text).toContain('penalty method on file')
  })
})

describe('escalations render only with their approval flag', () => {
  it('an unapproved cross-family alternative never prints', async () => {
    const { analysis } = analyzeMortgage(seasonedRow(), PROVING_BOOK, ASOF)
    expect(analysis.alternative?.crossFamily).toBe(true) // it exists on the card
    const { text } = await extractPdfText(await generateSavingsPdf(inputFor(analysis)))
    expect(text).not.toContain('3.95') // the adjustable option stays off the document
    expect(text).not.toContain('adjustable')
  })

  it('an approved cross-family headline prints discount-first with its risk line and term', async () => {
    const { analysis } = analyzeMortgage(seasonedRow(), PROVING_BOOK, ASOF, { crossFamilyApproved: true })
    expect(analysis.crossFamilyRecommended).toBe(true)
    const { text } = await extractPdfText(await generateSavingsPdf(inputFor(analysis)))
    expect(text).toContain('prime minus 0.5')
    expect(text).toContain('about 3.95%')
    expect(text).toContain('5-year term')
    expect(text).toMatch(/adjustable/i)
    expect(text).not.toMatch(/First National/i) // never the comparable lender's name
  })
})

describe('transaction and family honesty carries into the report', () => {
  it('a switch keeps its conclusion and states that no penalty applies', async () => {
    const { analysis } = analyzeMortgage(
      seasonedRow({ 'Mortgage maturity date': '2026-09-15' }),
      ANCHOR_BOOK,
      ASOF,
    )
    expect(analysis.transaction).toBe('switch')
    const { text } = await extractPdfText(await generateSavingsPdf(inputFor(analysis)))
    expect(text).toContain('No penalty at your renewal')
    expect(text).toContain('worth about')
    expect(text).not.toContain('That is the minimum')
  })

  it('a floating client keeps its conclusion (three months of interest IS the penalty)', async () => {
    const floatingBook: BookQuote[] = [
      { rate: null, rateType: 'adjustable', termMonths: 60, productClass: 'conventional', asOfDate: '2026-07-09', status: 'approved', lenderSlug: 'first-national', primeVariance: -1.2, eligibilitySource: 'variant:(none)' },
    ]
    const row = seasonedRow({ 'Mortgage rate type': 'adjustable' })
    const { analysis } = analyzeMortgage(row, floatingBook, ASOF)
    expect(analysis.bucket).toBe('act_now')
    const { text } = await extractPdfText(await generateSavingsPdf(inputFor(analysis, row)))
    expect(text).toContain('that is the penalty')
    expect(text).toContain('worth about')
    expect(text).not.toContain('That is the minimum')
  })
})

describe('blocked and honest states render no figures', () => {
  it('a marginal floating file never prints a negative "worth about" figure', async () => {
    // Floating marginal: saving exists, the exact penalty roughly cancels it.
    // Page 3 must state close-to-even, never "worth about $-800".
    const { analysis } = analyzeMortgage(seasonedRow(), ANCHOR_BOOK, ASOF)
    const marginalFloating: FoxAnalysis = { ...analysis, bucket: 'marginal', netBenefit: -800 }
    const row = seasonedRow({ 'Mortgage rate type': 'variable' })
    const input = { ...inputFor(marginalFloating, row), penaltyFraming: 'Floating: the penalty is three months of interest.' }
    const { text } = await extractPdfText(await generateSavingsPdf(input))
    expect(text).not.toContain('worth about')
    expect(text).not.toContain('$-')
    expect(text).toContain('close to even')
  })

  it('a stay-put file gets the one-page wait document with the comparable term stated', async () => {
    // On schedule at 1.99% (balanceAfter(500000, 1.99, 300, 24) = 468,466.97).
    const row = seasonedRow({ 'Mortgage rate': '1.99%', 'Mortgage outstanding balance': '$468,466.97' })
    const { analysis } = analyzeMortgage(row, ANCHOR_BOOK, ASOF)
    expect(analysis.bucket).toBe('stay_put')
    const { text, pages } = await extractPdfText(await generateSavingsPdf(inputFor(analysis, row)))
    expect(pages).toBe(1)
    expect(text.toLowerCase()).toContain('wait')
    expect(text).toContain('Staying put today is the right call')
    expect(text).toContain('5-year term') // the term rides even the wait document
    expect(text).not.toContain('worth about')
    expect(text).toContain('Page 1 of 1')
  })

  it('a stay-put file with a small positive saving still gets the wait document, never a choice document', async () => {
    // 5.30% comparable vs 5.50% held: about $54 a month of saving that the
    // penalty erases (net -$4,695). A stay-put file must never receive
    // option cards.
    const book: BookQuote[] = [
      { rate: 5.3, rateType: 'fixed', termMonths: 60, productClass: 'conventional', asOfDate: '2026-06-30', status: 'approved', lenderSlug: 'rfa', primeVariance: null, eligibilitySource: 'variant:(none)' },
    ]
    const { analysis } = analyzeMortgage(seasonedRow(), book, ASOF)
    expect(analysis.bucket).toBe('stay_put')
    expect(analysis.monthlySaving ?? 0).toBeGreaterThan(0)
    const { text, pages } = await extractPdfText(await generateSavingsPdf(inputFor(analysis)))
    expect(pages).toBe(1)
    expect(text).not.toContain('OPTION 1')
    expect(text).toContain('Staying put today is the right call')
  })

  it('a marginal fixed break whose MINIMUM penalty exceeds the break-even states it does not clear the bar', async () => {
    // 4.90% comparable: about $162 a month, net -$932 (marginal), but the
    // $6,602 minimum already sits above the $5,670 break-even — so page 3
    // must never say "we move at the minimum".
    const book: BookQuote[] = [
      { rate: 4.9, rateType: 'fixed', termMonths: 60, productClass: 'conventional', asOfDate: '2026-06-30', status: 'approved', lenderSlug: 'rfa', primeVariance: null, eligibilitySource: 'variant:(none)' },
    ]
    const { analysis } = analyzeMortgage(seasonedRow(), book, ASOF)
    expect(analysis.bucket).toBe('marginal')
    expect(analysis.penalty!.threeMonthsInterest).toBeGreaterThan(analysis.monthlySaving! * analysis.horizonMonths!)
    const { text, pages } = await extractPdfText(await generateSavingsPdf(inputFor(analysis)))
    expect(pages).toBe(3)
    expect(text).toContain('does not clear the bar')
    expect(text).not.toContain('we move while the rate holds')
    expect(text).not.toContain('worth about')
  })

  it('a reconciliation review document states NO figure at all', async () => {
    const { analysis } = analyzeMortgage(seasonedRow({ 'Mortgage outstanding balance': '$455,000.00' }), ANCHOR_BOOK, ASOF)
    expect(analysis.bucket).toBe('review')
    const { text, pages } = await extractPdfText(await generateSavingsPdf(inputFor(analysis)))
    expect(pages).toBe(1)
    expect(text).toContain('do not line up')
    expect(text).not.toContain('455,000')
    expect(text).not.toContain('4.59')
    expect(text).not.toMatch(/RFA/i)
  })

  it('a withheld comparable prints the confirming-availability state, never the rate', async () => {
    const { analysis } = analyzeMortgage(seasonedRow(), ANCHOR_BOOK, ASOF)
    const input = savingsPdfInputFromAnalysis({
      generatedDate: ASOF,
      clientName: 'Jordan Sample',
      currentRate: 5.5,
      currentRateType: 'fixed',
      currentLender: 'MCAP',
      balance: 480_116.59,
      maturity: '2029-07-01',
      analysis,
      showComparable: false, // the route's province gate said no
    })
    const { text } = await extractPdfText(await generateSavingsPdf(input))
    expect(text).toContain('confirming which lenders can lend in your province')
    expect(text).not.toContain('4.59')
  })

  it('insufficient data says so plainly', async () => {
    const { analysis } = analyzeMortgage(seasonedRow({ 'Mortgage rate type': 'variable' }), ANCHOR_BOOK, ASOF)
    expect(analysis.bucket).toBe('insufficient') // no variable quote exists
    const { text } = await extractPdfText(await generateSavingsPdf(inputFor(analysis)))
    expect(text).toContain('could not run a full comparison')
  })
})

// The compensation guard: inject a distinctive sentinel into EVERY string
// field and prove none of it — nor "bps", nor "Compensation" — reaches the
// document, on every branch shape.
describe('savings report never discloses compensation', () => {
  const SENTINEL = 9137
  function base(over: Partial<SavingsPdfInput> = {}): SavingsPdfInput {
    return {
      generatedDate: ASOF,
      clientName: 'Jordan Sample',
      currentRate: 5.5,
      currentRateType: 'fixed',
      currentLender: 'MCAP',
      balance: 480_116.59,
      maturity: '2029-07-01',
      currentPayment: 3051.96,
      comparable: { rate: 4.59, termMonths: 60, lender: 'RFA', asOf: '2026-06-30', rateTypeLabel: 'fixed' },
      productClass: 'conventional',
      transaction: 'refinance',
      requalification: true,
      newPayment: 2807.84,
      monthlySaving: 244.12,
      remainingMonths: 35,
      remainingAmortizationMonths: 276,
      horizonMonths: 35,
      samePaymentPlan: { months: 240, monthsSooner: 36, paymentsAvoided: 109870.56 },
      comparison: {
        horizonMonths: 35,
        today: { payment: 3051.96, balanceAtHorizon: 450000, interestPaid: 76000 },
        option1: { payment: 2807.84, balanceAtHorizon: 452000, interestPaid: 70000 },
        option2: { payment: 3051.96, balanceAtHorizon: 443000, interestPaid: 69500 },
      },
      penaltyThreeMonthsInterest: 6601.6,
      penaltyFraming: 'Fixed: the greater of three months of interest and the interest-rate differential.',
      penaltyMethodologyKnown: false,
      breakEvenMonths: 27,
      netBenefit: 1942.6,
      bucket: 'act_now',
      note: null,
      ...over,
    }
  }

  const SHAPES: { label: string; input: SavingsPdfInput }[] = [
    {
      label: 'comp in the lender names, the framing, and the note (three-page document)',
      input: base({
        currentLender: `MCAP (finder fee ${SENTINEL} bps to the broker)`,
        comparable: { rate: 4.59, termMonths: 60, lender: `RFA -- compensation ${SENTINEL} bps`, asOf: '2026-06-30', rateTypeLabel: 'fixed' },
        penaltyFraming: `Fixed penalty. Bonus compensation of ${SENTINEL} bps paid to the broker on funding.`,
        note: `Great fit. Comp: ${SENTINEL} bps to the broker.`,
      }),
    },
    {
      label: 'comp in the client name on the wait document',
      input: base({
        bucket: 'stay_put',
        monthlySaving: 0,
        netBenefit: -4000,
        clientName: `Test Client -- finder fee ${SENTINEL} bps`,
        currentLender: `RFA (compensation ${SENTINEL} bps)`,
      }),
    },
    {
      label: 'comp in the insufficient document',
      input: base({
        bucket: 'insufficient',
        comparable: null,
        currentLender: `Westboro -- ${SENTINEL} bps finder fee`,
        clientName: `Someone (comp ${SENTINEL} bps)`,
      }),
    },
    {
      label: 'comp in the review document',
      input: base({
        bucket: 'review',
        clientName: `Someone (comp ${SENTINEL} bps)`,
        currentLender: `MERIX -- ${SENTINEL} bps finder fee`,
      }),
    },
    {
      label: 'comp in the override source note, the approval note, and the strategy note',
      input: base({
        overrideType: 'desk_rate',
        overrideSourceNote: `BDM quote, includes ${SENTINEL} bps finder fee`,
        approvalNote: `Approved. Compensation ${SENTINEL} bps rides this option.`,
        shortTermNote: `Short play. Comp ${SENTINEL} bps to the broker.`,
      }),
    },
    {
      label: 'comp in the cross-family risk line',
      input: base({
        crossFamilyRecommended: true,
        headlineRiskLine: `Headline risk. Comp ${SENTINEL} bps to the broker.`,
      }),
    },
  ]

  for (const shape of SHAPES) {
    it(`omits compensation for: ${shape.label}`, async () => {
      const { text } = await extractPdfText(await generateSavingsPdf(shape.input))
      expect(text).toContain('FOX MORTGAGE') // non-vacuous
      expect(text).not.toContain(String(SENTINEL))
      expect(text.toLowerCase()).not.toContain('bps')
      expect(text).not.toContain('Compensation')
      expect(text.toLowerCase()).not.toContain('finder fee')
    })
  }

  it('names the file by date only, never client data', () => {
    expect(savingsPdfFilename('2026-07-13')).toBe('savings-analysis-2026-07-13.pdf')
  })
})
