// Remove a condition from the working checklist (2026-07-14). The workbench
// supersedes it with the reason — never a hard delete (guardrail 5) — and it
// disappears from the checklist. A 5+ character reason is required. POST-only.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { removeCondition, STATUS_BY_KIND } from '@/lib/gates'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gate = await apiPermission('approvals.conditions.decide')
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
    // fall through to validation
  }
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
  if (reason.length < 5) {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: 'Removing a condition needs a reason of at least 5 characters (it is superseded, never deleted).' },
      { status: 422 },
    )
  }
  const result = await removeCondition(params.id, reason, req.headers.get('x-gates-token'))
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
