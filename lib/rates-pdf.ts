// Client-ready rate comparison PDF (Session 5; floating vocabulary
// Session 6). Pure generator: scenario plus the pinned quote rows in, PDF
// bytes out, so the route stays a thin authenticated shell and the
// generator is testable without auth. Built with pdf-lib (server-side, no
// headless browser on the serverless runtime; standard Helvetica with the
// brand navy and lime, recorded in CLAUDE.md). Copy is grade 6 on
// purpose: this document goes to clients.
//
// Floating honesty: fixed rows print their rate; adjustable and variable
// rows lead with the printed discount and the effective rate is computed
// against the served prime and labeled with the prime as-of it used.
// When the prime reference was unavailable at generation time the
// discount prints alone and says so; no stale or guessed figure ever
// lands in a client document. Mechanism lines come from the reference
// payload, never the sheet label. Cash back tiers footnote their printed
// conditions verbatim. Download only; no send path exists near this code.

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib'
import {
  RATE_TYPE_LABEL,
  conventionText,
  fmtDiscount,
  fmtMoneyFull,
  mechanismForLender,
  mechanismPending,
  productClassLabel,
  quoteEffectiveRate,
  quoteRateDisplay,
  scenarioMonthlyPayment,
  summaryLine,
  termLabel,
  type RatesReference,
  type Scenario,
} from '@/lib/scenario'
import type { RateQuoteFullRow } from '@/lib/underwriting'

const NAVY = rgb(3 / 255, 33 / 255, 51 / 255)
const LIME = rgb(149 / 255, 214 / 255, 0)
const GRAY = rgb(0.45, 0.45, 0.45)
const LIGHT = rgb(0.92, 0.94, 0.95)

export interface PdfLenderInfo {
  /** Display name when a knowledge page matches the quote slug. */
  name: string | null
  /** Knowledge profile as-of date, for the penalty line. */
  asOf: string | null
}

export interface RatesPdfInput {
  scenario: Scenario
  quotes: RateQuoteFullRow[]
  /** quote lender_slug -> knowledge info (null entry = no page yet). */
  lenderInfo: Record<string, PdfLenderInfo | null>
  /** The served rates-reference, or null when it was unreachable at
   * generation time (the PDF then states prime unavailable, honestly). */
  reference: RatesReference | null
  /** Toronto date the PDF is generated, YYYY-MM-DD. */
  generatedDate: string
  /** Optional source file ref; may appear in the body, never the filename. */
  sourceFileRef?: string | null
}

export function ratesPdfFilename(generatedDate: string): string {
  return `rates-comparison-${generatedDate}.pdf`
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = []
  for (const rawLine of text.split('\n')) {
    const words = rawLine.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      out.push('')
      continue
    }
    let line = ''
    for (const w of words) {
      const probe = line ? `${line} ${w}` : w
      if (font.widthOfTextAtSize(probe, size) <= maxWidth) line = probe
      else {
        if (line) out.push(line)
        line = w
      }
    }
    if (line) out.push(line)
  }
  return out
}

// Helvetica has no U+2212; the client PDF prints the ASCII form.
function pdfSafe(s: string): string {
  return s.replace(/−/g, '-').replace(/·/g, '-')
}

