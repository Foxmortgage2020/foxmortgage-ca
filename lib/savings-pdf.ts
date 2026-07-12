// Client-ready savings-analysis PDF for a monitored mortgage (the Strategic
// Mortgage Monitoring "Opportunities" engine). Pure generator: Fox's analysis
// in, PDF bytes out, so the route stays a thin authenticated shell and the
// generator is testable without auth. Built with pdf-lib, sharing the rates
// PDF's brand chrome, ascii-safe path (pdfSafe), and — the load-bearing one —
// the SAME compensation scrubber (redactComp). Copy is grade 6 on purpose:
// this document goes to a homeowner.
//
// Honesty rules baked in, matching the on-screen card:
//  - Every comparable rate carries the sheet date it came from.
//  - The penalty is framed, not asserted, when the lender's IRD methodology
//    is not documented (three months' interest is named as the floor).
//  - When breaking early costs more than it saves over the remaining term,
//    the recommendation is to WAIT for maturity — never a manufactured saving.
//  - Compensation NEVER reaches a borrower: redactComp runs over every string
//    field before it is drawn (asserted by tests/savings-pdf.test.ts).
// Download only; no send path exists near this code.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { pdfSafe, redactComp, wrap } from '@/lib/rates-pdf'

const NAVY = rgb(3 / 255, 33 / 255, 51 / 255)
const LIME = rgb(149 / 255, 214 / 255, 0)
const GRAY = rgb(0.45, 0.45, 0.45)
const GREEN = rgb(0.12, 0.5, 0.2)

export interface SavingsPdfComparable {
  rate: number
  lender: string
  /** Sheet date, YYYY-MM-DD; null when undated. */
  asOf: string | null
}

export interface SavingsPdfInput {
  /** Toronto date the PDF is generated, YYYY-MM-DD. */
  generatedDate: string
  /** The homeowner's name — this document goes TO them, so their name is on it.
   *  Scrubbed before drawing all the same (defense in depth). */
  clientName: string
  /** Current position. */
  currentRate: number | null
  currentRateType: string | null
  currentLender: string
  balance: number | null
  maturity: string | null
  /** Fox's best gate-approved comparable, or null when none could be priced. */
  comparable: SavingsPdfComparable | null
  currentPayment: number | null
  newPayment: number | null
  monthlySaving: number | null
  /** Penalty figures (three months' interest floor + framing text). */
  penaltyThreeMonthsInterest: number | null
  penaltyFraming: string | null
  penaltyMethodologyKnown: boolean
  breakEvenMonths: number | null
  netBenefit: number | null
  remainingMonths: number | null
  /** The months the net benefit was projected over (remaining term for a break;
   * the new term for a switch). Drives the act-now copy so the horizon it names
   * matches the math. */
  horizonMonths?: number | null
  /** 'act_now' | 'marginal' | 'stay_put' | 'insufficient' */
  bucket: string
  /** True when a comparable exists but its lender's provincial availability is
   * not yet confirmed, so it is withheld from this client document (fail-closed).
   * The PDF prints the honest "confirming availability" state. */
  provincePending?: boolean
  /** 'refinance' | 'switch' | null — drives the requalification line. */
  transaction?: 'refinance' | 'switch' | null
  /** True when this is a refinance and requalification at the stress test applies. */
  requalification?: boolean
  /** Optional free-text note; scrubbed before drawing. */
  note?: string | null
}

export function savingsPdfFilename(generatedDate: string): string {
  // No client PII in the filename — only the date, matching the rates PDF.
  return `savings-analysis-${generatedDate}.pdf`
}

const money = (n: number | null | undefined) =>
  n == null ? 'not on file' : '$' + Math.round(n).toLocaleString('en-CA')
