// Statement gate decision proxy. The browser posts here; this handler
// checks the authority matrix, then forwards through lib/gates.ts (the
// only Gates API caller) with a fresh gates-template token for the
// signed-in user. Behind Clerk middleware; publicRoutes untouched.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import {
  decideStatement,
  STATEMENT_ACTIONS,
  STATUS_BY_KIND,
  type StatementAction,
} from '@/lib/gates'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gate = await apiPermission('approvals.statement.decide')
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
  const action = body?.action as StatementAction
  if (!STATEMENT_ACTIONS.includes(action)) {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: 'Action must be approve, hold, or reject.' },
      { status: 422 },
    )
  }
  const note = typeof body?.note === 'string' ? body.note : undefined
  const result = await decideStatement(params.id, action, req.headers.get('x-gates-token'), note)
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
