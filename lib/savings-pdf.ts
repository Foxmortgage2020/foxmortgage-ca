// The client savings report, rebuilt (Part 2, 2026-07-13): three composed
// US-letter pages in pdf-lib — the choice (option cards, rate strip,
// amortization bars), the side-by-side table with the penalty stated
// honestly, and the next steps. Pure generator: analyzeMortgage output in,
// PDF bytes out; savingsPdfInputFromAnalysis is the ONE mapper both the route
// and the golden tests use, so the document and the log can never drift. No
// arithmetic happens in this file beyond formatting — every figure arrives
// derived (and logged) from lib/smm.
//
// FONTS: the design calls for Archivo + Fraunces embedded via
// @pdf-lib/fontkit. No OFL TTFs are vendored in this repo and fetching
// binaries is outside this session's bounds, so this is the brief's
// sanctioned v1 fallback: Helvetica for text, Times Bold as the serif
// display face. Vendor the TTFs and swap the two embed lines to upgrade.
//
// Honesty rules baked in (Task 5 + Task 0b, do not soften):
//  - A fixed-rate break gets NO net-benefit conclusion, method known or not.
//    The three-month figure is stated as a MINIMUM, the break-even penalty is
//    stated, and page 3 frames outcomes conditionally only.
//  - Floating keeps its conclusion (three months of interest IS the penalty);
//    a switch at maturity has no penalty and keeps its conclusion.
//  - Every rate carries its term (Task 0b) and its sheet date. The
//    comparable's LENDER NAME never prints — it is shared on the call.
//  - Blocked files (review / tier / insufficient / province-pending) render
//    the honest state and NO figures.
//  - redactComp runs over every string field (tests/savings-pdf.test.ts).
// Download only; no send path exists near this code.

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib'
import { pdfSafe, redactComp, wrap } from '@/lib/rates-pdf'
import { comparableTermLabel, type FoxAnalysis } from '@/lib/smm'
import { PRIME_MIRROR } from '@/config/prime'

const NAVY = rgb(3 / 255, 33 / 255, 51 / 255)
const LIME = rgb(149 / 255, 214 / 255, 0)
const GRAY = rgb(0.45, 0.45, 0.45)
const LIGHT = rgb(0.88, 0.9, 0.91)
const PAPER = rgb(0.965, 0.97, 0.972)
const GREEN = rgb(0.12, 0.5, 0.2)
const RED = rgb(0.75, 0.2, 0.16)
const WHITE = rgb(1, 1, 1)

export interface SavingsPdfComparable {
  rate: number
  /** The rate's term — a rate never renders without its term (Task 0b). */
  termMonths: number
  /** Kept for the log and the desk; NEVER drawn on this document. The
   * lender's name is shared on the call. */
  lender: string
  /** Sheet date, YYYY-MM-DD; null when undated (desk rates). */
  asOf: string | null
  rateTypeLabel: string // 'fixed' | 'adjustable' | 'variable'
  /** Computed-floating pricing context: the printed discount and the prime it
   * was priced against, labeled with the prime's as-of. */
  variance?: number | null
  primeUsed?: number | null
  primeAsOf?: string | null
}

export interface SavingsPdfInput {
  generatedDate: string
  clientName: string
  // Current position.
  currentRate: number | null
  currentRateType: string | null
  currentLender: string
  balance: number | null
  maturity: string | null
  currentPayment: number | null
  // The comparison (null when withheld or none eligible).
  comparable: SavingsPdfComparable | null
  productClass: string | null
  transaction?: 'refinance' | 'switch' | null
  requalification?: boolean
  newPayment: number | null
  monthlySaving: number | null
  remainingMonths: number | null
  remainingAmortizationMonths?: number | null
  horizonMonths?: number | null
  samePaymentPlan?: { months: number; monthsSooner: number; paymentsAvoided: number } | null
  comparison?: {
    horizonMonths: number
    today: { payment: number; balanceAtHorizon: number; interestPaid: number }
    option1: { payment: number; balanceAtHorizon: number; interestPaid: number }
    option2: { payment: number; balanceAtHorizon: number; interestPaid: number } | null
  } | null
  // Penalty (three months' interest floor + framing).
  penaltyThreeMonthsInterest: number | null
  penaltyFraming: string | null
  penaltyMethodologyKnown: boolean
  breakEvenMonths: number | null
  netBenefit: number | null
  bucket: string
  provincePending?: boolean
  // Approved escalations only — an unapproved alternative never prints here.
  crossFamilyRecommended?: boolean
  headlineRiskLine?: string | null
  approvalNote?: string | null
  shortTermNote?: string | null
  overrideType?: 'book_quote' | 'desk_rate' | null
  overrideSourceNote?: string | null
  note?: string | null
}

/** THE mapper from the shared analysis to the document input — used by the
 * route and by the golden tests, so the two can never drift. The province
 * gate is resolved by the caller (`showComparable`); everything else comes
 * off the analysis. */
