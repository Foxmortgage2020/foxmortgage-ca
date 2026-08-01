'use client'

// The Today task list (A2, 2026-08-01) — Michael's daily operating surface,
// replacing the Zoho Tasks list he currently runs his day from.
//
// The four things this component exists to get right:
//
//   1. COUNTS ARE THE SERVER'S, NEVER rows.length. A1 shipped and fixed the
//      opposite defect (a count computed after a 200-row cap reported "200
//      overdue" when the truth was 276). Every heading here reads
//      `counts[bucket]`, and a bucket showing fewer rows than its count says
//      so on its face and offers the rest.
//   2. PAGING PAST THE CAP. `GET /api/tasks/today` caps each bucket at 200 and
//      takes no paging params. "Show the remaining N" REPLACES the overdue
//      list with a consistently-ordered paged read rather than appending to
//      it: the endpoint orders by due_date alone, so ties break arbitrarily,
//      and appending offset-200 onto that first page would duplicate some rows
//      and drop others. One ordering, whole list, deduped by id.
//   3. BULK TRIAGE. 276 overdue rows makes one-at-a-time unusable on day one.
//      Bulk complete and bulk dismiss call the EXISTING per-task endpoints in
//      sequence — no bulk endpoint was invented — so every row still gets its
//      own audit entry carrying the real human's identity. Progress is shown
//      while it runs and partial failure is reported honestly; a 409 counts as
//      already-done, not as a failure.
//   4. PHONE FIRST. He checks this between appointments. Touch targets are
//      44px, no action depends on hover, and the bucket counts are legible
//      without zooming.
//
// SINGLE-TAP on a row's Complete is deliberate, and a departure from the
// approvals desk's two-tap confirm. This is a task list, not a decision queue:
// two taps per row across 276 rows is the thing that makes a page get
// abandoned. Dismiss carries its own friction (a typed reason) and the bulk
// verbs confirm with their count before running.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GATES_TOKEN_HEADER, useGatesToken } from '@/lib/gates-token'
import type { TaskBucket, TaskRow, TasksTodayResponse } from '@/lib/tasks-shape'
import {
  BUCKET_LABELS,
  BUCKET_ORDER,
  bulkSummaryLine,
  bucketShortfall,
  deferPresets,
  dueLabel,
  isMachineWritten,
  isValidDismissReason,
  isValidDueDate,
  needsMore,
  OVERDUE_PAGE_ROWS,
  overdueDays,
  summarizeBulk,
  weekWindowLabel,
  type BulkOutcome,
} from '@/lib/today-tasks'

// Backstop on the "show the rest" loop. Far above any plausible bucket; a
// silent cap is exactly the bug this page exists to not repeat, so hitting it
// is surfaced rather than swallowed.
const MAX_OVERDUE_PAGES = 30

type PendingKind = 'complete' | 'defer' | 'dismiss'

interface RowPanel {
  taskId: string
  kind: 'defer' | 'dismiss'
}

