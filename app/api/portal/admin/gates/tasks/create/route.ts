// POST /api/portal/admin/gates/tasks/create — the native task create proxy
// (A2). Gated on tasks.manage (admin only), then again by the workbench.
//
// NATIVE ONLY. This writes nothing to Zoho. Zoho Tasks remain Michael's
// operating list until he declares the flip; a task created here lives in the
// workbench store and nowhere else.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { createTask, STATUS_BY_KIND, TASK_PRIORITIES, type TaskPriority } from '@/lib/gates'
import { isValidDueDate, isValidTitle } from '@/lib/today-tasks'
import { DemoWriteBlocked } from '@/lib/demo'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
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

  const title = typeof body?.title === 'string' ? body.title : ''
  if (!isValidTitle(title)) {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: 'A task needs a title.' },
      { status: 422 },
    )
  }
  const dueDate = typeof body?.due_date === 'string' && body.due_date ? body.due_date : undefined
  if (dueDate && !isValidDueDate(dueDate)) {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: 'The due date must be a real date (YYYY-MM-DD).' },
      { status: 422 },
    )
  }
  const priority =
    typeof body?.priority === 'string' && TASK_PRIORITIES.includes(body.priority as TaskPriority)
      ? (body.priority as TaskPriority)
      : undefined
  // Half a link is a 422 server-side; refuse it here so the message names the
  // actual problem instead of arriving as a schema error.
  const linkedModule = typeof body?.linked_module === 'string' ? body.linked_module : undefined
  const linkedZohoId = typeof body?.linked_zoho_id === 'string' ? body.linked_zoho_id : undefined
  if (Boolean(linkedModule) !== Boolean(linkedZohoId)) {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: 'A link needs both a module and a record id.' },
      { status: 422 },
    )
  }

  try {
    const result = await createTask(
      {
        title,
        body: typeof body?.body === 'string' ? body.body : undefined,
        due_date: dueDate,
        priority,
        linked_module: linkedModule,
        linked_zoho_id: linkedZohoId,
        note: typeof body?.note === 'string' ? body.note : undefined,
      },
      req.headers.get('x-gates-token'),
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