export function savingsPdfInputFromAnalysis(args: {
  generatedDate: string
  clientName: string
  currentRate: number | null
  currentRateType: string | null
  currentLender: string
  balance: number | null
  maturity: string | null
  analysis: FoxAnalysis
  showComparable: boolean
}): SavingsPdfInput {
  const a = args.analysis
  const show = args.showComparable && a.comparable != null
  const pricing = (c: { variance?: number | null; primeUsed?: number | null }) =>
    c.primeUsed != null ? { variance: c.variance ?? null, primeUsed: c.primeUsed, primeAsOf: PRIME_MIRROR.asOf } : {}
  return {
    generatedDate: args.generatedDate,
    clientName: args.clientName,
    currentRate: args.currentRate,
    currentRateType: args.currentRateType,
    currentLender: args.currentLender,
    balance: args.balance,
    maturity: args.maturity,
    currentPayment: a.currentPayment,
    comparable: show
      ? {
          rate: a.comparable!.rate,
          termMonths: a.comparable!.termMonths,
          lender: a.comparable!.lender,
          asOf: a.comparable!.asOf,
          rateTypeLabel: a.comparable!.rateType ?? (a.comparable!.kind === 'floating' ? 'floating' : 'fixed'),
          ...pricing(a.comparable!),
        }
      : null,
    productClass: a.productClass,
    transaction: a.transaction,
    requalification: a.requalification,
    newPayment: show ? a.newPayment : null,
    monthlySaving: show ? a.monthlySaving : null,
    remainingMonths: a.remainingMonths,
    remainingAmortizationMonths: a.remainingAmortizationMonths,
    horizonMonths: a.horizonMonths,
    samePaymentPlan: show ? a.samePaymentPlan : null,
    comparison: show ? a.comparison : null,
    penaltyThreeMonthsInterest: a.penalty?.threeMonthsInterest ?? null,
    penaltyFraming: a.penalty?.framing ?? null,
    penaltyMethodologyKnown: a.penalty?.methodologyKnown ?? false,
    breakEvenMonths: show ? a.breakEvenMonths : null,
    netBenefit: show ? a.netBenefit : null,
    bucket: a.bucket === 'review' ? 'review' : show ? a.bucket : 'insufficient',
    provincePending: a.comparable != null && !args.showComparable,
    crossFamilyRecommended: a.crossFamilyRecommended,
    headlineRiskLine: a.headlineRiskLine,
    approvalNote: a.graduationRecommended ? (a.graduation?.note ?? null) : null,
    shortTermNote: a.shortTermRecommended ? (a.shortTermStrategy?.note ?? null) : null,
    overrideType: a.override?.type ?? null,
    overrideSourceNote: a.override?.sourceNote ?? null,
    note: null,
  }
}

export function savingsPdfFilename(generatedDate: string): string {
  // No client PII in the filename — only the date, matching the rates PDF.
  return `savings-analysis-${generatedDate}.pdf`
}

// ─── Formatting (no arithmetic beyond rounding for display) ──────────────────
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

function addMonthsYMD(ymd: string, months: number): string {
  const [y, mo, d] = ymd.slice(0, 10).split('-').map(Number)
  const total = (y * 12 + (mo - 1)) + months
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, 28)).padStart(2, '0')}`
}

function monthYear(ymd: string): string {
  const [y, mo] = ymd.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, 15)).toLocaleDateString('en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function yearsPhrase(months: number): string {
  if (months >= 18) {
    const yrs = Math.round(months / 12)
    return `${yrs} ${yrs === 1 ? 'yr' : 'yrs'}`
  }
  return `${months} mo`
}

function amortPhrase(months: number): string {
  if (months % 12 === 0) return `${months / 12} years`
  return `${months} months (about ${Math.round(months / 12)} years)`
}

/** How a rate is stated, without the lender's name: printed rates verbatim
 * with their term; a computed floating rate is discount-first with the
 * effective figure labeled against the prime and its as-of. */
function ratePhrase(c: SavingsPdfComparable): string {
  const term = comparableTermLabel(c.termMonths)
  if (c.variance != null && c.primeUsed != null) {
    const dir = c.variance < 0 ? 'minus' : 'plus'
    return `prime ${dir} ${Math.abs(c.variance)} (about ${c.rate}% at today's prime of ${c.primeUsed}%, as of ${longDate(c.primeAsOf ?? null)}), ${c.rateTypeLabel}, ${term}`
  }
  return `${c.rate}% ${c.rateTypeLabel}, ${term}`
}

function classPhrase(productClass: string | null): string {
  const p = (productClass ?? '').toLowerCase()
  if (p === 'b_side') return 'alternative lending'
  if (p === 'insured' || p === 'insurable') return p
  return 'conventional'
}

// ─── The generator ───────────────────────────────────────────────────────────
const M = 46
const PAGE_W = 612
const PAGE_H = 792
const WIDTH = PAGE_W - M * 2
const FOOTER_TOP = 78

interface Ctx {
  doc: PDFDocument
  font: PDFFont
  bold: PDFFont
  display: PDFFont
  page: PDFPage
  y: number
  clientName: string
  generatedDate: string
}

function masthead(ctx: Ctx, pageNo: number) {
  const { page, bold, font } = ctx
  page.drawRectangle({ x: M, y: PAGE_H - 52, width: 13, height: 13, color: LIME })
  page.drawText('FOX MORTGAGE', { x: M + 20, y: PAGE_H - 50, size: 13, font: bold, color: NAVY })
  const right = pdfSafe(`SAVINGS ANALYSIS  |  ${longDate(ctx.generatedDate).toUpperCase()}`)
  const rw = font.widthOfTextAtSize(right, 7.5)
  page.drawText(right, { x: M + WIDTH - rw, y: PAGE_H - 48, size: 7.5, font, color: GRAY })
  if (pageNo > 1) {
    const name = pdfSafe(`Prepared for ${ctx.clientName}`)
    const nw = font.widthOfTextAtSize(name, 7.5)
    page.drawText(name, { x: M + WIDTH - nw, y: PAGE_H - 59, size: 7.5, font, color: GRAY })
  }
  page.drawLine({ start: { x: M, y: PAGE_H - 64 }, end: { x: M + WIDTH, y: PAGE_H - 64 }, thickness: 1.5, color: NAVY })
  ctx.y = PAGE_H - 86
}

