// GET /api/portal/admin/opportunities/[householdId]/pdf?upload=<uploadId> —
// the client-ready savings-analysis PDF for one monitored mortgage. Server-side
// with pdf-lib; the generator recomputes Fox's analysis from the persisted raw
// rows through the SAME shared path the board uses, so the document can never
// drift from the card. Gated by opportunities.view; refused in demo (a real
// client's PDF must never render fictional or leak in demo). Download only.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { isDemoMode } from '@/lib/demo'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { getAgentIdByEmail, getRateQuotesFull } from '@/lib/underwriting'
import { rawRowsForUpload, recentUploads, smmStoreConfigured } from '@/lib/smm-store'
import { collapseCoBorrowers, parseSmmRow } from '@/lib/smm'
import type { BookQuote } from '@/lib/smm-match'
import { analyzeMortgage } from '@/lib/smm-analysis'
import { generateSavingsPdf, savingsPdfFilename, type SavingsPdfInput } from '@/lib/savings-pdf'
import { torontoTodayYMD } from '@/lib/dates'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: { householdId: string } }) {
  const gate = await apiPermission('opportunities.view')
  if (!gate.ok) return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  if (isDemoMode()) {
    return NextResponse.json({ ok: false, message: 'Demo mode does not generate client documents.' }, { status: 403 })
  }
  if (!smmStoreConfigured()) {
    return NextResponse.json({ ok: false, message: 'The upload store is not configured.' }, { status: 503 })
  }

  const householdId = decodeURIComponent(params.householdId)
  const url = new URL(req.url)
  let uploadId = url.searchParams.get('upload')
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
  const book: BookQuote[] =
    quotesR && quotesR.configured && quotesR.ok
      ? quotesR.data.map(q => ({
          rate: q.rate,
          rateType: q.rateType,
          termMonths: q.termMonths,
          productClass: q.productClass,
          asOfDate: q.asOfDate,
          status: q.status,
          lenderSlug: q.lenderSlug,
          primeVariance: q.primeVariance,
        }))
      : []

  const todayYMD = torontoTodayYMD()
  const { analysis } = analyzeMortgage(p, book, todayYMD)
  const a = analysis

  const input: SavingsPdfInput = {
    generatedDate: todayYMD,
    clientName: `${p.firstName} ${p.lastName}`.trim() || p.fileRef || 'your household',
    currentRate: p.rate,
    currentRateType: p.rateType,
    currentLender: p.lender.display,
    balance: p.balance,
    maturity: p.maturityDate,
    comparable: a.comparable ? { rate: a.comparable.rate, lender: a.comparable.lender, asOf: a.comparable.asOf } : null,
    currentPayment: a.currentPayment,
    newPayment: a.newPayment,
    monthlySaving: a.monthlySaving,
    penaltyThreeMonthsInterest: a.penalty?.threeMonthsInterest ?? null,
    penaltyFraming: a.penalty?.framing ?? null,
    penaltyMethodologyKnown: a.penalty?.methodologyKnown ?? false,
    breakEvenMonths: a.breakEvenMonths,
    netBenefit: a.netBenefit,
    remainingMonths: a.remainingMonths,
    bucket: a.bucket,
    note: null,
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