// Compensation is a regulated disclosure and NEVER goes to a borrower. The
// structured comp field is already omitted from this document; this scrubs any
// compensation / finder-fee / basis-point figure that rode along inside a
// verbatim extracted field (program notes) before it is drawn. Asserted by
// tests/rates-pdf.test.ts against these very fields.
function redactComp(s: string): string {
  return s
    .replace(/\bfinder'?s?\s*fees?\b[^.\n]*/gi, '[removed]')
    .replace(/\bcompensation\b[^.\n]*/gi, '[removed]')
    .replace(/\bcomp\b\s*[:=]?\s*\d[^.\n]*/gi, '[removed]')
    .replace(/\b\d+(?:\.\d+)?\s*bps\b/gi, '[removed]')
}

export async function generateRatesPdf(input: RatesPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle('Rate comparison')
  doc.setProducer('Fox Mortgage portal')
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const M = 46
  const PAGE_W = 612
  const PAGE_H = 792
  const FOOTER_TOP = 84
  const width = PAGE_W - M * 2

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H])
  let y = PAGE_H

  // Header band on page 1 only; continuation pages start plain.
  page.drawRectangle({ x: 0, y: PAGE_H - 74, width: PAGE_W, height: 74, color: NAVY })
  page.drawRectangle({ x: 0, y: PAGE_H - 78, width: PAGE_W, height: 4, color: LIME })
  page.drawText('FOX MORTGAGE', { x: M, y: PAGE_H - 34, size: 17, font: bold, color: rgb(1, 1, 1) })
  page.drawText('Rate comparison', { x: M, y: PAGE_H - 56, size: 12, font, color: LIME })
  y = PAGE_H - 100

  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H])
    y = PAGE_H - 60
  }
  const ensure = (space: number) => {
    if (y - space < FOOTER_TOP) newPage()
  }

  const text = (
    s: string,
    opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; x?: number } = {},
  ) => {
    page.drawText(pdfSafe(s), {
      x: opts.x ?? M,
      y,
      size: opts.size ?? 10,
      font: opts.font ?? font,
      color: opts.color ?? NAVY,
    })
  }

  const para = (s: string, size = 9, color = GRAY, leading = 12) => {
    for (const line of wrap(pdfSafe(s), font, size, width)) {
      ensure(leading)
      text(line, { size, color })
      y -= leading
    }
  }

  text(`Prepared ${input.generatedDate}`, { size: 9, color: GRAY })
  y -= 14
  if (input.sourceFileRef) {
    text(`For file ${input.sourceFileRef}`, { size: 9, color: GRAY })
    y -= 14
  }
  y -= 4

  // Scenario summary: the PDF is self-describing.
  text('The scenario we compared', { size: 12, font: bold })
  y -= 16
  para(summaryLine(input.scenario), 10, NAVY, 13)
  if (input.scenario.amount) {
    para(
      `Mortgage amount ${fmtMoneyFull(input.scenario.amount)}` +
        (input.scenario.propertyValue ? `, property value ${fmtMoneyFull(input.scenario.propertyValue)}` : '') +
        `, paid monthly over ${input.scenario.amortizationYears} years.`,
      9,
      GRAY,
      12,
    )
  }
  const prime = input.reference?.prime
  if (prime) {
    para(
      `Floating rates below show their discount from prime. Prime was ${prime.value.toFixed(2)}% on ${prime.as_of} when this page was made.`,
      9,
      GRAY,
      12,
    )
  }
  y -= 10

  // Comparison table
  const cols = input.quotes.slice(0, 3)
  const labelW = 118
  const colW = (width - labelW) / Math.max(cols.length, 1)
  const nameFor = (q: RateQuoteFullRow) => input.lenderInfo[q.lenderSlug]?.name ?? q.lenderSlug

  const rateCell = (q: RateQuoteFullRow): string => {
    const d = quoteRateDisplay(q, input.reference)
    switch (d.kind) {
      case 'fixed':
        return `${d.rate.toFixed(2)}%`
      case 'floating-printed':
        return `${d.discount !== null ? `${fmtDiscount(d.discount)} = ` : ''}${d.rate.toFixed(2)}% (printed on the sheet)`
      case 'floating-computed':
        return `${fmtDiscount(d.discount)} = ${d.effective.toFixed(2)}% today (prime ${d.primeValue.toFixed(2)}%, ${d.primeAsOf}${d.overridden ? ', lender prime' : ''})`
      case 'floating-no-prime':
        return `${fmtDiscount(d.discount)} (prime was unavailable when this page was made)`
      case 'unpriced':
        return 'not priced'
    }
  }

  const anyCashback = cols.some(q => q.cashbackPct !== null)
  const rows: [string, (q: RateQuoteFullRow) => string][] = [
    ['Rate', rateCell],
    ['Rate type', q => RATE_TYPE_LABEL[q.rateType]],
    ['Term', q => termLabel(q.termMonths)],
    [
      'Product',
      q => `${productClassLabel(q.productClass)}${q.variant ? `, ${q.variant.replace(/-/g, ' ')}` : ''}`,
    ],
    ...(anyCashback
      ? ([
          [
            'Cash back',
            (q: RateQuoteFullRow) =>
              q.cashbackPct !== null ? `${q.cashbackPct}% (see the notes below)` : 'none',
          ],
        ] as [string, (q: RateQuoteFullRow) => string][])
      : []),
    [
      'Monthly payment',
      q => {
        const eff = quoteEffectiveRate(q, input.reference)
        if (eff === null) return 'needs prime, unavailable today'
        const p = scenarioMonthlyPayment(input.scenario, eff)
        return p === null ? 'needs an amount' : fmtMoneyFull(p)
      },
    ],
    ['Rate sheet date', q => q.asOfDate ?? 'undated'],
  ]

  // Column headers
  ensure(40)
  const headerY = y
  page.drawRectangle({ x: M, y: headerY - 16, width, height: 30, color: LIGHT })
  cols.forEach((q, i) => {
    const x = M + labelW + i * colW
    for (const line of wrap(pdfSafe(nameFor(q)), bold, 9, colW - 8).slice(0, 2)) {
      page.drawText(line, { x, y, size: 9, font: bold, color: NAVY })
      y -= 10
    }
    y = headerY
  })
  y = headerY - 24

  for (const [label, fn] of rows) {
    ensure(40)
    text(label, { size: 8, color: GRAY })
    let rowDrop = 12
    cols.forEach((q, i) => {
      const x = M + labelW + i * colW
      const lines = wrap(pdfSafe(fn(q)), font, 9.5, colW - 8).slice(0, 4)
      lines.forEach((line, j) => {
        page.drawText(line, { x, y: y - j * 11, size: 9.5, font: label === 'Rate' ? bold : font, color: NAVY })
      })
      rowDrop = Math.max(rowDrop, lines.length * 11 + 5)
    })
    y -= rowDrop
    page.drawLine({ start: { x: M, y: y + 2 }, end: { x: M + width, y: y + 2 }, thickness: 0.5, color: LIGHT })
    y -= 6
  }
  y -= 8

  // Mechanism lines for floating products: the client conversation, in
  // plain words, from the reference payload only.
  const floating = cols.filter(q => q.rateType !== 'fixed')
  if (floating.length > 0) {
    ensure(40)
    text('How the floating rates work', { size: 12, font: bold })
    y -= 16
    const seen = new Set<string>()
    for (const q of floating) {
      const k = `${q.lenderSlug}:${q.rateType}`
      if (seen.has(k)) continue
      seen.add(k)
      const note = mechanismForLender(input.reference, q.lenderSlug)
      const body =
        note?.note ??
        conventionText(input.reference, q.rateType as 'adjustable' | 'variable') ??
        'The prime reference was unavailable, so the mechanism note could not load. Michael explains how this rate moves before anything is final.'
      const pending = mechanismPending(note)
      para(
        `${nameFor(q)} (${RATE_TYPE_LABEL[q.rateType].toLowerCase()}): ${body}${
          pending ? ' The lender has not confirmed this behaviour in writing yet; Michael verifies it before anything is final.' : ''
        }`,
        9,
        GRAY,
        12,
      )
      y -= 3
    }
    y -= 8
  }

  // Cash back program conditions, verbatim from the sheet.
  const cashbacks = cols.filter(q => q.cashbackPct !== null && q.programNotes)
  const otherNotes = cols.filter(q => q.cashbackPct === null && q.programNotes)
  if (cashbacks.length > 0 || otherNotes.length > 0) {
    ensure(40)
    text('Printed program conditions', { size: 12, font: bold })
    y -= 16
    for (const q of [...cashbacks, ...otherNotes]) {
      para(
        `${nameFor(q)}${q.cashbackPct !== null ? ` (${q.cashbackPct}% cash back)` : ''}, exactly as the sheet prints it:`,
        9,
        NAVY,
        12,
      )
      para(redactComp(q.programNotes!), 8.5, GRAY, 11)
      y -= 5
    }
    y -= 6
  }

  // Where the rates come from: sheet date, page, and extraction
  // confidence, so the document carries its own provenance.
  ensure(40)
  text('Where these rates come from', { size: 12, font: bold })
  y -= 16
  for (const q of cols) {
    // The raw extracted snippet is deliberately NOT printed on a client
    // document: it is an unredacted sheet fragment that can carry a lender
    // compensation column. Structured provenance (date, page, confidence,
    // approval) carries the credibility without the leak vector.
    para(
      `${nameFor(q)}: rate sheet dated ${q.asOfDate ?? 'undated'}, page ${q.sourcePage} (extraction confidence ${q.confidence}). Approved by Michael through the audited review gate.`,
      8.5,
      GRAY,
      11,
    )
    y -= 3
  }
  y -= 8

  // Penalty section: honest lines with as-of dates.
  ensure(40)
  text('What breaking the mortgage early costs', { size: 12, font: bold })
  y -= 16
  const seenPenalty = new Set<string>()
  for (const q of cols) {
    if (seenPenalty.has(q.lenderSlug)) continue
    seenPenalty.add(q.lenderSlug)
    const info = input.lenderInfo[q.lenderSlug]
    const line = info?.name
      ? `${info.name}: Fox's knowledge base does not document this lender's penalty method yet` +
        (info.asOf ? ` (profile checked ${info.asOf})` : '') +
        '. Michael confirms the penalty rules with the lender before anything is final.'
      : `${q.lenderSlug}: this lender has no knowledge page yet. Michael confirms the penalty rules with the lender before anything is final.`
    para(line, 9, GRAY, 12)
    y -= 3
  }
  y -= 10

  // Plain-language disclaimer, grade 6.
  ensure(80)
  text('Please read this part', { size: 12, font: bold })
  y -= 16
  para(
    'These figures are estimates. They use the rates each lender showed on the dates listed ' +
      'above. Rates can change at any time, and floating rates move when prime moves. This page ' +
      'is not a promise to lend and it is not an approval. Your real payment depends on the ' +
      'final lender terms. Michael reviews everything with you before anything is final.',
    9.5,
    GRAY,
    13,
  )

  // Licence footer on every page.
  for (const p of doc.getPages()) {
    p.drawLine({ start: { x: M, y: 64 }, end: { x: M + width, y: 64 }, thickness: 1, color: LIME })
    p.drawText('Michael Fox, Mortgage Agent Level 2, BRX Mortgage, FSRA 13463', {
      x: M,
      y: 48,
      size: 9,
      font: bold,
      color: NAVY,
    })
    p.drawText('226-770-8880  |  mfox@foxmortgage.ca  |  foxmortgage.ca', {
      x: M,
      y: 35,
      size: 8.5,
      font,
      color: GRAY,
    })
  }

  return doc.save()
}