function drawFooters(ctx: Ctx) {
  const pages = ctx.doc.getPages()
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 58 }, end: { x: M + WIDTH, y: 58 }, thickness: 1, color: LIME })
    p.drawText(pdfSafe(`Michael Fox  |  Mortgage Agent Level 2  |  BRX Mortgage  |  FSRA 13463  |  Page ${i + 1} of ${pages.length}`), {
      x: M,
      y: 44,
      size: 7.5,
      font: ctx.font,
      color: GRAY,
    })
    p.drawText('226-770-8880  |  mfox@foxmortgage.ca  |  foxmortgage.ca', { x: M, y: 33, size: 7, font: ctx.font, color: GRAY })
  })
}

function text(ctx: Ctx, s: string, opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; x?: number; y?: number } = {}) {
  ctx.page.drawText(pdfSafe(s), {
    x: opts.x ?? M,
    y: opts.y ?? ctx.y,
    size: opts.size ?? 9.5,
    font: opts.font ?? ctx.font,
    color: opts.color ?? NAVY,
  })
}

function para(ctx: Ctx, s: string, opts: { size?: number; color?: ReturnType<typeof rgb>; leading?: number; x?: number; width?: number; font?: PDFFont } = {}) {
  const size = opts.size ?? 9.5
  const leading = opts.leading ?? size + 3.5
  const w = opts.width ?? WIDTH
  for (const line of wrap(pdfSafe(s), opts.font ?? ctx.font, size, w)) {
    text(ctx, line, { size, color: opts.color ?? GRAY, x: opts.x, font: opts.font })
    ctx.y -= leading
  }
}

function heading(ctx: Ctx, s: string) {
  text(ctx, s, { size: 13, font: ctx.display })
  ctx.y -= 18
}

async function newDoc(input: SavingsPdfInput): Promise<Ctx> {
  const doc = await PDFDocument.create()
  doc.setTitle('Your mortgage savings analysis')
  doc.setProducer('Fox Mortgage portal')
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const display = await doc.embedFont(StandardFonts.TimesRomanBold)
  const page = doc.addPage([PAGE_W, PAGE_H])
  const ctx: Ctx = { doc, font, bold, display, page, y: PAGE_H, clientName: input.clientName, generatedDate: input.generatedDate }
  masthead(ctx, 1)
  return ctx
}

function addPage(ctx: Ctx, pageNo: number) {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H])
  masthead(ctx, pageNo)
}

/** One-page honest-state document (review / availability / insufficient /
 * stay-put). No figures print on a blocked file. */
async function statePage(input: SavingsPdfInput, body: (ctx: Ctx) => void): Promise<Uint8Array> {
  const ctx = await newDoc(input)
  text(ctx, `PREPARED FOR ${input.clientName.toUpperCase()}`, { size: 8, font: ctx.bold, color: GRAY })
  ctx.y -= 24
  body(ctx)
  drawFooters(ctx)
  return ctx.doc.save()
}

