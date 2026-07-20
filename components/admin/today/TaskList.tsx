'use client'

// The interactive Today task rows. A checkbox completes the task in Zoho
// (the source of truth) through the gated write route; the tick is optimistic
// with a brief pending state and settles when Zoho confirms. For ~10 seconds
// after completion an undo reopens the task (restoring its prior status);
// after the window a router.refresh() drops the completed row (getTasksDue
// excludes Completed). A failed write reverts the tick and states why in one
// plain sentence — the portal never marks a task done that Zoho did not take.
// The checkbox is a real button, so Space and Enter complete it (this seeds
// the keyboard pattern; nothing more is built here). No lime here.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { RelativeChip } from '@/components/admin/today/ui'
import type { TodayTask } from '@/lib/today'

type RowState = 'open' | 'pending' | 'done' | 'reopening' | 'error'

const UNDO_MS = 10_000

async function postAction(taskId: string, action: 'complete' | 'reopen') {
  try {
    const res = await fetch(`/api/portal/admin/tasks/${encodeURIComponent(taskId)}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    const data = (await res.json().catch(() => null)) as { message?: string } | null
    return { ok: res.ok, message: data?.message ?? '' }
  } catch {
    return { ok: false, message: 'Network error, the task was not changed.' }
  }
}

function CheckBox({
  checked,
  busy,
  onToggle,
  label,
}: {
  checked: boolean
  busy: boolean
  onToggle: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={busy}
      onClick={onToggle}
      className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border motion-safe:transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-navy ${
        checked
          ? 'border-ink-navy bg-ink-navy text-white'
          : 'border-cool-400 bg-white hover:border-ink-navy'
      } ${busy ? 'opacity-50' : ''}`}
    >
      {checked ? (
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M3 8.5l3.2 3.2L13 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : busy ? (
        <span className="h-2 w-2 rounded-full bg-cool-400 motion-safe:animate-pulse" />
      ) : null}
    </button>
  )
}

function TaskRow({ task, todayYMD }: { task: TodayTask; todayYMD: string }) {
  const router = useRouter()
  const [state, setState] = useState<RowState>('open')
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => clearTimer, [clearTimer])

  const complete = useCallback(async () => {
    if (state !== 'open') return
    setError(null)
    setState('pending')
    const res = await postAction(task.id, 'complete')
    if (res.ok) {
      setState('done')
      // Settle to Zoho truth after the undo window: the completed task drops
      // from the due list on the next server read.
      timerRef.current = setTimeout(() => router.refresh(), UNDO_MS)
    } else {
      setState('open')
      setError(res.message || 'The task was not completed.')
    }
  }, [state, task.id, router])

  const reopen = useCallback(async () => {
    if (state !== 'done') return
    clearTimer()
    setError(null)
    setState('reopening')
    const res = await postAction(task.id, 'reopen')
    if (res.ok) {
      setState('open')
    } else {
      setState('done')
      setError(res.message || 'The task was not reopened.')
    }
  }, [state, task.id, clearTimer])

  const checked = state === 'done' || state === 'reopening'
  const busy = state === 'pending' || state === 'reopening'

  return (
    <li className="flex items-start gap-2.5">
      <CheckBox
        checked={checked}
        busy={busy}
        onToggle={state === 'done' ? reopen : complete}
        label={checked ? `Reopen ${task.subject}` : `Complete ${task.subject}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0">
            <a
              href={`https://crm.zoho.com/crm/org906105026/tab/Tasks/${task.id}`}
              target="_blank"
              rel="noreferrer"
              className={`font-ui text-sm leading-snug ${
                checked ? 'text-muted-2 line-through' : 'text-ink hover:text-ink-navy'
              }`}
            >
              {task.subject}
            </a>
            <div className="mt-0.5 flex items-center gap-2 font-ui text-[11px] text-muted">
              {task.priority ? <span>{task.priority} priority</span> : null}
              {task.roomHref && task.dealRef ? (
                <Link
                  href={task.roomHref}
                  className="font-semibold text-ink-navy underline decoration-hairline underline-offset-2 hover:decoration-ink-navy tabular-nums"
                >
                  {task.dealRef}
                </Link>
              ) : null}
            </div>
          </div>
          {state === 'done' ? (
            <button
              type="button"
              onClick={reopen}
              className="shrink-0 font-ui text-[11px] font-semibold text-ink-navy hover:underline underline-offset-2"
            >
              Undo
            </button>
          ) : task.dueDate ? (
            <div className="shrink-0">
              <RelativeChip targetYMD={task.dueDate} todayYMD={todayYMD} verb="due" />
            </div>
          ) : null}
        </div>
        {error ? <p className="mt-1 font-ui text-[11px] text-red-700">{error}</p> : null}
      </div>
    </li>
  )
}

export default function TaskList({ tasks, todayYMD }: { tasks: TodayTask[]; todayYMD: string }) {
  return (
    <ul className="space-y-2.5">
      {tasks.map(t => (
        <TaskRow key={t.id} task={t} todayYMD={todayYMD} />
      ))}
    </ul>
  )
}
