// POST /api/portal/admin/gates/tasks/[taskId]/defer (A2).
// Gated on tasks.manage (admin only), then again by the workbench, which is
// HUMAN_ONLY on tasks.deferred. The old date is kept in deferred_from there,
// so a deferral never erases what the task originally promised.
//
// due_date is REQUIRED and must be YYYY-MM-DD. 409 covers a no-op (deferring
// to the date already on the row) and a non-open task. Writes nothing to Zoho.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { deferTask, STATUS_BY_KIND } from '@/lib/gates'
import { isValidDueDate } from '@/lib/today-tasks'
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
  const dueDate = typeof body?.due_date === 'string' ? body.due_date : ''
  if (!isValidDueDate(dueDate)) {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: 'A deferral needs a real date (YYYY-MM-DD).' },
      { status: 422 },
    )
  }
  try {
    const result = await deferTask(
      params.taskId,
      dueDate,
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
