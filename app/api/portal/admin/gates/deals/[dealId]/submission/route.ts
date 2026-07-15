// Set/clear a submission field Finmo does not hold — target lender, insured
// status, or the rate override (finmo-substrate session, 2026-07-15). POST-only;
// permission-gated (submission.set); forwards the browser-minted gates token.
// Human-only on the workbench side (guardrail 19). Demo-refused.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { isDemoMode } from '@/lib/demo'
import { setSubmissionField, STATUS_BY_KIND, type SubmissionAction } from '@/lib/gates'

export const dynamic = 'force-dynamic'

const ACTIONS = new Set<SubmissionAction>([
  'set_target_lender', 'clear_target_lender',
  'set_insured_status', 'clear_insured_status',
  'set_rate_override', 'clear_rate_override',
])

export async function POST(req: Request, { params }: { params: { dealId: string } }) {
  const gate = await apiPermission('submission.set')
  if (!gate.ok) {
    return NextResponse.json({ ok: false, kind: gate.status === 401 ? 'auth' : 'forbidden', message: gate.message }, { status: gate.status })
  }
  if (isDemoMode()) {
    return NextResponse.json({ ok: false, kind: 'forbidden', message: 'Demo mode is read-only.' }, { status: 403 })
  }
  let body: any = null
  try { body = await req.json() } catch { /* validated below */ }
  const action = body?.action as SubmissionAction
  if (!ACTIONS.has(action)) {
    return NextResponse.json({ ok: false, kind: 'validation', message: 'Unknown submission action.' }, { status: 422 })
  }
  const value = typeof body?.value === 'string' || typeof body?.value === 'number' ? body.value : null
  const note = typeof body?.note === 'string' ? body.note : null
  const result = await setSubmissionField(params.dealId, action, value, note, req.headers.get('x-gates-token'))
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
