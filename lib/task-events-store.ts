// FOXCA task-action-events store client. Server-only: talks to the
// foxmortgage-ca Supabase project through the narrow security-definer
// functions from migration 20260720120000; the key holds no direct table
// privileges (RLS on, grants revoked) and every function requires the
// operator secret. Twin of lib/renewals-store.ts. Records who/when for every
// complete/reopen fired from the Tasks card, alongside the Zoho write. The
// task's own truth stays in Zoho; nothing here is task state, only an
// append-only audit trail. Nothing deletes.

import { foxcaOperatorSecret } from '@/lib/foxca-secret'

export type TaskStoreResult<T> =
  | { configured: false }
  | { configured: true; ok: true; data: T }
  | { configured: true; ok: false; error: string }

function foxcaEnv(): { url: string; key: string } | null {
  const url = process.env.FOXCA_SUPABASE_URL
  const key = process.env.FOXCA_SUPABASE_KEY
  if (!url || !key) return null
  return { url: url.replace(/\/+$/, '').replace(/\/rest\/v1$/, ''), key }
}

export function taskEventsStoreConfigured(): boolean {
  return foxcaEnv() !== null
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<TaskStoreResult<T>> {
  const env = foxcaEnv()
  if (!env) return { configured: false }
  const started = Date.now()
  try {
    const res = await fetch(`${env.url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: env.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      cache: 'no-store',
    })
    const ms = Date.now() - started
    if (!res.ok) {
      console.error(`[task-events-store] ${fn} HTTP ${res.status} ms=${ms}`)
      const body = (await res.json().catch(() => null)) as { message?: string } | null
      return {
        configured: true,
        ok: false,
        error: body?.message ? String(body.message).slice(0, 200) : `Store query failed (HTTP ${res.status})`,
      }
    }
    const data = (await res.json().catch(() => null)) as T
    console.log(`[task-events-store] ${fn} ok ms=${ms}`)
    return { configured: true, ok: true, data }
  } catch {
    console.error(`[task-events-store] ${fn} unreachable ms=${Date.now() - started}`)
    return { configured: true, ok: false, error: 'Task events store unreachable' }
  }
}

export interface TaskActionEvent {
  id: string
  taskId: string
  subject: string | null
  action: string
  actingEmail: string
  prevStatus: string | null
  newStatus: string | null
  result: string
  createdAt: string
}

function mapRow(r: any): TaskActionEvent {
  return {
    id: r.id,
    taskId: r.task_id,
    subject: r.subject ?? null,
    action: r.action,
    actingEmail: r.acting_email,
    prevStatus: r.prev_status ?? null,
    newStatus: r.new_status ?? null,
    result: r.result,
    createdAt: r.created_at,
  }
}

export async function recordTaskAction(input: {
  taskId: string
  subject: string | null
  action: 'complete' | 'reopen'
  actingEmail: string
  prevStatus: string | null
  newStatus: string | null
  result: string
}): Promise<TaskStoreResult<string>> {
  return rpc<string>('task_action_record', {
    p_task_id: input.taskId,
    p_subject: input.subject,
    p_action: input.action,
    p_acting_email: input.actingEmail,
    p_prev_status: input.prevStatus,
    p_new_status: input.newStatus,
    p_result: input.result,
    p_operator_secret: foxcaOperatorSecret(),
  })
}

export async function taskActionsForTask(taskId: string): Promise<TaskStoreResult<TaskActionEvent[]>> {
  const res = await rpc<any[]>('task_action_events_for_task', {
    p_task_id: taskId,
    p_operator_secret: foxcaOperatorSecret(),
  })
  if (!res.configured || !res.ok) return res as TaskStoreResult<TaskActionEvent[]>
  return { configured: true, ok: true, data: (Array.isArray(res.data) ? res.data : []).map(mapRow) }
}

export async function recentTaskActions(limit = 50): Promise<TaskStoreResult<TaskActionEvent[]>> {
  const res = await rpc<any[]>('task_action_events_recent', {
    p_limit: limit,
    p_operator_secret: foxcaOperatorSecret(),
  })
  if (!res.configured || !res.ok) return res as TaskStoreResult<TaskActionEvent[]>
  return { configured: true, ok: true, data: (Array.isArray(res.data) ? res.data : []).map(mapRow) }
}