const money2 = (n: number | null | undefined) =>
  n == null ? 'not on file' : '$' + n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function longDate(ymd: string | null): string {
  if (!ymd) return 'not on file'
  const m = ymd.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return 'not on file'
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('en-CA', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export async function generateSavingsPdf(input: SavingsPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle('Your mortgage savings analysis')
  doc.setProducer('Fox Mortgage portal')
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const M = 46
  const PAGE_W = 612
  const PAGE_H = 792
  const FOOTER_TOP = 84
  const width = PAGE_W - M * 2

  let page = doc.addPage([PAGE_W, PAGE_H])
  let y = PAGE_H

  page.drawRectangle({ x: 0, y: PAGE_H - 74, width: PAGE_W, height: 74, color: NAVY })
  page.drawRectangle({ x: 0, y: PAGE_H - 78, width: PAGE_W, height: 4, color: LIME })
  page.drawText('FOX MORTGAGE', { x: M, y: PAGE_H - 34, size: 17, font: bold, color: rgb(1, 1, 1) })
  page.drawText('Your mortgage savings analysis', { x: M, y: PAGE_H - 56, size: 12, font, color: LIME })
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
    opts: { size?: number; font?: typeof font; color?: ReturnType<typeof rgb>; x?: number } = {},
  ) => {
    page.drawText(pdfSafe(s), {
      x: opts.x ?? M,
      y,
      size: opts.size ?? 10,
      font: opts.font ?? font,
      color: opts.color ?? NAVY,
    })
  }
  const para = (s: string, size = 9.5, color = GRAY, leading = 13) => {
    for (const line of wrap(pdfSafe(s), font, size, width)) {
      ensure(leading)
      text(line, { size, color })
      y -= leading
    }
  }
  const heading = (s: string) => {
    ensure(40)
    text(s, { size: 12, font: bold })
    y -= 16
  }

  text(`Prepared ${longDate(input.generatedDate)} for ${redactComp(input.clientName)}`, { size: 9, color: GRAY })
  y -= 18

  // ── Current mortgage ──
  heading('Your mortgage today')
  para(
    `You are with ${redactComp(input.currentLender)} at ` +
      `${input.currentRate != null ? `${input.currentRate}%` : 'a rate we do not have on file'}` +
      `${input.currentRateType ? ` (${redactComp(input.currentRateType)})` : ''}.`,
    10,
    NAVY,
    14,
  )
  para(
    `Balance ${money(input.balance)}. Your term matures ${longDate(input.maturity)}.`,
    9.5,
    GRAY,
    13,
  )
  if (input.currentPayment != null) {
    para(`At today's rate your payment is about ${money2(input.currentPayment)} a month.`, 9.5, GRAY, 13)
  }
  y -= 8

  // ── Availability being confirmed: a comparable exists but its lender's
  // provincial availability is not confirmed, so it is withheld here. ──
  if (input.provincePending) {
    heading('What we found')
    para(
      'We are confirming which lenders can lend in your province before we put a specific rate in ' +
        'writing. Michael will follow up with the confirmed options shortly. Nothing here is a ' +
        'commitment, and we never quote a rate a lender cannot actually offer you.',
      9.5,
      GRAY,
      13,
    )
    drawFooter(doc, font, bold, M, width)
    return doc.save()
  }

  // ── Insufficient data: say so plainly and stop. ──
  if (input.bucket === 'insufficient' || input.comparable == null) {
    heading('What we found')
    para(
      "We could not run a full comparison from the monitored data. This usually means a figure " +
        'is missing or the rate on file needs confirming. Michael will confirm the details with ' +
        'you and the lender before recommending anything.',
      9.5,
      GRAY,
      13,
    )
    drawFooter(doc, font, bold, M, width)
    return doc.save()
  }

  const c = input.comparable
  // ── What we found ──
  heading('What we found')
  para(
    `The best rate we can approve today is ${c.rate}% from ${redactComp(c.lender)}, ` +
      `from their rate sheet dated ${longDate(c.asOf)}.`,
    10,
    NAVY,
    14,
  )
  if (input.newPayment != null) {
    para(`At that rate your payment would be about ${money2(input.newPayment)} a month.`, 9.5, GRAY, 13)
  }
  if (input.monthlySaving != null && input.monthlySaving > 0) {
    ensure(16)
    text(`That is about ${money2(input.monthlySaving)} less every month.`, { size: 10.5, font: bold, color: GREEN })
    y -= 16
  } else {
    para('Today\'s comparison does not lower your monthly payment.', 9.5, GRAY, 13)
  }
  // Refinance requalification, stated plainly (Part 1c): a savings promise that
  // ignores qualification is a promise that cannot be kept.
  if (input.requalification) {
    para(
      'Because this would mean breaking and refinancing your mortgage, you would need to requalify ' +
        'at the government stress test. This comparison assumes you qualify; Michael will confirm ' +
        'that with you before anything moves.',
      9.5,
      GRAY,
      13,
    )
  }
  y -= 6

  // ── What breaking early would cost ──
  heading('What breaking your mortgage early would cost')
  if (input.penaltyFraming) {
    para(redactComp(input.penaltyFraming), 9.5, GRAY, 13)
  }
  if (input.penaltyThreeMonthsInterest != null) {
    para(
      `Three months of interest on your balance is about ${money(input.penaltyThreeMonthsInterest)}.` +
        (input.penaltyMethodologyKnown
          ? ''
          : " We do not have this lender's exact penalty rule on file, so we treat that as the floor and confirm the real figure with the lender."),
      9.5,
      GRAY,
      13,
    )
  }
  if (input.breakEvenMonths != null) {
    para(
      `At the saving above, the switch pays for itself in about ${Math.ceil(input.breakEvenMonths)} months.`,
      9.5,
      GRAY,
      13,
    )
  }
  y -= 6

  // ── Recommendation — honest about waiting ──
  heading('What we would do')
  const netPositive = (input.netBenefit ?? 0) > 0
  const horizon = input.horizonMonths ?? input.remainingMonths
  if (netPositive && input.bucket === 'act_now') {
    // A break (refinance) names the cost of breaking early over the months left;
    // a switch at maturity has no break cost and looks over the new term.
    const lead =
      input.transaction === 'switch'
        ? `Moving at your renewal looks worth about ${money(input.netBenefit)}` +
          (horizon != null ? ` over your next ${Math.round(horizon / 12)}-year term` : '')
        : `Even after the cost of breaking early, switching now looks worth about ${money(input.netBenefit)}` +
          (horizon != null ? ` over the ${horizon} months left on your term` : '')
    para(`${lead}. It is worth a conversation. Michael will confirm the numbers with the lender before you decide.`, 10, NAVY, 14)
  } else if (input.bucket === 'marginal') {
    para(
      'The savings and the cost of breaking early are close to even right now. There is no clear ' +
        'win in moving today, so we keep watching your file and revisit as your maturity date gets ' +
        'closer or as rates move.',
      10,
      NAVY,
      14,
    )
  } else {
    // stay_put / net negative — WAIT FOR MATURITY framing.
    para(
      'Breaking your mortgage early would cost more than it saves right now, so the smart move is ' +
        `to wait. We will be ready to line up a better rate as your term matures on ${longDate(input.maturity)}, ` +
        'when there is no penalty to pay. Staying put today is the right call.',
      10,
      NAVY,
      14,
    )
  }
  if (input.note) {
    y -= 4
    para(redactComp(input.note), 9, GRAY, 12)
  }
  y -= 8

  // ── Disclaimer ──
  heading('Please read this part')
  para(
    'These figures are estimates. They use the rate the lender showed on the date listed above. ' +
      'Rates can change at any time, and floating rates move when prime moves. This page is not a ' +
      'promise to lend and it is not an approval. Your real payment depends on the final lender terms ' +
      'and on underwriting, which begins when you apply. Michael reviews everything with you before ' +
      'anything is final.',
    9.5,
    GRAY,
    13,
  )

  drawFooter(doc, font, bold, M, width)
  return doc.save()
}

function drawFooter(
  doc: PDFDocument,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  bold: Awaited<ReturnType<PDFDocument['embedFont']>>,
  M: number,
  width: number,
) {
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
}
