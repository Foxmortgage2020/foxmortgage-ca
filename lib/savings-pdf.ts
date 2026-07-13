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
  /** For a COMPUTED floating rate: the printed discount and the prime it was
   * priced against, with the prime's as-of. A computed effective rate is
   * always labeled with the prime as-of used, never stated as a printed
   * sheet figure. */
  variance?: number | null
  primeUsed?: number | null
  primeAsOf?: string | null
}

/** How a rate is stated: printed rates verbatim; a computed floating rate is
 * discount-first with the effective figure labeled against the prime and its
 * as-of, never presented as if the sheet printed it. */
function pricedPhrase(c: { rate: number; variance?: number | null; primeUsed?: number | null; primeAsOf?: string | null }): string {
  if (c.variance != null && c.primeUsed != null) {
    const dir = c.variance < 0 ? 'minus' : 'plus'
    return `prime ${dir} ${Math.abs(c.variance)} (about ${c.rate}% at today's prime of ${c.primeUsed}%, as of ${longDate(c.primeAsOf ?? null)})`
  }
  return `${c.rate}%`
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
  /** 'act_now' | 'marginal' | 'stay_put' | 'insufficient' | 'review' —
   * 'review' means the monitored balance did not reconcile with the mortgage
   * schedule, so NO figure (not even the balance) is stated to the client. */
  bucket: string
  /** True when a comparable exists but its lender's provincial availability is
   * not yet confirmed, so it is withheld from this client document (fail-closed).
   * The PDF prints the honest "confirming availability" state. */
  provincePending?: boolean
  /** 'refinance' | 'switch' | null — drives the requalification line. */
  transaction?: 'refinance' | 'switch' | null
  /** True when this is a refinance and requalification at the stress test applies. */
  requalification?: boolean
  /** A clearly labelled option in a different rate family (already province-
   * confirmed by the route). Listed beside the headline, never AS the
   * recommendation unless crossFamilyRecommended is set. */
  alternative?: {
    rate: number
    rateTypeLabel: string
    lender: string
    asOf: string | null
    newPayment: number
    monthlySaving: number
    riskLine: string | null
    /** Computed-floating pricing context (see SavingsPdfComparable). */
    variance?: number | null
    primeUsed?: number | null
    primeAsOf?: string | null
  } | null
  /** Michael explicitly approved recommending a different rate family than
   * the client holds; the headline then carries its risk line. */
  crossFamilyRecommended?: boolean
  headlineRiskLine?: string | null
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

  // ── Reconciliation review: the monitored figures do not line up with the
  // mortgage schedule, so nothing is asserted — not the balance, not the rate,
  // not a payment. This branch comes FIRST so no suspect figure prints. ──
  if (input.bucket === 'review') {
    heading('What we found')
    para(
      'The figures we monitor for your mortgage do not line up with the payment schedule on file. ' +
        'That usually means a prepayment, a payment change, or a data update we have not captured yet. ' +
        'Michael will confirm the true figures with you and your lender before recommending anything, ' +
        'and nothing moves without that confirmation.',
      9.5,
      GRAY,
      13,
    )
    drawFooter(doc, font, bold, M, width)
    return doc.save()
  }

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
    `The best rate we can approve today is ${pricedPhrase(c)} from ${redactComp(c.lender)}, ` +
      `from their rate sheet dated ${longDate(c.asOf)}.`,
    10,
    NAVY,
    14,
  )
  // An approved cross-family recommendation always carries its risk line,
  // right under the rate it qualifies.
  if (input.crossFamilyRecommended && input.headlineRiskLine) {
    para(redactComp(input.headlineRiskLine), 9.5, GRAY, 13)
    para(
      'This option is a different rate type than the one you hold today. Michael reviewed that trade-off before recommending it, and it is part of the conversation.',
      9.5,
      GRAY,
      13,
    )
  }
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

  // ── The labelled alternative (never the recommendation on its own) ──
  if (input.alternative) {
    const alt = input.alternative
    const typeLabel = redactComp(alt.rateTypeLabel)
    heading('Another option we can approve')
    para(
      `${typeLabel.charAt(0).toUpperCase()}${typeLabel.slice(1)}: ${pricedPhrase(alt)} from ${redactComp(alt.lender)}, ` +
        `from their rate sheet dated ${longDate(alt.asOf)}. Your payment would be about ${money2(alt.newPayment)} a month` +
        (alt.monthlySaving > 0 ? `, about ${money2(alt.monthlySaving)} less than today` : '') +
        '.',
      9.5,
      GRAY,
      13,
    )
    if (alt.riskLine) {
      para(redactComp(alt.riskLine), 9.5, GRAY, 13)
      para(
        'It is a different rate type than you hold today, so it is listed for the conversation, not as our recommendation.',
        9.5,
        GRAY,
        13,
      )
    } else {
      para('This is the steady option, the same rate type you hold today.', 9.5, GRAY, 13)
    }
    y -= 6
  }

  // ── What breaking early would cost ──
  // A fixed-rate penalty is the GREATER of three months' interest and the
  // interest rate differential (IRD). Three months' interest is a MINIMUM,
  // and a conclusion computed on it can flip once the real penalty lands —
  // so for EVERY fixed-rate break the document states the minimum and the
  // break-even penalty, and draws NO positive net-benefit conclusion.
  // Knowing a lender's IRD METHOD never produces an IRD FIGURE (adversarial
  // review 2026-07-13: the estimate used in the math is the 3MI floor either
  // way), so the method-known case only changes HOW the real figure gets
  // confirmed, never whether a floor-based conclusion may print. A wait
  // conclusion at the floor is still safe: a larger true penalty only
  // strengthens it. Floating is unchanged (three months' interest IS the
  // penalty there), and a switch at maturity has no penalty at all. The
  // board's bucketing on the 3MI floor is unchanged; this is about what a
  // client is told in writing.
  const isFloatingClient = input.currentRateType === 'variable' || input.currentRateType === 'adjustable'
  const penaltyApplies = input.penaltyThreeMonthsInterest != null
  const fixedPenalty = penaltyApplies && !isFloatingClient
  const fixedUnknownIrd = fixedPenalty && !input.penaltyMethodologyKnown
  const horizon = input.horizonMonths ?? input.remainingMonths
  // The penalty size at which the switch stops paying: the whole benefit
  // over the horizon. Above this figure the client loses by moving.
  const breakEvenPenalty =
    input.monthlySaving != null && input.monthlySaving > 0 && horizon != null
      ? input.monthlySaving * horizon
      : null

  heading('What breaking your mortgage early would cost')
  if (input.penaltyFraming) {
    para(redactComp(input.penaltyFraming), 9.5, GRAY, 13)
  }
  if (input.penaltyThreeMonthsInterest != null) {
    para(
      fixedPenalty
        ? `Three months of interest on your balance is about ${money(input.penaltyThreeMonthsInterest)}. That is the minimum, not the final figure. The real penalty is the greater of that minimum and the interest rate differential.`
        : `Three months of interest on your balance is about ${money(input.penaltyThreeMonthsInterest)}.`,
      9.5,
      GRAY,
      13,
    )
    if (fixedUnknownIrd) {
      para(
        "We don't have this lender's exact penalty rule on file, so only your lender can state the exact figure. Michael requests it before anything moves.",
        9.5,
        GRAY,
        13,
      )
    } else if (fixedPenalty) {
      para(
        `We have ${redactComp(input.currentLender)}'s penalty method on file, so Michael can estimate the real figure with you on a call; the lender confirms the exact amount before anything moves.`,
        9.5,
        GRAY,
        13,
      )
    }
  }
  if (fixedPenalty && breakEvenPenalty != null) {
    para(
      `The number that decides it: if the penalty comes back higher than about ${money(breakEvenPenalty)}, the switch stops making sense. Below that, the saving wins.`,
      9.5,
      GRAY,
      13,
    )
  }
  // The pays-for-itself line is floor-based for a fixed break, so it is
  // suppressed there along with the conclusion.
  if (input.breakEvenMonths != null && !fixedPenalty) {
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
  if (netPositive && input.bucket === 'act_now' && fixedPenalty) {
    // NO positive conclusion on a penalty floor, method known or not: the IRD
    // could exceed the break-even and erase the gain. The direction is stated
    // as undecided until the real figure is in hand.
    const confirmPath = input.penaltyMethodologyKnown
      ? `Michael knows how ${redactComp(input.currentLender)} calculates it and will walk the estimate through with you; the lender confirms the exact amount.`
      : `Only ${redactComp(input.currentLender)} can state that figure, and Michael requests it before anything moves.`
    para(
      `The monthly saving is real, but the answer turns on your exact penalty. If the interest rate differential comes back higher than the break-even figure above, it erases the gain. ${confirmPath} Nothing is recommended until it is in hand.`,
      10,
      NAVY,
      14,
    )
  } else if (netPositive && input.bucket === 'act_now') {
    // A break (refinance) names the cost of breaking early over the months left;
    // a switch at maturity has no break cost and looks over the new term.
    const lead =
      input.transaction === 'switch'
        ? `Moving at your renewal looks worth about ${money(input.netBenefit)}` +
          (horizon != null ? ` over your next ${Math.round(horizon / 12)}-year term` : '')
        : `Even after the cost of breaking early, switching now looks worth about ${money(input.netBenefit)}` +
          (horizon != null ? ` over the ${horizon} months left on your term` : '')
    para(`${lead}. It is worth a conversation. Michael will confirm the numbers with the lender before you decide.`, 10, NAVY, 14)
  } else if (input.bucket === 'marginal' && fixedPenalty) {
    // The floor-based "close to even" claim is qualified for a fixed break:
    // the real penalty can only be the minimum or more, so the true position
    // can only be worse. The don't-move advice is stated on that basis.
    para(
      "Counting only the minimum penalty, the numbers are close to even. A fixed rate's real penalty " +
        'can only be that minimum or more, so moving today does not clear the bar. We keep watching ' +
        'your file and revisit as your maturity date gets closer or as rates move.',
      10,
      NAVY,
      14,
    )
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
