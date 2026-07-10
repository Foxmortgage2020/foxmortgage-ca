// Client-ready rate comparison PDF (Session 5). Pure generator: scenario
// plus the pinned quote rows in, PDF bytes out, so the route stays a thin
// authenticated shell and the generator is testable without auth. Built
// with pdf-lib (server-side, no headless browser on the serverless
// runtime; standard Helvetica with the brand navy and lime, recorded in
// CLAUDE.md). Copy is grade 6 on purpose: this document goes to clients.
// Download only; no send path exists anywhere near this code.

import { PDFDocument, PDFFont, StandardFonts, rgb } from 'pdf-lib'
import { fmtMoneyFull, scenarioMonthlyPayment, summaryLine, termLabel, type Scenario } from '@/lib/scenario'
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
  /** Toronto date the PDF is generated, YYYY-MM-DD. */
  generatedDate: string
  /** Optional source file ref; may appear in the body, never the filename. */
  sourceFileRef?: string | null
}

export function ratesPdfFilename(generatedDate: string): string {
  return `rates-comparison-${generatedDate}.pdf`
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const probe = line ? `${line} ${w}` : w
    if (font.widthOfTextAtSize(probe, size) <= maxWidth) line = probe
    else {
      if (line) lines.push(line)
      line = w
    }
  }
  if (line) lines.push(line)
  return lines
}

export async function generateRatesPdf(input: RatesPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle('Rate comparison')
  doc.setProducer('Fox Mortgage portal')
  const page = doc.addPage([612, 792]) // US Letter
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const M = 46
  const width = page.getWidth() - M * 2
  let y = 792

  // Header band
  page.drawRectangle({ x: 0, y: 792 - 74, width: 612, height: 74, color: NAVY })
  page.drawRectangle({ x: 0, y: 792 - 78, width: 612, height: 4, color: LIME })
  page.drawText('FOX MORTGAGE', { x: M, y: 792 - 34, size: 17, font: bold, color: rgb(1, 1, 1) })
  page.drawText('Rate comparison', { x: M, y: 792 - 56, size: 12, font, color: LIME })
  y = 792 - 100

  const text = (
    s: string,
    opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; x?: number } = {},
  ) => {
    page.drawText(s, {
      x: opts.x ?? M,
      y,
      size: opts.size ?? 10,
      font: opts.font ?? font,
      color: opts.color ?? NAVY,
    })
  }

  const para = (s: string, size = 9, color = GRAY, leading = 12) => {
    for (const line of wrap(s, font, size, width)) {
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
  y -= 10

  // Comparison table
  const cols = input.quotes.slice(0, 3)
  const labelW = 118
  const colW = (width - labelW) / Math.max(cols.length, 1)
  const nameFor = (q: RateQuoteFullRow) => input.lenderInfo[q.lenderSlug]?.name ?? q.lenderSlug

  const rows: [string, (q: RateQuoteFullRow) => string][] = [
    ['Rate', q => `${q.rate.toFixed(2)}%`],
    ['Term', q => `${termLabel(q.termMonths)} fixed`],
    ['Type', q => `${q.productClass}${q.variant ? `, ${q.variant.replace(/-/g, ' ')}` : ''}`],
    [
      'Monthly payment',
      q => {
        const p = scenarioMonthlyPayment(input.scenario, q.rate)
        return p === null ? 'needs an amount' : fmtMoneyFull(p)
      },
    ],
    ['Rate sheet date', q => q.asOfDate ?? 'undated'],
  ]

  // Column headers
  const headerY = y
  page.drawRectangle({ x: M, y: headerY - 16, width, height: 30, color: LIGHT })
  cols.forEach((q, i) => {
    const x = M + labelW + i * colW
    for (const line of wrap(nameFor(q), bold, 9, colW - 8).slice(0, 2)) {
      page.drawText(line, { x, y, size: 9, font: bold, color: NAVY })
      y -= 10
    }
    y = headerY
  })
  y = headerY - 24

  for (const [label, fn] of rows) {
    text(label, { size: 8, color: GRAY })
    let rowDrop = 12
    cols.forEach((q, i) => {
      const x = M + labelW + i * colW
      const lines = wrap(fn(q), font, 9.5, colW - 8).slice(0, 2)
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

  // Penalty section: honest lines with as-of dates.
  text('What breaking the mortgage early costs', { size: 12, font: bold })
  y -= 16
  const seen = new Set<string>()
  for (const q of cols) {
    if (seen.has(q.lenderSlug)) continue
    seen.add(q.lenderSlug)
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
  text('Please read this part', { size: 12, font: bold })
  y -= 16
  para(
    'These figures are estimates. They use the rates each lender showed on the dates listed ' +
      'above. Rates can change at any time. This page is not a promise to lend and it is not an ' +
      'approval. Your real payment depends on the final lender terms. Michael reviews everything ' +
      'with you before anything is final.',
    9.5,
    GRAY,
    13,
  )
  y -= 8

  // Licence line
  page.drawLine({ start: { x: M, y: 64 }, end: { x: M + width, y: 64 }, thickness: 1, color: LIME })
  page.drawText('Michael Fox, Mortgage Agent Level 2, BRX Mortgage, FSRA 13463', {
    x: M,
    y: 48,
    size: 9,
    font: bold,
    color: NAVY,
  })
  page.drawText('226-770-8880  |  mfox@foxmortgage.ca  |  foxmortgage.ca', {
    x: M,
    y: 35,
    size: 8.5,
    font,
    color: GRAY,
  })

  return doc.save()
}
