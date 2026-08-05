// Reversing a record withdrawal (handoff 50, 2026-08-05).
//
// The twin of the route beside it, on the same authority key and the same
// browser-minted token path. Reversing sets the decision to `superseded`. It
// does NOT remove the decision row, and nothing on this path can: the record of
// what happened has to outlive the change of mind, which is the whole reason
// the withdrawn record was still readable in the first place.
//
// `{decisionId}` is the WITHDRAWAL'S OWN id, not the record's and not the rec
// row's. It comes from lib/underwriting.ts getRecWithdrawals, which is the only
// way to obtain it: the gates API exposes no GET on this resource at all
// (verified live, 405 method not allowed). A malformed id is refused here so
// the failure reads as a validation problem rather than as a 404 from a server
// this repo does not own.
//
// ITS OWN REASON IS REQUIRED, for the same reason the withdrawal's was. A
// reversal is a second decision, and "why did this come back" is as worth
// answering later as "why did it go away".

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { STATUS_BY_KIND, reverseRecWithdrawal } from '@/lib/gates'
import { checkReason, isDecisionId } from '@/lib/rec-withdrawal'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { decisionId: string } }) {
  const gate = await apiPermission('rec.withdraw')
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, kind: gate.status === 401 ? 'auth' : 'forbidden', message: gate.message },
      { status: gate.status },
    )
  }

  if (!isDecisionId(params.decisionId)) {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: 'That withdrawal id is not a valid id.' },
      { status: 422 },
    )
  }

  let body: any = null
  try {
    body = await req.json()
  } catch {
    // fall through to the reason check
  }

  const reason = checkReason(body?.reason)
  if (!reason.ok) {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: reason.message },
      { status: 422 },
    )
  }

  const result = await reverseRecWithdrawal(
    params.decisionId.trim(),
    reason.reason,
    req.headers.get('x-gates-token'),
  )
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