export default function TasksToday({ canManage }: { canManage: boolean }) {
  const mintGatesToken = useGatesToken()
  const [view, setView] = useState<TasksTodayResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [bucket, setBucket] = useState<TaskBucket>('overdue')

  // Overdue rows loaded past the endpoint's cap. Null = the endpoint's own
  // (possibly capped) array is what is being shown.
  const [fullOverdue, setFullOverdue] = useState<TaskRow[] | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState<string | null>(null)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [panel, setPanel] = useState<RowPanel | null>(null)
  const [pending, setPending] = useState<Record<string, PendingKind>>({})
  const [rowError, setRowError] = useState<Record<string, string>>({})
  const [bulk, setBulk] = useState<{ done: number; total: number; verb: string } | null>(null)
  const [bulkResult, setBulkResult] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)

  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const load = useCallback(
    async (opts?: { keepFull?: boolean }) => {
      setLoading(true)
      setError(null)
      try {
        const token = await mintGatesToken()
        const res = await fetch('/api/portal/admin/tasks/today', {
          headers: token ? { [GATES_TOKEN_HEADER]: token } : undefined,
          cache: 'no-store',
        })
        const json = await res.json().catch(() => null)
        if (!mounted.current) return
        if (json?.ok) {
          setView(json.data as TasksTodayResponse)
          if (!opts?.keepFull) setFullOverdue(null)
        } else {
          setError(json?.message ?? `The task list did not load (HTTP ${res.status}).`)
        }
      } catch {
        if (mounted.current) setError('Could not reach the server. Check your connection and retry.')
      } finally {
        if (mounted.current) setLoading(false)
      }
    },
    [mintGatesToken],
  )

  useEffect(() => {
    void load()
  }, [load])

  // ── Rows for the active bucket ───────────────────────────────────────────
  const rows: TaskRow[] = useMemo(() => {
    if (!view) return []
    if (bucket === 'overdue' && fullOverdue) return fullOverdue
    return view.buckets[bucket] ?? []
  }, [view, bucket, fullOverdue])

  const counts = view?.counts
  const shortfall = counts ? bucketShortfall(counts[bucket] ?? 0, rows.length) : 0
  const showMore =
    view && counts ? needsMore(bucket, counts, rows.length, view.truncated) && shortfall > 0 : false

  // Selection is scoped to the visible bucket: switching tabs clears it, so a
  // bulk action can never reach a row that is not on screen.
  useEffect(() => {
    setSelected(new Set())
    setPanel(null)
    setBulkResult(null)
  }, [bucket])

  const selectedRows = useMemo(() => rows.filter(r => selected.has(r.id)), [rows, selected])

  // ── Load the whole overdue bucket ────────────────────────────────────────
  const loadRest = useCallback(async () => {
    if (!view) return
    setLoadingMore(true)
    setMoreError(null)
    const seen = new Map<string, TaskRow>()
    try {
      for (let page = 0; page < MAX_OVERDUE_PAGES; page++) {
        const res = await fetch(
          `/api/portal/admin/tasks/overdue?asOf=${encodeURIComponent(view.as_of)}&offset=${
            page * OVERDUE_PAGE_ROWS
          }`,
          { cache: 'no-store' },
        )
        const json = await res.json().catch(() => null)
        if (!json?.ok) {
          if (mounted.current) {
            setMoreError(json?.message ?? `The rest of the list did not load (HTTP ${res.status}).`)
          }
          return
        }
        for (const r of json.data.rows as TaskRow[]) seen.set(r.id, r)
        if (!json.data.hasMore) {
          if (mounted.current) setFullOverdue(Array.from(seen.values()))
          return
        }
        if (page === MAX_OVERDUE_PAGES - 1) {
          if (mounted.current) {
            setFullOverdue(Array.from(seen.values()))
            setMoreError(
              `Stopped at ${seen.size} rows (the page's own backstop). Some overdue tasks are still not shown.`,
            )
          }
        }
      }
    } catch {
      if (mounted.current) setMoreError('Could not reach the server. Retry in a moment.')
    } finally {
      if (mounted.current) setLoadingMore(false)
    }
  }, [view])

  // ── One write ────────────────────────────────────────────────────────────
  // Returns the outcome so the bulk runner can reuse the exact same path a
  // single row takes; there is one write implementation, not two.
  const runWrite = useCallback(
    async (
      taskId: string,
      kind: PendingKind,
      body: Record<string, unknown>,
    ): Promise<BulkOutcome> => {
      const token = await mintGatesToken()
      if (!token) {
        return {
          taskId,
          ok: false,
          alreadyDone: false,
          message: 'Your session did not produce a decision token. Sign in again and retry.',
        }
      }
      try {
        const res = await fetch(`/api/portal/admin/gates/tasks/${encodeURIComponent(taskId)}/${kind}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', [GATES_TOKEN_HEADER]: token },
          body: JSON.stringify(body),
        })
        const json = await res.json().catch(() => null)
        if (json?.ok) return { taskId, ok: true }
        return {
          taskId,
          ok: false,
          // 409 is the contract's already-decided, not an error.
          alreadyDone: res.status === 409,
          message: json?.message ?? `The write did not land (HTTP ${res.status}).`,
        }
      } catch {
        return {
          taskId,
          ok: false,
          alreadyDone: false,
          message: 'Could not reach the server. Retry in a moment.',
        }
      }
    },
    [mintGatesToken],
  )

  // Drop a decided row from the local list immediately, then reconcile against
  // the server. The count beside the heading comes from the refetch, so an
  // optimistic removal never leaves a count that disagrees with the list for
  // longer than one round trip.
  const dropRow = useCallback((taskId: string) => {
    setFullOverdue(prev => (prev ? prev.filter(r => r.id !== taskId) : prev))
    setView(prev => {
      if (!prev) return prev
      const buckets = { ...prev.buckets }
      const counts = { ...prev.counts }
      for (const b of BUCKET_ORDER) {
        const before = buckets[b].length
        buckets[b] = buckets[b].filter(r => r.id !== taskId)
        if (buckets[b].length !== before) {
          counts[b] = Math.max(0, counts[b] - 1)
          counts.open_total = Math.max(0, counts.open_total - 1)
        }
      }
      return { ...prev, buckets, counts }
    })
    setSelected(prev => {
      if (!prev.has(taskId)) return prev
      const next = new Set(prev)
      next.delete(taskId)
      return next
    })
  }, [])

  const act = useCallback(
    async (taskId: string, kind: PendingKind, body: Record<string, unknown>) => {
      setPending(p => ({ ...p, [taskId]: kind }))
      setRowError(e => {
        const { [taskId]: _drop, ...rest } = e
        return rest
      })
      const outcome = await runWrite(taskId, kind, body)
      if (!mounted.current) return
      setPending(p => {
        const { [taskId]: _drop, ...rest } = p
        return rest
      })
      if (outcome.ok) {
        dropRow(taskId)
        setPanel(null)
        setFlash(null)
        void load({ keepFull: fullOverdue !== null })
      } else if (outcome.alreadyDone) {
        // 409 is the contract's already-decided. The row IS gone; treating it
        // as an error would leave a decided task sitting on the list.
        dropRow(taskId)
        setPanel(null)
        setFlash('That one was already done.')
        void load({ keepFull: fullOverdue !== null })
      } else {
        setRowError(e => ({ ...e, [taskId]: outcome.message }))
      }
    },
    [runWrite, dropRow, load, fullOverdue],
  )

  // ── Bulk ─────────────────────────────────────────────────────────────────
  const runBulk = useCallback(
    async (kind: 'complete' | 'dismiss', body: Record<string, unknown>) => {
      const ids = selectedRows.map(r => r.id)
      if (ids.length === 0) return
      setBulkResult(null)
      setBulk({ done: 0, total: ids.length, verb: kind === 'complete' ? 'Completing' : 'Dismissing' })
      const outcomes: BulkOutcome[] = []
      for (const id of ids) {
        // Sequential on purpose: the per-task endpoints are the contract, and
        // firing 276 concurrent writes at them is how a rate limit turns a
        // clean run into a mixed one.
        const outcome = await runWrite(id, kind, body)
        outcomes.push(outcome)
        // Drop on success AND on 409 (already decided): both mean the row is
        // no longer open, so leaving it on screen would be the lie.
        if (outcome.ok || outcome.alreadyDone) dropRow(id)
        if (!mounted.current) return
        setBulk(b => (b ? { ...b, done: b.done + 1 } : b))
      }
      if (!mounted.current) return
      const summary = summarizeBulk(outcomes)
      setBulk(null)
      setBulkResult(bulkSummaryLine(summary, kind === 'complete' ? 'completed' : 'dismissed'))
      // Keep the per-row messages for anything that failed, so "3 could not be
      // completed" is followed by which three and why.
      setRowError(e => {
        const next = { ...e }
        for (const f of summary.failures) next[f.taskId] = f.message
        return next
      })
      setSelected(new Set())
      void load({ keepFull: fullOverdue !== null })
    },
    [selectedRows, runWrite, dropRow, load, fullOverdue],
  )

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading && !view) {
    return <p className="mt-6 text-sm text-cool-600">Loading the task list…</p>
  }
  if (error && !view) {
    return (
      <div className="mt-6 rounded-[9px] border border-cool-200 bg-white p-4">
        <p className="text-sm text-cool-700">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 min-h-[44px] rounded-[7px] bg-navy px-4 text-sm font-heading text-white"
        >
          Retry
        </button>
      </div>
    )
  }
  if (!view || !counts) return null

  return (
    <div className="mt-5">
      {/* As-of line. The dates are the SERVER'S, resolved in America/Toronto —
          the browser never recomputes "today" for this page. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-cool-600">
        <span className="tabular-nums">As of {view.as_of}</span>
        <span aria-hidden="true">·</span>
        <span>{view.timezone}</span>
        <span aria-hidden="true">·</span>
        <span className="tabular-nums">{counts.open_total} open</span>
        {canManage && (
          <button
            type="button"
            onClick={() => setCreating(c => !c)}
            className="ml-auto min-h-[44px] rounded-[7px] border border-navy px-4 text-sm font-heading font-semibold text-navy"
          >
            {creating ? 'Cancel' : '+ New task'}
          </button>
        )}
      </div>

      {creating && canManage && (
        <CreateTask
          asOf={view.as_of}
          onDone={() => {
            setCreating(false)
            void load({ keepFull: fullOverdue !== null })
          }}
          mintGatesToken={mintGatesToken}
        />
      )}

      {/* Bucket tabs. Counts are the server's true sizes. Horizontally
          scrollable so four chips never squeeze at 375px. */}
      <div className="mt-4 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-2" role="tablist" aria-label="Task buckets">
          {BUCKET_ORDER.map(b => {
            const active = b === bucket
            return (
              <button
                key={b}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setBucket(b)}
                className={`min-h-[44px] rounded-[7px] border px-4 text-sm font-heading ${
                  active
                    ? 'border-navy bg-navy text-white font-semibold'
                    : 'border-cool-200 bg-white text-cool-700'
                }`}
              >
                {BUCKET_LABELS[b]}{' '}
                <span className="tabular-nums font-semibold">{counts[b]}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* The rolling-window caveat, stated where the bucket is. Seven days from
          as_of, not a calendar week. */}
      {bucket === 'due_this_week' && (
        <p className="mt-3 text-xs text-cool-500">
          A rolling seven days: {weekWindowLabel(view.as_of, view.due_this_week_through)}. Not the
          calendar week.
        </p>
      )}

      {/* Honest truncation. The count says 276; this says how many arrived. */}
      {showMore && (
        <div className="mt-3 rounded-[9px] border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm text-amber-900 tabular-nums">
            Showing {rows.length} of {counts[bucket]}. The list endpoint caps a bucket at 200 rows.
          </p>
          <button
            type="button"
            onClick={() => void loadRest()}
            disabled={loadingMore}
            className="mt-2 min-h-[44px] rounded-[7px] bg-navy px-4 text-sm font-heading text-white disabled:opacity-60"
          >
            {loadingMore ? 'Loading…' : `Show the remaining ${shortfall}`}
          </button>
          {moreError && <p className="mt-2 text-sm text-red-700">{moreError}</p>}
        </div>
      )}

      {/* Bulk bar. Sticky at the bottom on a phone so it is reachable with a
          thumb after scrolling a long selection. */}
      {canManage && selected.size > 0 && (
        <BulkBar
          count={selected.size}
          running={bulk}
          onComplete={() => void runBulk('complete', {})}
          onDismiss={reason => void runBulk('dismiss', { reason })}
          onClear={() => setSelected(new Set())}
        />
      )}

      {bulkResult && (
        <p className="mt-3 rounded-[9px] border border-cool-200 bg-white p-3 text-sm text-cool-700">
          {bulkResult}
        </p>
      )}
      {flash && <p className="mt-3 text-sm text-cool-600">{flash}</p>}

      {/* Rows */}
      <div className="mt-4 space-y-2 pb-28">
        {rows.length === 0 && (
          <p className="rounded-[9px] border border-cool-200 bg-white p-4 text-sm text-cool-600">
            Nothing in {BUCKET_LABELS[bucket].toLowerCase()}.
          </p>
        )}
        {rows.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            asOf={view.as_of}
            canManage={canManage}
            selected={selected.has(task.id)}
            onSelect={checked =>
              setSelected(prev => {
                const next = new Set(prev)
                if (checked) next.add(task.id)
                else next.delete(task.id)
                return next
              })
            }
            pending={pending[task.id] ?? null}
            error={rowError[task.id] ?? null}
            panel={panel?.taskId === task.id ? panel.kind : null}
            onPanel={kind => setPanel(kind ? { taskId: task.id, kind } : null)}
            onComplete={() => void act(task.id, 'complete', {})}
            onDefer={date => void act(task.id, 'defer', { due_date: date })}
            onDismiss={reason => void act(task.id, 'dismiss', { reason })}
          />
        ))}
      </div>
    </div>
  )
}

// ─── One task ───────────────────────────────────────────────────────────────

function TaskCard({
  task,
  asOf,
  canManage,
  selected,
  onSelect,
  pending,
  error,
  panel,
  onPanel,
  onComplete,
  onDefer,
  onDismiss,
}: {
  task: TaskRow
  asOf: string
  canManage: boolean
  selected: boolean
  onSelect: (checked: boolean) => void
  pending: PendingKind | null
  error: string | null
  panel: 'defer' | 'dismiss' | null
  onPanel: (kind: 'defer' | 'dismiss' | null) => void
  onComplete: () => void
  onDefer: (date: string) => void
  onDismiss: (reason: string) => void
}) {
  const late = overdueDays(task.due_date, asOf)
  const due = dueLabel(task.due_date, asOf)
  const busy = pending !== null

  return (
    <div
      className={`rounded-[9px] border bg-white p-3 ${
        selected ? 'border-navy' : 'border-cool-200'
      }`}
      data-testid={`task-${task.id}`}
    >
      <div className="flex items-start gap-3">
        {canManage && (
          // 44px target around a 20px box: the checkbox is the bulk-select
          // affordance and has to be tappable without precision.
          <label className="-m-3 flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center p-3">
            <input
              type="checkbox"
              checked={selected}
              onChange={e => onSelect(e.target.checked)}
              className="h-5 w-5 accent-[#032133]"
              aria-label={`Select ${task.title}`}
            />
          </label>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-heading text-navy break-words">{task.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-cool-500">
            {due && (
              <span className={`tabular-nums ${late ? 'font-semibold text-red-700' : ''}`}>
                {late ? `${late} day${late === 1 ? '' : 's'} overdue` : `due ${due}`}
              </span>
            )}
            {!task.due_date && <span>no date</span>}
            <span className="capitalize">{task.priority}</span>
            {isMachineWritten(task) && (
              <span className="rounded-full bg-cool-100 px-2 py-0.5">machine-written</span>
            )}
            {task.deferred_from && (
              <span className="tabular-nums">deferred from {task.deferred_from}</span>
            )}
          </div>
          {task.body && (
            <p className="mt-1.5 line-clamp-3 text-sm text-cool-600 break-words">{task.body}</p>
          )}
        </div>
      </div>

      {canManage && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onComplete}
            disabled={busy}
            className="min-h-[44px] flex-1 rounded-[7px] bg-navy px-4 text-sm font-heading font-semibold text-white disabled:opacity-60 sm:flex-none"
          >
            {pending === 'complete' ? 'Completing…' : 'Complete'}
          </button>
          <button
            type="button"
            onClick={() => onPanel(panel === 'defer' ? null : 'defer')}
            disabled={busy}
            className="min-h-[44px] flex-1 rounded-[7px] border border-cool-300 px-4 text-sm font-heading text-cool-700 disabled:opacity-60 sm:flex-none"
          >
            {pending === 'defer' ? 'Deferring…' : 'Defer'}
          </button>
          <button
            type="button"
            onClick={() => onPanel(panel === 'dismiss' ? null : 'dismiss')}
            disabled={busy}
            className="min-h-[44px] flex-1 rounded-[7px] border border-cool-300 px-4 text-sm font-heading text-cool-700 disabled:opacity-60 sm:flex-none"
          >
            {pending === 'dismiss' ? 'Dismissing…' : 'Dismiss'}
          </button>
        </div>
      )}

      {panel === 'defer' && <DeferPanel asOf={asOf} onDefer={onDefer} />}
      {panel === 'dismiss' && <DismissPanel onDismiss={onDismiss} />}

      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  )
}

// ─── Defer ──────────────────────────────────────────────────────────────────
// A deferral needs a date, so it asks for one. Presets are computed from the
// server's as_of, never from the browser's clock.

function DeferPanel({ asOf, onDefer }: { asOf: string; onDefer: (date: string) => void }) {
  const [date, setDate] = useState('')
  const presets = deferPresets(asOf)
  return (
    <div className="mt-3 rounded-[7px] bg-cool-50 p-3">
      <p className="text-xs font-heading font-semibold uppercase tracking-wide text-cool-500">
        Defer to
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {presets.map(p => (
          <button
            key={p.date}
            type="button"
            onClick={() => onDefer(p.date)}
            className="min-h-[44px] rounded-[7px] border border-cool-300 bg-white px-3 text-sm text-cool-700"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="min-h-[44px] flex-1 rounded-[7px] border border-cool-300 px-3 text-sm"
          aria-label="Defer to a specific date"
        />
        <button
          type="button"
          onClick={() => onDefer(date)}
          disabled={!isValidDueDate(date)}
          className="min-h-[44px] rounded-[7px] bg-navy px-4 text-sm font-heading text-white disabled:opacity-40"
        >
          Defer
        </button>
      </div>
    </div>
  )
}

// ─── Dismiss ────────────────────────────────────────────────────────────────
// The reason is REQUIRED and is not a formality: dismissal is sticky across
// re-imports because Zoho cannot express it, and the import re-runs at flip
// time. This prompts rather than sending an empty string to satisfy a schema.

function DismissPanel({ onDismiss }: { onDismiss: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  const valid = isValidDismissReason(reason)
  return (
    <div className="mt-3 rounded-[7px] bg-cool-50 p-3">
      <label className="text-xs font-heading font-semibold uppercase tracking-wide text-cool-500">
        Why is this being dismissed?
      </label>
      <p className="mt-1 text-xs text-cool-500">
        Dismissal sticks across re-imports, so this reason is the only record of why the Zoho task is
        not on your list.
      </p>
      <textarea
        value={reason}
        onChange={e => setReason(e.target.value)}
        rows={2}
        className="mt-2 w-full rounded-[7px] border border-cool-300 p-2 text-sm"
        placeholder="Duplicate of the condition already tracked on the file"
      />
      <button
        type="button"
        onClick={() => onDismiss(reason)}
        disabled={!valid}
        className="mt-2 min-h-[44px] w-full rounded-[7px] bg-navy px-4 text-sm font-heading text-white disabled:opacity-40 sm:w-auto"
      >
        Dismiss
      </button>
    </div>
  )
}

// ─── Bulk bar ───────────────────────────────────────────────────────────────

function BulkBar({
  count,
  running,
  onComplete,
  onDismiss,
  onClear,
}: {
  count: number
  running: { done: number; total: number; verb: string } | null
  onComplete: () => void
  onDismiss: (reason: string) => void
  onClear: () => void
}) {
  const [asking, setAsking] = useState<null | 'complete' | 'dismiss'>(null)
  const [reason, setReason] = useState('')

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-cool-200 bg-white p-3 shadow-[0_-2px_10px_rgba(3,33,51,0.08)] sm:sticky sm:bottom-4 sm:mt-4 sm:rounded-[9px] sm:border">
      {running ? (
        <div>
          <p className="text-sm text-cool-700 tabular-nums">
            {running.verb} {running.done} of {running.total}…
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-cool-100">
            <div
              className="h-full bg-navy motion-safe:transition-all"
              style={{ width: `${Math.round((running.done / Math.max(1, running.total)) * 100)}%` }}
            />
          </div>
        </div>
      ) : asking === 'dismiss' ? (
        <div>
          <label className="text-sm font-heading text-navy">
            Reason for dismissing {count} task{count === 1 ? '' : 's'}
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={2}
            className="mt-2 w-full rounded-[7px] border border-cool-300 p-2 text-sm"
            placeholder="Closed in Zoho before the import"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                onDismiss(reason)
                setAsking(null)
                setReason('')
              }}
              disabled={!isValidDismissReason(reason)}
              className="min-h-[44px] flex-1 rounded-[7px] bg-navy px-4 text-sm font-heading text-white disabled:opacity-40"
            >
              Dismiss {count}
            </button>
            <button
              type="button"
              onClick={() => setAsking(null)}
              className="min-h-[44px] rounded-[7px] border border-cool-300 px-4 text-sm text-cool-700"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : asking === 'complete' ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex-1 text-sm text-cool-700 tabular-nums">
            Complete {count} task{count === 1 ? '' : 's'}?
          </p>
          <button
            type="button"
            onClick={() => {
              onComplete()
              setAsking(null)
            }}
            className="min-h-[44px] flex-1 rounded-[7px] bg-navy px-4 text-sm font-heading font-semibold text-white sm:flex-none"
          >
            Yes, complete {count}
          </button>
          <button
            type="button"
            onClick={() => setAsking(null)}
            className="min-h-[44px] rounded-[7px] border border-cool-300 px-4 text-sm text-cool-700"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex-1 text-sm font-heading text-navy tabular-nums">{count} selected</p>
          <button
            type="button"
            onClick={() => setAsking('complete')}
            className="min-h-[44px] rounded-[7px] bg-navy px-4 text-sm font-heading font-semibold text-white"
          >
            Complete
          </button>
          <button
            type="button"
            onClick={() => setAsking('dismiss')}
            className="min-h-[44px] rounded-[7px] border border-cool-300 px-4 text-sm text-cool-700"
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={onClear}
            className="min-h-[44px] rounded-[7px] px-3 text-sm text-cool-600"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Create ─────────────────────────────────────────────────────────────────

function CreateTask({
  asOf,
  onDone,
  mintGatesToken,
}: {
  asOf: string
  onDone: () => void
  mintGatesToken: () => Promise<string | null>
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [dueDate, setDueDate] = useState(asOf)
  const [priority, setPriority] = useState('normal')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      const token = await mintGatesToken()
      const res = await fetch('/api/portal/admin/gates/tasks/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { [GATES_TOKEN_HEADER]: token } : {}),
        },
        body: JSON.stringify({
          title,
          body: body || undefined,
          due_date: dueDate || undefined,
          priority,
        }),
      })
      const json = await res.json().catch(() => null)
      if (json?.ok) onDone()
      else setError(json?.message ?? `The task was not created (HTTP ${res.status}).`)
    } catch {
      setError('Could not reach the server. Retry in a moment.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 rounded-[9px] border border-cool-200 bg-white p-4">
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="What needs doing"
        className="min-h-[44px] w-full rounded-[7px] border border-cool-300 px-3 text-sm"
        aria-label="Task title"
      />
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        rows={2}
        placeholder="Any detail (optional)"
        className="mt-2 w-full rounded-[7px] border border-cool-300 p-2 text-sm"
        aria-label="Task detail"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          className="min-h-[44px] flex-1 rounded-[7px] border border-cool-300 px-3 text-sm"
          aria-label="Due date"
        />
        <select
          value={priority}
          onChange={e => setPriority(e.target.value)}
          className="min-h-[44px] flex-1 rounded-[7px] border border-cool-300 px-3 text-sm"
          aria-label="Priority"
        >
          <option value="highest">Highest</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
          <option value="lowest">Lowest</option>
        </select>
      </div>
      <button
        type="button"
        onClick={() => void submit()}
        disabled={saving || title.trim().length === 0}
        className="mt-3 min-h-[44px] w-full rounded-[7px] bg-navy px-4 text-sm font-heading font-semibold text-white disabled:opacity-40 sm:w-auto"
      >
        {saving ? 'Creating…' : 'Create task'}
      </button>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  )
}
