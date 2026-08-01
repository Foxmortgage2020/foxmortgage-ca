// POST /api/portal/admin/gates/tasks/[taskId]/complete (A2).
// Gated on tasks.manage (admin only), then again by the workbench, which also
// refuses any non-human actor first (tasks.completed is HUMAN_ONLY: completing
// a task is Michael saying something about his own work, and a cron that
// "tidied up" would be indistinguishable in the record from him doing it).
//
// 409 means already completed or dismissed — the contract's already-decided,
// surfaced as such and not as an error. Native only; writes nothing to Zoho.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { completeTask, STATUS_BY_KIND } from '@/lib/gates'
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
    // note is optional; a bodyless POST is valid
  }
  try {
    const result = await completeTask(
      params.taskId,
      req.headers.get('x-gates-token'),
      typeof body?.note === 'string' ? body.note : undefined,
    )
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
