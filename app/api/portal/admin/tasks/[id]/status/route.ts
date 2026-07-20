// POST /api/portal/admin/tasks/[id]/status — the ONLY path from the Today
// Tasks card to a Zoho write. Gated by tasks.complete (admin). A verified
// Clerk admin session is the sole way in; there is NO machine path to this
// write. The client sends only an enumerated action ('complete' | 'reopen')
// and the task id; the server owns every value it writes. Zoho stays the
// source of truth — the portal never keeps task state that can drift. Who and
// when are recorded to the FOXCA task_action_events audit alongside the write.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { isTaskAction, reopenTargetFrom } from '@/lib/tasks'
import { getZohoTask, setZohoTaskStatus } from '@/lib/zoho-admin'
import { recordTaskAction, taskActionsForTask } from '@/lib/task-events-store'
import { isDemoMode } from '@/lib/demo'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gate = await apiPermission('tasks.complete')
  if (!gate.ok) {
    return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  }

  // Demo is read-only. This check is FIRST, before any Zoho read or write, so
  // demo never touches Zoho and the block is provable.
  if (isDemoMode()) {
    return NextResponse.json(
      { ok: false, message: 'Demo mode is read-only, task changes are disabled.' },
      { status: 403 },
    )
  }

  let body: { action?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, message: 'Malformed request.' }, { status: 400 })
  }
  const action = body.action
  if (!isTaskAction(action)) {
    return NextResponse.json({ ok: false, message: 'Unknown task action.' }, { status: 422 })
  }
  const taskId = params.id

  // Read the current task for the audit prior status (and the subject). Never
  // fatal — the write is the source of truth.
  let current: Awaited<ReturnType<typeof getZohoTask>> = null
  try {
    current = await getZohoTask(taskId)
  } catch {
    current = null
  }
  const subject = current?.subject ?? null

  if (action === 'complete') {
    // Idempotent: already complete needs no write.
    if (current?.status === 'Completed') {
      return NextResponse.json({ ok: true, action, status: 'Completed', already: true })
    }
    const prevStatus = current?.status ?? null
    try {
      await setZohoTaskStatus(taskId, 'Completed')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Zoho write failed'
      await recordTaskAction({
        taskId,
        subject,
        action,
        actingEmail: gate.user.email,
        prevStatus,
        newStatus: 'Completed',
        result: `failed: ${message}`.slice(0, 200),
      }).catch(() => {})
      return NextResponse.json(
        { ok: false, message: `The write did not land: ${message}.` },
        { status: 502 },
      )
    }
    // The Zoho write is the source of truth and it landed; the audit is
    // best-effort. Never report a completed task as failed over an audit hiccup.
    try {
      const recorded = await recordTaskAction({
        taskId,
        subject,
        action,
        actingEmail: gate.user.email,
        prevStatus,
        newStatus: 'Completed',
        result: 'ok',
      })
      if (recorded.configured && !recorded.ok) {
        console.error('[tasks] audit record failed after complete:', recorded.error)
      }
    } catch (e) {
      console.error('[tasks] audit record threw after complete:', e)
    }
    return NextResponse.json({ ok: true, action, status: 'Completed' })
  }

  // action === 'reopen': restore the status the most recent complete recorded.
  let target = 'Not Started'
  try {
    const events = await taskActionsForTask(taskId)
    if (events.configured && events.ok) target = reopenTargetFrom(events.data)
  } catch {
    // best-effort; target stays the safe default
  }
  const prevStatus = current?.status ?? 'Completed'
  try {
    await setZohoTaskStatus(taskId, target)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Zoho write failed'
    await recordTaskAction({
      taskId,
      subject,
      action,
      actingEmail: gate.user.email,
      prevStatus,
      newStatus: target,
      result: `failed: ${message}`.slice(0, 200),
    }).catch(() => {})
    return NextResponse.json(
      { ok: false, message: `The write did not land: ${message}.` },
      { status: 502 },
    )
  }
  try {
    const recorded = await recordTaskAction({
      taskId,
      subject,
      action,
      actingEmail: gate.user.email,
      prevStatus,
      newStatus: target,
      result: 'ok',
    })
    if (recorded.configured && !recorded.ok) {
      console.error('[tasks] audit record failed after reopen:', recorded.error)
    }
  } catch (e) {
    console.error('[tasks] audit record threw after reopen:', e)
  }
  return NextResponse.json({ ok: true, action, status: target })
}
