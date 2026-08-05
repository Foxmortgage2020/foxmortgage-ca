// Re-extraction gate proxy (handoff 53). POST /api/gates/commitment-extractions/
// {documentId}/retry — dry_run forecasts the conditions a re-extraction would
// draft and writes NOTHING; apply drafts them as PENDING rows for the existing
// list gate (approvals.conditions.decide). An approved term row is never
// overwritten by either mode, and the gate refuses any document that already
// has a succeeded attempt (conflict) — that refusal is the safety property, so
// it is surfaced as a reason rather than the control being hidden.
//
// THE PATH SEGMENT IS `commitment-extractions`, NOT `commitments`. The
// commitments directory already carries a [dealId] segment
// (app/api/portal/admin/commitments/[dealId]/upload), and two differently
// named dynamic segments at one level is a Next slug conflict. Do not tidy
// this into the shorter name; it will not build.
//
// THE REASON RULE DIFFERS BY MODE, deliberately. The gate's contract takes a
// reason on every call, but a dry run writes nothing and Michael has not
// decided anything yet when he presses preview — so the route supplies the
// DRY_RUN_REASON literal and the browser never invents one. Apply is a
// decision, so its reason must be TYPED: required, trimmed, never prefilled,
// and an over-long one is REFUSED rather than truncated. The human actor
// comes from the verified session the browser-minted token carries, never
// from a payload field (guardrail 19).

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { retryCommitmentExtraction, STATUS_BY_KIND } from '@/lib/gates'
import { isUuid } from '@/lib/commitment-terms'
import {
  DRY_RUN_REASON,
  REEXTRACT_MODES,
  checkReextractReason,
  type ReextractMode,
} from '@/lib/reextract'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { documentId: string } }) {
  const gate = await apiPermission('commitment.reextract')
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, kind: gate.status === 401 ? 'auth' : 'forbidden', message: gate.message },
      { status: gate.status },
    )
  }

  if (!isUuid(params.documentId)) {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: 'That commitment document id is not a valid id.' },
      { status: 422 },
    )
  }

  let body: any = null
  try {
    body = await req.json()
  } catch {
    // fall through to the mode check
  }

  const mode = body?.mode as ReextractMode
  if (!REEXTRACT_MODES.includes(mode)) {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: 'Mode must be dry_run or apply.' },
      { status: 422 },
    )
  }

  let reason = DRY_RUN_REASON
  if (mode === 'apply') {
    const check = checkReextractReason(body?.reason)
    if (!check.ok) {
      return NextResponse.json(
        { ok: false, kind: 'validation', message: check.message },
        { status: 422 },
      )
    }
    reason = check.reason
  }

  const result = await retryCommitmentExtraction(
    params.documentId,
    mode,
    reason,
    req.headers.get('x-gates-token'),
  )
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
