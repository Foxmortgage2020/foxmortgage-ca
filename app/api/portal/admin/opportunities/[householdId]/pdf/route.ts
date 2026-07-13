// /api/portal/admin/opportunities/[householdId]/pdf — the client-ready
// savings-analysis PDF for one monitored mortgage. Server-side with pdf-lib;
// the generator recomputes Fox's analysis from the persisted raw rows through
// the SAME shared path the board uses, so the document can never drift from
// the card. Refused in demo (a real client's PDF must never render fictional
// or leak in demo). Download only.
//
// GET (opportunities.view) is the default document and can NEVER carry a
// cross-family recommendation — a GET is replayable from a bookmark, browser
// history, or a crafted link, so it must have no approval side effect.
// POST (opportunities.manage) is the confirmed action that mints the
// cross-family-recommended variant after the card's two-tap; the approval is
// recorded on the savings-analysis log with the APPLIED state.

import { NextResponse } from 'next/server'
import { apiPermission, type ApiPermission } from '@/lib/authz'
import { isDemoMode } from '@/lib/demo'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { getAgentIdByEmail, getRateQuotesFull } from '@/lib/underwriting'
import { rawRowsForUpload, recentUploads, recordSavingsAnalysis, smmStoreConfigured } from '@/lib/smm-store'
import { buildSavingsLogEntry } from '@/lib/savings-log'
import { lenderMethodologyFor } from '@/lib/lenders'
import { collapseCoBorrowers, parseSmmRow } from '@/lib/smm'
import type { BookQuote } from '@/lib/smm-match'
import { analyzeMortgage, bookQuoteFromRow } from '@/lib/smm-analysis'
import { resolveProvince } from '@/lib/eligibility'
import { generateSavingsPdf, savingsPdfFilename, type SavingsPdfInput } from '@/lib/savings-pdf'
import { torontoTodayYMD } from '@/lib/dates'
import { PRIME_MIRROR } from '@/config/prime'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: { householdId: string } }) {
  const gate = await apiPermission('opportunities.view')
  if (!gate.ok) return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  const uploadParam = new URL(req.url).searchParams.get('upload')
  // The GET path NEVER approves a cross-family recommendation, whatever the
  // query string says.
  return renderPdf(params.householdId, uploadParam, false, gate)
}

export async function POST(req: Request, { params }: { params: { householdId: string } }) {
  // The confirmed action: recommending a different rate family than the
  // client holds. Manage-gated, POST-only (SameSite Lax keeps the session
  // cookie off cross-site POSTs), minted by the card's two-tap form.
  const gate = await apiPermission('opportunities.manage')
  if (!gate.ok) return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  const form = await req.formData().catch(() => null)
  if (!form || form.get('alt') !== 'approve') {
    return NextResponse.json({ ok: false, message: 'This endpoint mints the approved cross-family document only.' }, { status: 422 })
  }
  const uploadParam = typeof form.get('upload') === 'string' ? String(form.get('upload')) : null
  return renderPdf(params.householdId, uploadParam, true, gate)
}