export async function generateSavingsPdf(raw: SavingsPdfInput): Promise<Uint8Array> {
  // Compensation never reaches a borrower: scrub every string field once, up
  // front, before anything is drawn (defense in depth; drawing re-scrubs the
  // free-text fields it composes with).
  const input: SavingsPdfInput = {
    ...raw,
    clientName: redactComp(raw.clientName),
    currentLender: redactComp(raw.currentLender),
    currentRateType: raw.currentRateType ? redactComp(raw.currentRateType) : raw.currentRateType,
    comparable: raw.comparable ? { ...raw.comparable, lender: redactComp(raw.comparable.lender), rateTypeLabel: redactComp(raw.comparable.rateTypeLabel) } : null,
    penaltyFraming: raw.penaltyFraming ? redactComp(raw.penaltyFraming) : raw.penaltyFraming,
    headlineRiskLine: raw.headlineRiskLine ? redactComp(raw.headlineRiskLine) : raw.headlineRiskLine,
    approvalNote: raw.approvalNote ? redactComp(raw.approvalNote) : raw.approvalNote,
    shortTermNote: raw.shortTermNote ? redactComp(raw.shortTermNote) : raw.shortTermNote,
    overrideSourceNote: raw.overrideSourceNote ? redactComp(raw.overrideSourceNote) : raw.overrideSourceNote,
    note: raw.note ? redactComp(raw.note) : raw.note,
  }

  // ── Blocked and honest states come FIRST so no suspect figure prints. ──
  if (input.bucket === 'review') {
    return statePage(input, ctx => {
      heading(ctx, 'What we found')
      para(
        ctx,
        'The figures we monitor for your mortgage do not line up with the payment schedule on file. ' +
          'That usually means a prepayment, a payment change, or a data update we have not captured yet. ' +
          'Michael will confirm the true figures with you and your lender before recommending anything, ' +
          'and nothing moves without that confirmation.',
      )
    })
  }
  if (input.provincePending) {
    return statePage(input, ctx => {
      heading(ctx, 'What we found')
      para(
        ctx,
        'We are confirming which lenders can lend in your province before we put a specific rate in ' +
          'writing. Michael will follow up with the confirmed options shortly. Nothing here is a ' +
          'commitment, and we never quote a rate a lender cannot actually offer you.',
      )
    })
  }
  if (input.bucket === 'insufficient' || input.comparable == null || input.currentPayment == null || input.newPayment == null) {
    return statePage(input, ctx => {
      heading(ctx, 'What we found')
      para(
        ctx,
        'We could not run a full comparison from the monitored data. This usually means a figure ' +
          'is missing or the rate on file needs confirming. Michael will confirm the details with ' +
          'you and the lender before recommending anything.',
      )
    })
  }

  const c = input.comparable
  const saving = input.monthlySaving ?? 0
  const isFloatingClient = input.currentRateType === 'variable' || input.currentRateType === 'adjustable'
  const isSwitch = input.transaction === 'switch'
  const fixedPenalty = input.penaltyThreeMonthsInterest != null && !isFloatingClient
  const horizon = input.horizonMonths ?? input.remainingMonths ?? c.termMonths
  const horizonEnd = addMonthsYMD(input.generatedDate, horizon)
  const breakEvenPenalty = saving > 0 && horizon != null ? saving * horizon : null

  // ── No saving to present, or a stay-put verdict: the honest wait
  // document, one page. A stay-put file never receives a "choice" document,
  // whatever small monthly saving exists — breaking costs more than it saves
  // (Task 5's wait-for-maturity rule). ──
  if (saving <= 0 || input.bucket === 'stay_put') {
    return statePage(input, ctx => {
      heading(ctx, 'What we found')
      para(
        ctx,
        `You are with ${input.currentLender} at ${input.currentRate != null ? `${input.currentRate}%` : 'a rate we do not have on file'}` +
          `${input.currentRateType ? ` (${input.currentRateType})` : ''}, and your term matures ${longDate(input.maturity)}.`,
        { size: 10, color: NAVY },
      )
      ctx.y -= 4
      para(
        ctx,
        `The best same-category rate we can approve today is ${ratePhrase(c)}, ` +
          (input.overrideType === 'desk_rate'
            ? `quoted to Michael directly${input.overrideSourceNote ? ` (${input.overrideSourceNote})` : ''}. `
            : `from a rate sheet dated ${longDate(c.asOf)}. `) +
          'It does not put money back in your pocket once the cost of moving is counted.',
      )
      ctx.y -= 8
      heading(ctx, 'What we would do')
      if (input.bucket === 'marginal' && fixedPenalty) {
        para(
          ctx,
          "Counting only the minimum penalty, the numbers are close to even. A fixed rate's real penalty " +
            'can only be that minimum or more, so moving today does not clear the bar. We keep watching ' +
            'your file and revisit as your maturity date gets closer or as rates move.',
          { size: 10, color: NAVY },
        )
      } else if (input.bucket === 'marginal') {
        para(
          ctx,
          'The savings and the cost of moving are close to even right now. There is no clear win in ' +
            'moving today, so we keep watching your file and revisit as your maturity date gets closer ' +
            'or as rates move.',
          { size: 10, color: NAVY },
        )
      } else {
        para(
          ctx,
          'Breaking your mortgage early would cost more than it saves right now, so the smart move is ' +
            `to wait. We will be ready to line up a better rate as your term matures on ${longDate(input.maturity)}, ` +
            'when there is no penalty to pay. Staying put today is the right call.',
          { size: 10, color: NAVY },
        )
      }
      ctx.y -= 8
      para(
        ctx,
        'Even a wait is a win. Strategic Mortgage Monitoring keeps tracking your file and finds the ' +
          'month the numbers flip, at no cost to you.',
      )
      if (input.note) {
        ctx.y -= 4
        para(ctx, input.note, { size: 8.5 })
      }
    })
  }

  // ═══ The three-page choice document ═══
  const ctx = await newDoc(input)
  const plan = input.samePaymentPlan ?? null
  const remainingAmort = input.remainingAmortizationMonths ?? null

  // ── PAGE 1: the choice ──
  text(ctx, `PREPARED FOR ${input.clientName.toUpperCase()}`, { size: 8, font: ctx.bold, color: GRAY })
  ctx.y -= 20
  const optionCount = plan ? 'Two' : 'One'
  const dealWord = isSwitch ? 'renewal' : 'refinance'
  para(ctx, `${optionCount} way${plan ? 's' : ''} this ${dealWord} can pay you`, { size: 24, font: ctx.display, color: NAVY, leading: 28 })
  ctx.y -= 4
  para(
    ctx,
    `We reviewed your ${input.currentLender} mortgage against this week's approved rates. ` +
      `A lender we work with can beat your ${input.currentRate != null ? `${input.currentRate}%` : 'current'} rate. ` +
      'This report shows what each path puts back in your pocket.',
    { size: 9.5, leading: 13.5 },
  )
  ctx.y -= 10

  // Option cards, side by side.
  const cardW = plan ? (WIDTH - 14) / 2 : WIDTH
  const cardH = 108
  const cardTop = ctx.y
  // Option 1 — navy panel.
  ctx.page.drawRectangle({ x: M, y: cardTop - cardH, width: cardW, height: cardH, color: NAVY })
  text(ctx, 'OPTION 1  |  LOWER PAYMENT', { x: M + 12, y: cardTop - 18, size: 7.5, font: ctx.bold, color: LIME })
  text(ctx, `${money(saving)} a month back`, { x: M + 12, y: cardTop - 44, size: 17, font: ctx.bold, color: WHITE })
  text(ctx, `Payment ${money2(input.currentPayment)} to ${money2(input.newPayment)}`, { x: M + 12, y: cardTop - 64, size: 9, font: ctx.font, color: WHITE })
  if (remainingAmort != null) {
    text(ctx, `Same payoff plan: ${amortPhrase(remainingAmort)} left`, { x: M + 12, y: cardTop - 80, size: 8, font: ctx.font, color: rgb(0.75, 0.82, 0.86) })
  }
  // Option 2 — white panel, lime top border.
  if (plan) {
    const x2 = M + cardW + 14
    ctx.page.drawRectangle({ x: x2, y: cardTop - cardH, width: cardW, height: cardH, color: WHITE, borderColor: LIGHT, borderWidth: 1 })
    ctx.page.drawRectangle({ x: x2, y: cardTop - 4, width: cardW, height: 4, color: LIME })
    text(ctx, 'OPTION 2  |  SAME PAYMENT', { x: x2 + 12, y: cardTop - 18, size: 7.5, font: ctx.bold, color: NAVY })
    text(ctx, `${yearsPhrase(plan.monthsSooner)} sooner`, { x: x2 + 12, y: cardTop - 44, size: 17, font: ctx.bold, color: NAVY })
    text(ctx, `Keep paying ${money2(input.currentPayment)}, be mortgage-free`, { x: x2 + 12, y: cardTop - 64, size: 9, font: ctx.font, color: GRAY })
    text(ctx, `${plan.monthsSooner} months sooner. About ${money(plan.paymentsAvoided)} never paid,`, { x: x2 + 12, y: cardTop - 77, size: 9, font: ctx.font, color: GRAY })
    text(ctx, `on today's rate.`, { x: x2 + 12, y: cardTop - 90, size: 9, font: ctx.font, color: GRAY })
  }
  ctx.y = cardTop - cardH - 16

  // Rate strip — the same rate powers every option. Never a lender name.
  const stripLines = wrap(
    pdfSafe(
      `Every option uses the same rate: ${ratePhrase(c)} from a lender we work with, ` +
        (input.overrideType === 'desk_rate'
          ? `quoted to Michael directly${input.overrideSourceNote ? ` (${input.overrideSourceNote})` : ''}, not a published sheet rate, `
          : `taken from their rate sheet dated ${longDate(c.asOf)} `) +
        `and priced as a ${classPhrase(input.productClass)} ${isSwitch ? 'switch at your renewal' : 'refinance'}. ` +
        'Priced against lenders in the same category as your current mortgage. ' +
        'We share the lender\'s name and full terms when we talk.',
    ),
    ctx.font,
    8.5,
    WIDTH - 24,
  )
  const stripH = stripLines.length * 12 + 16
  ctx.page.drawRectangle({ x: M, y: ctx.y - stripH + 10, width: WIDTH, height: stripH, color: PAPER })
  let sy = ctx.y - 4
  for (const line of stripLines) {
    text(ctx, line, { x: M + 12, y: sy, size: 8.5, color: NAVY })
    sy -= 12
  }
  ctx.y = ctx.y - stripH + 2
  // Approved escalations qualify the rate right under the strip.
  if (input.approvalNote) para(ctx, input.approvalNote, { size: 8 })
  if (input.crossFamilyRecommended && input.headlineRiskLine) {
    para(ctx, input.headlineRiskLine, { size: 8 })
    para(ctx, 'This option is a different rate type than the one you hold today. Michael reviewed that trade-off before recommending it, and it is part of the conversation.', { size: 8 })
  }
  if (input.shortTermNote) para(ctx, input.shortTermNote, { size: 8 })
  ctx.y -= 12

  // Amortization bars, drawn.
  if (plan && remainingAmort != null && remainingAmort > 0) {
    text(ctx, 'STAYING THE COURSE', { size: 7.5, font: ctx.bold, color: GRAY })
    ctx.y -= 10
    ctx.page.drawRectangle({ x: M, y: ctx.y - 15, width: WIDTH, height: 15, color: NAVY })
    const label1 = pdfSafe(`${amortPhrase(remainingAmort)} to go`)
    const l1w = ctx.font.widthOfTextAtSize(label1, 7.5)
    text(ctx, label1, { x: M + WIDTH - l1w - 8, y: ctx.y - 11, size: 7.5, color: WHITE })
    ctx.y -= 26
    text(ctx, 'SAME PAYMENT AT THE NEW RATE', { size: 7.5, font: ctx.bold, color: GRAY })
    ctx.y -= 10
    const w2 = Math.max(30, Math.round((plan.months / remainingAmort) * WIDTH))
    ctx.page.drawRectangle({ x: M, y: ctx.y - 15, width: w2, height: 15, color: NAVY })
    ctx.page.drawRectangle({ x: M + w2, y: ctx.y - 15, width: WIDTH - w2, height: 15, color: LIME })
    ctx.y -= 26
    const backLabel = pdfSafe(`about ${yearsPhrase(plan.monthsSooner)} returned to you`)
    const blw = ctx.font.widthOfTextAtSize(backLabel, 7.5)
    text(ctx, backLabel, { x: Math.min(M + w2, M + WIDTH - blw), y: ctx.y + 4, size: 7.5, color: GRAY })
    ctx.y -= 8
  }

  // ── PAGE 2: side by side, and the penalty ──
  addPage(ctx, 2)
  heading(ctx, 'Side by side')
  para(ctx, `Where each path stands by ${monthYear(horizonEnd)}, the end of the comparison window (${horizon} months).`, { size: 8.5 })
  ctx.y -= 6

  const comp = input.comparison ?? null
  const cols = plan && comp?.option2 ? 3 : 2
  const labelW = 168
  const colW = (WIDTH - labelW) / cols
  const colX = (i: number) => M + labelW + colW * i
  const headers = cols === 3 ? ['Today', 'Option 1', 'Option 2'] : ['Today', 'New rate']
  const rateCell = `${c.rate}% (${comparableTermLabel(c.termMonths)})`
  const currentRateCell = input.currentRate != null ? `${input.currentRate}%${input.currentRateType ? ` ${input.currentRateType}` : ''}` : 'not on file'
  const rows: { label: string; cells: string[]; highlight?: boolean }[] = [
    { label: 'Rate', cells: cols === 3 ? [currentRateCell, rateCell, rateCell] : [currentRateCell, rateCell] },
    {
      label: 'Monthly payment',
      cells:
        cols === 3
          ? [money2(input.currentPayment), money2(input.newPayment), money2(input.currentPayment)]
          : [money2(input.currentPayment), money2(input.newPayment)],
      highlight: true,
    },
    { label: 'Balance today', cells: Array(cols).fill(money(input.balance)) },
    {
      label: 'Payoff plan',
      cells:
        cols === 3 && plan && remainingAmort != null
          ? [amortPhrase(remainingAmort), amortPhrase(remainingAmort), `about ${amortPhrase(plan.months)}`]
          : Array(cols).fill(remainingAmort != null ? amortPhrase(remainingAmort) : 'not on file'),
    },
    ...(comp
      ? [
          {
            label: `Interest paid by ${monthYear(horizonEnd)}`,
            cells:
              cols === 3
                ? [money(comp.today.interestPaid), money(comp.option1.interestPaid), money(comp.option2!.interestPaid)]
                : [money(comp.today.interestPaid), money(comp.option1.interestPaid)],
          },
          {
            label: `Balance at ${monthYear(horizonEnd)}`,
            cells:
              cols === 3
                ? [money(comp.today.balanceAtHorizon), money(comp.option1.balanceAtHorizon), money(comp.option2!.balanceAtHorizon)]
                : [money(comp.today.balanceAtHorizon), money(comp.option1.balanceAtHorizon)],
            highlight: true,
          },
        ]
      : []),
  ]
  // Header row.
  headers.forEach((h, i) => text(ctx, h, { x: colX(i), size: 8.5, font: ctx.bold, color: NAVY }))
  ctx.y -= 6
  ctx.page.drawLine({ start: { x: M, y: ctx.y }, end: { x: M + WIDTH, y: ctx.y }, thickness: 1, color: NAVY })
  ctx.y -= 14
  for (const row of rows) {
    const rowFont = row.highlight ? ctx.bold : ctx.font
    for (const line of wrap(pdfSafe(row.label), ctx.font, 8.5, labelW - 10)) {
      text(ctx, line, { size: 8.5, color: GRAY })
      row.cells.forEach((cell, i) => text(ctx, cell, { x: colX(i), size: 8.5, font: rowFont, color: row.highlight ? NAVY : GRAY }))
      row.cells = row.cells.map(() => '') // wrapped label lines print cells once
      ctx.y -= 12
    }
    ctx.y -= 2
    ctx.page.drawLine({ start: { x: M, y: ctx.y + 4 }, end: { x: M + WIDTH, y: ctx.y + 4 }, thickness: 0.5, color: LIGHT })
    ctx.y -= 8
  }
  ctx.y -= 10

  // The penalty, policy-bound (Task 5: no floor-based conclusion for a fixed break).
  if (isSwitch) {
    heading(ctx, 'No penalty at your renewal')
    para(
      ctx,
      'Because this move happens at your renewal, there is no cost to break your mortgage. ' +
        `The comparison above runs to ${monthYear(horizonEnd)}.`,
    )
  } else {
    heading(ctx, 'What breaking your mortgage early would cost')
    if (input.penaltyFraming) para(ctx, input.penaltyFraming, { size: 8.5 })
    if (fixedPenalty && input.penaltyThreeMonthsInterest != null) {
      para(
        ctx,
        `Three months of interest on your balance is about ${money(input.penaltyThreeMonthsInterest)}. ` +
          'That is the minimum, not the final figure. The real penalty is the greater of that minimum ' +
          'and the interest rate differential.',
        { size: 9.5, color: NAVY },
      )
      if (breakEvenPenalty != null) {
        para(
          ctx,
          `The number that decides it: this works if your penalty comes in under about ${money(breakEvenPenalty)}. ` +
            'Above that figure, the switch stops making sense.',
          { size: 9.5, color: NAVY },
        )
        // The gauge: green to the break-even tick, red beyond, dot at the minimum.
        ctx.y -= 6
        const gaugeW = WIDTH
        const scaleMax = breakEvenPenalty * 1.5
        const gx = (v: number) => M + Math.min(gaugeW, (v / scaleMax) * gaugeW)
        const beX = gx(breakEvenPenalty)
        const minX = gx(input.penaltyThreeMonthsInterest)
        ctx.page.drawRectangle({ x: M, y: ctx.y - 12, width: beX - M, height: 12, color: rgb(0.78, 0.9, 0.72) })
        ctx.page.drawRectangle({ x: beX, y: ctx.y - 12, width: M + gaugeW - beX, height: 12, color: rgb(0.95, 0.8, 0.78) })
        ctx.page.drawLine({ start: { x: beX, y: ctx.y - 16 }, end: { x: beX, y: ctx.y + 2 }, thickness: 1.2, color: RED })
        ctx.page.drawEllipse({ x: minX, y: ctx.y - 6, xScale: 3.5, yScale: 3.5, color: NAVY })
        ctx.y -= 26
        text(ctx, `minimum ${money(input.penaltyThreeMonthsInterest)}`, { x: Math.max(M, minX - 30), size: 7, color: NAVY })
        const beLabel = pdfSafe(`break-even ${money(breakEvenPenalty)}`)
        const beLW = ctx.font.widthOfTextAtSize(beLabel, 7)
        text(ctx, beLabel, { x: Math.min(beX - beLW / 2, M + gaugeW - beLW), size: 7, color: RED })
        ctx.y -= 14
      }
      para(
        ctx,
        input.penaltyMethodologyKnown
          ? `We have ${input.currentLender}'s penalty method on file, so Michael can walk the estimate through with you on a call. Only ${input.currentLender} can state the exact figure, and Michael requests it before anything moves.`
          : `We don't have ${input.currentLender}'s exact penalty rule on file, so only ${input.currentLender} can state the exact figure. Michael requests it before anything moves.`,
        { size: 8.5 },
      )
      // The why-we-won't-guess callout.
      ctx.y -= 6
      const guessLines = wrap(
        pdfSafe(
          "Why we won't guess: the interest rate differential depends on numbers only your lender holds. " +
            'A guessed penalty could flip this answer in either direction, so we work from the real ' +
            'figure instead. That is the honest way to do this.',
        ),
        ctx.font,
        8.5,
        WIDTH - 24,
      )
      const boxH = guessLines.length * 12 + 14
      ctx.page.drawRectangle({ x: M, y: ctx.y - boxH + 10, width: WIDTH, height: boxH, borderColor: NAVY, borderWidth: 1 })
      let gy = ctx.y - 4
      for (const line of guessLines) {
        text(ctx, line, { x: M + 12, y: gy, size: 8.5, color: NAVY })
        gy -= 12
      }
      ctx.y = ctx.y - boxH
    } else if (input.penaltyThreeMonthsInterest != null) {
      // Floating: three months of interest IS the penalty.
      para(ctx, `Three months of interest on your balance is about ${money(input.penaltyThreeMonthsInterest)}. On a floating rate, that is the penalty.`, { size: 9.5, color: NAVY })
      if (input.breakEvenMonths != null) {
        para(ctx, `At the saving above, the switch pays for itself in about ${Math.ceil(input.breakEvenMonths)} months.`, { size: 8.5 })
      }
    }
    if (input.requalification) {
      ctx.y -= 4
      para(
        ctx,
        'Because this means breaking and refinancing your mortgage, you would requalify at the ' +
          'government stress test. This comparison assumes you qualify, and Michael confirms that ' +
          'with you before anything moves.',
        { size: 8.5 },
      )
    }
  }

  // ── PAGE 3: next steps ──
  addPage(ctx, 3)
  heading(ctx, 'What happens next')
  if (isSwitch || isFloatingClient) {
    // A switch has no penalty; a floating break's penalty is exact — a
    // conclusion is allowed here (Task 5 kept both), but only when the math
    // actually clears the bar. A marginal file states close-to-even, never a
    // negative "worth about".
    if ((input.netBenefit ?? 0) > 0 && input.bucket === 'act_now') {
      const lead = isSwitch
        ? `Moving at your renewal looks worth about ${money(input.netBenefit)} over the ${horizon}-month comparison window. There is no penalty to pay.`
        : `After the three months of interest, the move looks worth about ${money(input.netBenefit)} over the ${horizon} months in the comparison window.`
      para(ctx, `${lead} It is worth a conversation. Michael confirms the numbers with the lender before you decide.`, { size: 10, color: NAVY })
    } else {
      para(
        ctx,
        'The savings and the cost of moving are close to even right now. There is no clear win in ' +
          'moving today, so we keep watching your file and revisit as your maturity date gets closer ' +
          'or as rates move.',
        { size: 10, color: NAVY },
      )
    }
  } else if (
    fixedPenalty &&
    breakEvenPenalty != null &&
    input.penaltyThreeMonthsInterest != null &&
    input.penaltyThreeMonthsInterest >= breakEvenPenalty
  ) {
    // Even the MINIMUM penalty sits at or above the break-even: the honest
    // statement is that moving today does not clear the bar, whatever the
    // real penalty turns out to be. No conditional can soften that.
    para(
      ctx,
      `Even the minimum penalty (about ${money(input.penaltyThreeMonthsInterest)}) is at or above the break-even figure (about ${money(breakEvenPenalty)}), ` +
        "and a fixed rate's real penalty can only be that minimum or more. Moving today does not clear the bar. " +
        'We keep watching your file and revisit as your maturity date gets closer or as rates move.',
      { size: 10, color: NAVY },
    )
  } else {
    // Fixed break: conditional framing only, no verdict.
    const conditions: { lead: string; body: string }[] = [
      {
        lead: `If the penalty comes in at the minimum (about ${money(input.penaltyThreeMonthsInterest)})`,
        body: 'The saving stands as shown and we move while the rate holds. Michael confirms every figure with the lender first.',
      },
      {
        lead: breakEvenPenalty != null ? `If it lands near the break-even (about ${money(breakEvenPenalty)})` : 'If it lands near the break-even',
        body: 'The gain is thin. We weigh it together with the real number in hand, and nothing moves until it is.',
      },
      {
        lead: 'If it comes back above the break-even',
        body: 'Breaking early would cost more than it saves. We wait, keep monitoring, and recheck quarterly or as rates move.',
      },
    ]
    for (const cond of conditions) {
      const bodyLines = wrap(pdfSafe(cond.body), ctx.font, 8.5, WIDTH - 24)
      const h = 16 + bodyLines.length * 12 + 8
      ctx.page.drawRectangle({ x: M, y: ctx.y - h + 10, width: WIDTH, height: h, color: PAPER })
      text(ctx, cond.lead, { x: M + 12, y: ctx.y - 4, size: 9, font: ctx.bold, color: NAVY })
      let cy = ctx.y - 18
      for (const line of bodyLines) {
        text(ctx, line, { x: M + 12, y: cy, size: 8.5, color: GRAY })
        cy -= 12
      }
      ctx.y = ctx.y - h - 6
    }
  }
  ctx.y -= 6
  para(
    ctx,
    'Even a wait is a win. Strategic Mortgage Monitoring keeps tracking your file and finds the ' +
      'month the numbers flip, at no cost to you.',
    { size: 8.5 },
  )
  ctx.y -= 10

  const steps: [string, string][] = [
    ['1. Book 15 minutes', 'A short call to look at this together.'],
    [
      '2. We get your real numbers',
      isSwitch
        ? 'Michael lines up the paperwork ahead of your renewal date, with nothing owed to your current lender.'
        : `Michael requests the exact payout figure from ${input.currentLender}, in writing.`,
    ],
    ['3. Decide with real numbers', 'No pressure and no guesswork. The figures make the call.'],
  ]
  for (const [leadLine, sub] of steps) {
    text(ctx, leadLine, { size: 10, font: ctx.bold, color: NAVY })
    ctx.y -= 13
    para(ctx, sub, { size: 8.5 })
    ctx.y -= 4
  }
  ctx.y -= 6
  // CTA band.
  ctx.page.drawRectangle({ x: M, y: ctx.y - 58, width: WIDTH, height: 58, color: NAVY })
  text(ctx, '226-770-8880', { x: M + 16, y: ctx.y - 30, size: 20, font: ctx.bold, color: LIME })
  text(ctx, 'mfox@foxmortgage.ca  |  foxmortgage.ca', { x: M + 16, y: ctx.y - 47, size: 9, font: ctx.font, color: WHITE })
  ctx.y -= 74

  // Fine print, short bold-led paragraphs.
  const fine: [string, string][] = [
    ['These are estimates.', `Every figure on this report was computed on ${longDate(input.generatedDate)} from monitored data. Rates can change at any time, and floating rates move when prime moves.`],
    [
      'The rate is real.',
      input.overrideType === 'desk_rate'
        ? `It was quoted to Michael directly${input.overrideSourceNote ? ` (${input.overrideSourceNote})` : ''} and the lender confirms it in writing before anything moves. We share the lender's name and full terms on the call.`
        : `It comes from a lender rate sheet dated ${longDate(c.asOf)}, for a ${comparableTermLabel(c.termMonths)}. We share the lender's name and full terms on the call.`,
    ],
    [
      'How it was priced.',
      `As a ${classPhrase(input.productClass)} ${isSwitch ? 'switch at renewal' : 'refinance'}, against lenders in the same category as your current mortgage.` +
        (input.requalification ? ' A refinance requalifies at the government stress test, and this comparison assumes you qualify.' : ''),
    ],
    ...(fixedPenalty
      ? ([['The penalty is not knowable today.', 'Anything beyond the three-month minimum depends on your lender\'s payout statement. We never guess it into a number.']] as [string, string][])
      : []),
    ['Lifetime figures assume today\'s rate.', 'Projections past your next renewal assume the rate shown continues, which no one can promise.'],
    ['The legal part.', 'Michael Fox is a Mortgage Agent Level 2 with BRX Mortgage, FSRA licence 13463. This report is not a promise to lend and it is not an approval. Underwriting begins when you apply.'],
  ]
  for (const [leadLine, body] of fine) {
    // Bold lead, then the body flowing on from it.
    const leadSafe = pdfSafe(leadLine)
    text(ctx, leadSafe, { size: 7.5, font: ctx.bold, color: NAVY })
    const leadW = ctx.bold.widthOfTextAtSize(leadSafe, 7.5) + 4
    const bodyLines = wrap(pdfSafe(body), ctx.font, 7.5, WIDTH - leadW)
    if (bodyLines.length > 0) text(ctx, bodyLines[0], { x: M + leadW, size: 7.5, color: GRAY })
    ctx.y -= 10
    for (const line of wrap(bodyLines.slice(1).join(' '), ctx.font, 7.5, WIDTH)) {
      if (!line) continue
      text(ctx, line, { size: 7.5, color: GRAY })
      ctx.y -= 10
    }
    ctx.y -= 3
  }
  if (input.note) {
    ctx.y -= 2
    para(ctx, input.note, { size: 7.5 })
  }

  drawFooters(ctx)
  return ctx.doc.save()
}
