// The pre-approval letter (B8b Task 3). A deterministic PDF Michael MINTS for a
// purchase file: fixed template, his identification block, the FSRA line,
// validity tied to the rate-hold he entered. Built through the same pdf-lib +
// ascii-safe habits as the rates and savings PDFs (lib/rates-pdf.ts).
//
// REPRODUCIBLE FROM THE SNAPSHOT ALONE. The generator reads nothing live — only
// the frozen LetterSnapshot — so the byte content is a pure function of what
// Michael typed at mint time. The client downloads exactly what was minted, and
// a re-generation months later produces the same document. There is no
// client-triggered generation anywhere: the client route reads the frozen
// snapshot and renders it, it never composes terms.
//
// COPY IS A DRAFT for Michael's word-level sign-off (docs/presentation-b8b).
// Every sentence below is his to edit; the structure is fixed.

import { PDFDocument, PDFFont, StandardFonts, rgb } from 'pdf-lib'
import { CONTACT } from '@/lib/contact'
import { wrap, pdfSafe } from '@/lib/rates-pdf'
import { fmtMoneyFull } from '@/lib/scenario'
import type { LetterSnapshot } from '@/lib/client-presentation'

const NAVY = rgb(3 / 255, 33 / 255, 51 / 255)
const LIME = rgb(149 / 255, 214 / 255, 0)
const GRAY = rgb(0.42, 0.42, 0.42)
const LIGHT = rgb(0.94, 0.96, 0.97)

export function preapprovalPdfFilename(fileRef: string | null): string {
  return fileRef ? `preapproval-${fileRef}.pdf` : 'preapproval-letter.pdf'
}

function longDate(ymdOrIso: string): string {
  const d = new Date(ymdOrIso.length <= 10 ? `${ymdOrIso}T00:00:00` : ymdOrIso)
  if (Number.isNaN(d.getTime())) return ymdOrIso
  return d.toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })
}

export async function generatePreapprovalPdf(snapshot: LetterSnapshot): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle('Mortgage pre-approval')
  doc.setProducer('Fox Mortgage portal')
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const M = 54
  const PAGE_W = 612
  const PAGE_H = 792
  const width = PAGE_W - M * 2
  const page = doc.addPage([PAGE_W, PAGE_H])
  let y = PAGE_H

  // Header band.
  page.drawRectangle({ x: 0, y: PAGE_H - 78, width: PAGE_W, height: 78, color: NAVY })
  page.drawRectangle({ x: 0, y: PAGE_H - 82, width: PAGE_W, height: 4, color: LIME })
  page.drawText('FOX MORTGAGE', { x: M, y: PAGE_H - 36, size: 18, font: bold, color: rgb(1, 1, 1) })
  page.drawText('Mortgage pre-approval', { x: M, y: PAGE_H - 58, size: 12, font, color: LIME })
  y = PAGE_H - 112

  const text = (s: string, opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; x?: number } = {}) => {
    page.drawText(pdfSafe(s), {
      x: opts.x ?? M,
      y,
      size: opts.size ?? 10,
      font: opts.font ?? font,
      color: opts.color ?? NAVY,
    })
  }
  const para = (s: string, size = 10, color = NAVY, leading = 14) => {
    for (const line of wrap(pdfSafe(s), font, size, width)) {
      text(line, { size, color })
      y -= leading
    }
  }

  // Date + file line.
  text(`Prepared ${longDate(snapshot.mintedAt)}`, { size: 9, color: GRAY })
  y -= 13
  if (snapshot.fileRef) {
    text(`File ${snapshot.fileRef}`, { size: 9, color: GRAY })
    y -= 13
  }
  y -= 10

  // Salutation.
  text(snapshot.clientFirstName ? `Dear ${snapshot.clientFirstName},` : 'Dear Client,', { size: 11, font: bold })
  y -= 22

  para(
    'This letter confirms that, based on the information reviewed so far, you are pre-approved for a mortgage ' +
      'toward a home purchase, on the terms set out below.',
    10,
    NAVY,
    15,
  )
  y -= 8

  // Terms block.
  const rows: [string, string][] = [
    ['Maximum purchase price', fmtMoneyFull(snapshot.inputs.maxPurchasePrice)],
    ['Rate', `${snapshot.inputs.ratePct.toFixed(2)}%`],
    ['Rate held until', longDate(snapshot.inputs.rateHoldExpiry)],
    ['Conditions', snapshot.inputs.conditions],
  ]
  const boxTop = y
  let boxY = y - 12
  for (const [label, value] of rows) {
    const valueLines = wrap(pdfSafe(value), font, 10, width - 200)
    page.drawText(pdfSafe(label), { x: M + 14, y: boxY, size: 9, font: bold, color: GRAY })
    let vy = boxY
    for (const line of valueLines) {
      page.drawText(line, { x: M + 190, y: vy, size: 10, font, color: NAVY })
      vy -= 13
    }
    boxY = Math.min(boxY - 22, vy - 9)
  }
  const boxBottom = boxY + 6
  page.drawRectangle({
    x: M,
    y: boxBottom,
    width,
    height: boxTop - boxBottom,
    borderColor: LIGHT,
    borderWidth: 1,
    color: rgb(0.985, 0.99, 0.995),
  })
  // Redraw the rows on top of the box fill.
  boxY = boxTop - 12
  for (const [label, value] of rows) {
    const valueLines = wrap(pdfSafe(value), font, 10, width - 200)
    page.drawText(pdfSafe(label), { x: M + 14, y: boxY, size: 9, font: bold, color: GRAY })
    let vy = boxY
    for (const line of valueLines) {
      page.drawText(line, { x: M + 190, y: vy, size: 10, font, color: NAVY })
      vy -= 13
    }
    boxY = Math.min(boxY - 22, vy - 9)
  }
  y = boxBottom - 22

  para(
    'A pre-approval is not a final commitment to lend. It is subject to a satisfactory property, updated ' +
      'documents, and full lender approval at the time you make an offer. The rate above is held until the ' +
      'date shown. After that date it may change.',
    9.5,
    GRAY,
    13,
  )
  y -= 10
  para('Please reach out with any questions. I am glad to walk through what this means for your search.', 10, NAVY, 14)
  y -= 20

  // Signature + identification block.
  text('Michael Fox', { size: 11, font: bold })
  y -= 14
  text('Mortgage Agent, Level 2, BRX Mortgage, FSRA 13463', { size: 9, color: GRAY })
  y -= 13
  text(`${CONTACT.phone.display}   |   ${CONTACT.email.address}   |   foxmortgage.ca`, { size: 9, color: GRAY })

  // Validity footnote at the foot of the page.
  page.drawText(
    pdfSafe(`This pre-approval is valid until ${longDate(snapshot.inputs.rateHoldExpiry)}.`),
    { x: M, y: 56, size: 8.5, font, color: GRAY },
  )

  return doc.save()
}
