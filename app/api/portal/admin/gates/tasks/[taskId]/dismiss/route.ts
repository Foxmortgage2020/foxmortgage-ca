// POST /api/portal/admin/gates/tasks/[taskId]/dismiss (A2).
// Gated on tasks.manage (admin only), then again by the workbench, which is
// HUMAN_ONLY on tasks.dismissed.
//
// THE REASON IS REQUIRED (min 3 characters) and it is not a note. Dismissal is
// STICKY across re-imports because Zoho cannot express it — the import re-runs
// at flip time, and the reason is the only record of why a still-open Zoho task
// is not on Michael's list. Sending an empty string to satisfy a schema would
// throw that away, so the UI prompts and this route refuses.
//
// Writes nothing to Zoho.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { dismissTask, STATUS_BY_KIND } from '@/lib/gates'
import { DISMISS_REASON_MIN, isValidDismissReason } from '@/lib/today-tasks'
import { DemoWriteBlocked } from '@/lib/demo'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { taskId: string } }) {
  const gate = await apiPermission('tasks.manage')
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
  const reason = typeof body?.reason === 'string' ? body.reason : ''
  if (!isValidDismissReason(reason)) {
    return NextResponse.json(
      {
        ok: false,
        kind: 'validation',
        message: `Dismissing a task is sticky across re-imports, so it needs a reason of at least ${DISMISS_REASON_MIN} characters.`,
      },
      { status: 422 },
    )
  }
  try {
    const result = await dismissTask(params.taskId, reason, req.headers.get('x-gates-token'))
    return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
  } catch (err) {
    if (err instanceof DemoWriteBlocked) {
      return NextResponse.json(
        { ok: false, kind: 'forbidden', message: 'Demo mode is read-only.' },
        { status: 403 },
      )
    }
    throw err
  }
}