async function renderPdf(
  rawHouseholdId: string,
  uploadParam: string | null,
  crossFamilyApproved: boolean,
  gate: Extract<ApiPermission, { ok: true }>,
) {
  if (isDemoMode()) {
    return NextResponse.json({ ok: false, message: 'Demo mode does not generate client documents.' }, { status: 403 })
  }
  if (!smmStoreConfigured()) {
    return NextResponse.json({ ok: false, message: 'The upload store is not configured.' }, { status: 503 })
  }

  const householdId = decodeURIComponent(rawHouseholdId)
  let uploadId = uploadParam
  if (!uploadId) {
    // No upload specified: fall back to the latest non-superseded upload.
    const uploadsR = await recentUploads(5)
    const uploads = uploadsR.configured && uploadsR.ok ? uploadsR.data : []
    uploadId = (uploads.find(u => !u.superseded) ?? uploads[0])?.id ?? null
  }
  if (!uploadId) return NextResponse.json({ ok: false, message: 'No upload found.' }, { status: 404 })

  const rowsR = await rawRowsForUpload(uploadId)
  if (!rowsR.configured) return NextResponse.json({ ok: false, message: 'Store not configured.' }, { status: 503 })
  if (!rowsR.ok) return NextResponse.json({ ok: false, message: 'Could not read the upload.' }, { status: 502 })

  const parsed = rowsR.data.map(parseSmmRow)
  const { mortgages } = collapseCoBorrowers(parsed)
  const mortgage = mortgages.find(m => m.primary.householdId === householdId)
  if (!mortgage) return NextResponse.json({ ok: false, message: 'Household not found in this upload.' }, { status: 404 })
  const p = mortgage.primary

  // Approved rate book (read-only role) for the comparable.
  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  const agentId = agentRes.configured && agentRes.ok ? agentRes.data : null
  const quotesR = agentId ? await getRateQuotesFull(agentId) : null
  const book: BookQuote[] = quotesR && quotesR.configured && quotesR.ok ? quotesR.data.map(bookQuoteFromRow) : []

  const todayYMD = torontoTodayYMD()
  const { analysis } = analyzeMortgage(p, book, todayYMD, { crossFamilyApproved })
  const a = analysis

  // Client-facing fail-closed rule: a comparable whose lender's provincial
  // availability is not CONFIRMED (province-unknown or ineligible) must never
  // reach a client document. If the comparable's lender is not confirmed
  // eligible in the subject province, the PDF withholds the named comparison and
  // prints the honest "confirming availability" state instead.
  const comparableProvince =
    a.comparable?.lenderSlug != null ? resolveProvince(a.comparable.lenderSlug, 'ON') : null
  const comparableConfirmed = comparableProvince?.status === 'eligible'
  const showComparable = a.comparable != null && comparableConfirmed

  // The alternative rides the same fail-closed province gate before it can
  // reach a client document.
  const altProvince =
    a.alternative?.comparable.lenderSlug != null ? resolveProvince(a.alternative.comparable.lenderSlug, 'ON') : null
  const showAlternative = a.alternative != null && altProvince?.status === 'eligible'

  // A COMPUTED floating rate is labeled with the prime and its as-of; only
  // computed rates (primeUsed set) carry the label, printed rates stay bare.
  const pricing = (c: { variance?: number | null; primeUsed?: number | null }) =>
    c.primeUsed != null ? { variance: c.variance ?? null, primeUsed: c.primeUsed, primeAsOf: PRIME_MIRROR.asOf } : {}

  const input: SavingsPdfInput = {
    generatedDate: todayYMD,
    clientName: `${p.firstName} ${p.lastName}`.trim() || p.fileRef || 'your household',
    currentRate: p.rate,
    currentRateType: p.rateType,
    currentLender: p.lender.display,
    balance: p.balance,
    maturity: p.maturityDate,
    comparable: showComparable
      ? { rate: a.comparable!.rate, lender: a.comparable!.lender, asOf: a.comparable!.asOf, ...pricing(a.comparable!) }
      : null,
    provincePending: a.comparable != null && !comparableConfirmed,
    alternative:
      showComparable && showAlternative
        ? {
            rate: a.alternative!.comparable.rate,
            rateTypeLabel: a.alternative!.comparable.rateType ?? (a.alternative!.comparable.kind === 'floating' ? 'floating' : 'fixed'),
            lender: a.alternative!.comparable.lender,
            asOf: a.alternative!.comparable.asOf,
            newPayment: a.alternative!.newPayment,
            monthlySaving: a.alternative!.monthlySaving,
            riskLine: a.alternative!.riskLine,
            ...pricing(a.alternative!.comparable),
          }
        : null,
    crossFamilyRecommended: a.crossFamilyRecommended,
    headlineRiskLine: a.headlineRiskLine,
    transaction: a.transaction,
    requalification: a.requalification,
    currentPayment: a.currentPayment,
    newPayment: showComparable ? a.newPayment : null,
    monthlySaving: showComparable ? a.monthlySaving : null,
    penaltyThreeMonthsInterest: a.penalty?.threeMonthsInterest ?? null,
    penaltyFraming: a.penalty?.framing ?? null,
    penaltyMethodologyKnown: a.penalty?.methodologyKnown ?? false,
    breakEvenMonths: showComparable ? a.breakEvenMonths : null,
    netBenefit: showComparable ? a.netBenefit : null,
    remainingMonths: a.remainingMonths,
    horizonMonths: a.horizonMonths,
    // 'review' outranks everything else: a reconciliation-blocked file states
    // no figure to the client regardless of what comparable exists.
    bucket: a.bucket === 'review' ? 'review' : showComparable ? a.bucket : 'insufficient',
    note: null,
  }

  // Reproducibility log (guardrails 1 and 5): every generated client document
  // is one append-only row — calc version, inputs hash, the quotes used with
  // their sheet dates, the figures rendered, and who generated it. The
  // cross-family flag records the APPLIED state (an approval that carried no
  // effect is never asserted). A store failure is loud in logs but never
  // blocks the document (the analysis is already deterministic and replayable
  // from the persisted upload).
  const logged = await recordSavingsAnalysis(
    buildSavingsLogEntry({
      row: p,
      analysis: a,
      surface: 'pdf',
      uploadId,
      actingEmail: gate.user.email,
      todayYMD,
      methodologyKnown: lenderMethodologyFor(p.lender.display) != null,
      crossFamilyApproved: a.crossFamilyRecommended,
    }),
    false, // every generated document is its own event
  )
  if (!logged.configured || !logged.ok) {
    console.error('[savings-pdf] analysis log write did not land')
  }

  const bytes = await generateSavingsPdf(input)
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${savingsPdfFilename(todayYMD)}"`,
      'Cache-Control': 'no-store',
    },
  })
}
