// Rate sheet gate decision proxy. Sheet-level decisions only, matching the
// contract; per-quote spot dispositions stay CLI-only.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import {
  decideRateSheet,
  RATE_SHEET_ACTIONS,
  STATUS_BY_KIND,
  type RateSheetAction,
} from '@/lib/gates'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gate = await apiPermission('approvals.ratesheet.decide')
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, kind: gate.status === 401 ? 'auth' : 'forbidden', message: gate.message },
      { status: gate.status },
    )
  }
  let body: any = null
  try {
    body = await req.json()
  } catch {
    // fall through to the action check
  }
  const action = body?.action as RateSheetAction
  if (!RATE_SHEET_ACTIONS.includes(action)) {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: 'Action must be approve or reject.' },
      { status: 422 },
    )
  }
  const note = typeof body?.note === 'string' ? body.note : undefined
  const result = await decideRateSheet(params.id, action, note)
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
