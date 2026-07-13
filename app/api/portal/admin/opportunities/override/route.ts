// POST /api/portal/admin/opportunities/override — Michael's manual comparable
// for one monitored mortgage. POST-only (no GET can create or apply an
// override, the same lesson the cross-family approval learned); gated by
// opportunities.manage; refused in demo; every override carries a mandatory
// reason and lands in the retire-not-delete FOXCA store, and the analysis it
// drives records it on the savings-analysis log.
//
// Two kinds:
//  - book_quote: the client picked a key from the SERVER-DERIVED candidate
//    list (approved + eligible + same tier). The server re-derives the list
//    from the persisted upload and the live book and matches the key — an
//    ineligible lender (BC, restricted, wrong tier, unapproved) never appears
//    in that list, so it can never be picked or matched. Fail-closed.
//  - desk_rate: a rate Michael was quoted directly. He is the gate, but the
//    figure renders with its mandatory source framing, never as a sheet rate.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { isDemoMode } from '@/lib/demo'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { getAgentIdByEmail, getRateQuotesFull } from '@/lib/underwriting'
import { rawRowsForUpload, retireOverride, setOverride, smmStoreConfigured } from '@/lib/smm-store'
import { collapseCoBorrowers, parseSmmRow, type Comparable } from '@/lib/smm'
import type { BookQuote } from '@/lib/smm-match'
import { bookQuoteFromRow, comparableKey, overrideCandidates } from '@/lib/smm-analysis'
import { torontoTodayYMD } from '@/lib/dates'

export const dynamic = 'force-dynamic'

const RATE_TYPES = new Set(['fixed', 'adjustable', 'variable'])

export async function POST(req: Request) {
  const gate = await apiPermission('opportunities.manage')
  if (!gate.ok) return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  if (isDemoMode()) return NextResponse.json({ ok: false, message: 'Demo mode is read-only.' }, { status: 403 })
  if (!smmStoreConfigured()) return NextResponse.json({ ok: false, message: 'Store not configured.' }, { status: 503 })

  let body: {
    action?: unknown
    overrideId?: unknown
    householdId?: unknown
    uploadId?: unknown
    type?: unknown
    candidateKey?: unknown
    desk?: { lender?: unknown; rate?: unknown; rateType?: unknown; termMonths?: unknown; sourceNote?: unknown }
    reason?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, message: 'Malformed request.' }, { status: 400 })
  }

  // ── Retire ──
  if (body.action === 'retire') {
    if (typeof body.overrideId !== 'string' || !body.overrideId) {
      return NextResponse.json({ ok: false, message: 'An override id is required.' }, { status: 422 })
    }
    const r = await retireOverride(body.overrideId, gate.user.email)
    if (!r.configured || !r.ok) return NextResponse.json({ ok: false, message: 'The retire did not record.' }, { status: 502 })
    return NextResponse.json({ ok: true, retired: r.data })
  }

  // ── Set ──
  const householdId = typeof body.householdId === 'string' ? body.householdId : ''
  const uploadId = typeof body.uploadId === 'string' && body.uploadId ? body.uploadId : null
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!householdId || !uploadId) {
    return NextResponse.json({ ok: false, message: 'A household and upload are required.' }, { status: 422 })
  }
  if (reason.length < 5) {
    return NextResponse.json({ ok: false, message: 'A reason (5+ characters) is required; every override is a documented suitability decision.' }, { status: 422 })
  }

  // The authoritative row from the persisted upload (client values never trusted).
  const rowsR = await rawRowsForUpload(uploadId)
  if (!rowsR.configured || !rowsR.ok) return NextResponse.json({ ok: false, message: 'Could not read the upload.' }, { status: 502 })
  const { mortgages } = collapseCoBorrowers(rowsR.data.map(parseSmmRow))
  const mortgage = mortgages.find(m => m.primary.householdId === householdId)
  if (!mortgage) return NextResponse.json({ ok: false, message: 'Household not found in this upload.' }, { status: 404 })

  let comparable: Comparable
  let sourceNote: string | null = null
  if (body.type === 'book_quote') {
    const key = typeof body.candidateKey === 'string' ? body.candidateKey : ''
    if (!key) return NextResponse.json({ ok: false, message: 'A candidate pick is required.' }, { status: 422 })
    // Re-derive the eligible candidate list live and match the key.
    const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
    const agentId = agentRes.configured && agentRes.ok ? agentRes.data : null
    const quotesR = agentId ? await getRateQuotesFull(agentId) : null
    const book: BookQuote[] = quotesR && quotesR.configured && quotesR.ok ? quotesR.data.map(bookQuoteFromRow) : []
    // Toronto's date, the same clock every other surface derives candidates
    // with — a UTC date would flip the transaction window near midnight.
    const candidates = overrideCandidates(mortgage.primary, book, torontoTodayYMD(), 50)
    const match = candidates.find(c => comparableKey(c) === key)
    if (!match) {
      return NextResponse.json(
        { ok: false, message: 'That quote is not an eligible same-tier candidate for this client (province, program, tier, or approval gate). Nothing was set.' },
        { status: 409 },
      )
    }
    comparable = match
  } else if (body.type === 'desk_rate') {
    const d = body.desk ?? {}
    const lender = typeof d.lender === 'string' ? d.lender.trim() : ''
    const rate = typeof d.rate === 'number' ? d.rate : Number(d.rate)
    const rateType = typeof d.rateType === 'string' ? d.rateType.trim().toLowerCase() : ''
    const termMonths = typeof d.termMonths === 'number' ? d.termMonths : Number(d.termMonths)
    sourceNote = typeof d.sourceNote === 'string' ? d.sourceNote.trim() : ''
    if (!lender) return NextResponse.json({ ok: false, message: 'The lender name is required.' }, { status: 422 })
    if (!Number.isFinite(rate) || rate < 0.5 || rate > 25) {
      return NextResponse.json({ ok: false, message: 'The rate must be a real percentage (0.5 to 25).' }, { status: 422 })
    }
    if (!RATE_TYPES.has(rateType)) {
      return NextResponse.json({ ok: false, message: 'The rate type must be fixed, adjustable, or variable.' }, { status: 422 })
    }
    if (!Number.isFinite(termMonths) || termMonths < 6 || termMonths > 120) {
      return NextResponse.json({ ok: false, message: 'The term must be 6 to 120 months.' }, { status: 422 })
    }
    if (sourceNote.length < 5) {
      return NextResponse.json({ ok: false, message: 'A source note is required (who quoted it and when).' }, { status: 422 })
    }
    comparable = {
      rate: Math.round(rate * 100) / 100,
      lender,
      asOf: null, // NOT a sheet rate; the source note is the framing
      termMonths: Math.round(termMonths),
      kind: rateType === 'fixed' ? 'fixed' : 'floating',
      rateType,
    }
  } else {
    return NextResponse.json({ ok: false, message: 'Unknown override type.' }, { status: 422 })
  }

  const saved = await setOverride({
    householdId,
    uploadId,
    overrideType: body.type,
    comparable: comparable as unknown as Record<string, unknown>,
    sourceNote,
    reason,
    actingEmail: gate.user.email,
  })
  if (!saved.configured || !saved.ok) {
    return NextResponse.json({ ok: false, message: 'The override did not record.' }, { status: 502 })
  }
  return NextResponse.json({ ok: true, overrideId: saved.data })
}
