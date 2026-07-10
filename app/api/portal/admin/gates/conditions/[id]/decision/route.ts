// Condition decision proxy (Session 4). Vocabulary is the contract's:
// satisfied, moot, waived. Moot records as status waived with the action
// preserved in the audit detail; waived and moot need a 5+ character note
// (mirrored here so garbage never burns a token round trip).

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import {
  CONDITION_ACTIONS,
  CONDITION_NOTE_REQUIRED,
  decideCondition,
  STATUS_BY_KIND,
  type ConditionAction,
} from '@/lib/gates'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gate = await apiPermission('conditions.decide')
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
  const action = body?.action as ConditionAction
  if (!CONDITION_ACTIONS.includes(action)) {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: 'Action must be satisfied, moot, or waived.' },
      { status: 422 },
    )
  }
  const note = typeof body?.note === 'string' ? body.note : undefined
  if (CONDITION_NOTE_REQUIRED.includes(action) && (!note || note.trim().length < 5)) {
    return NextResponse.json(
      {
        ok: false,
        kind: 'validation',
        message: 'Waived and moot remove an obligation without evidence, so they need a note of at least 5 characters.',
      },
      { status: 422 },
    )
  }
  const result = await decideCondition(params.id, action, req.headers.get('x-gates-token'), note)
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
