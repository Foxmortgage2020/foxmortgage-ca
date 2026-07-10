'use client'

// Conditions with decision controls (Session 4): Michael's one-by-one
// cleanup tool. Beside each undecided condition: satisfied, moot, waived,
// wired through the gates conditions endpoint. Same interaction contract
// as the approvals desk: two-tap confirm on every decision (all three are
// final), optimistic update with a reconcile refresh, 409 renders
// "Already decided". Moot and waived require a 5+ character note because
// they remove an obligation without evidence.

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { GATES_TOKEN_HEADER, useGatesToken } from '@/lib/gates-token'
import type { DealConditionRow } from '@/lib/underwriting'

const DECIDED_STATUSES = ['satisfied', 'waived']

const label = (s: string) => s.replace(/_/g, ' ')

function fmtShort(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`)
  if (isNaN(d.getTime())) return ymd
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric' })
}

function StatusChip({ status }: { status: string }) {
  const tone =
    status === 'satisfied' || status === 'waived'
      ? 'bg-green-100 text-green-700'
      : status === 'evidence_attached' || status === 'pre_checked' || status === 'submitted'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-gray-100 text-gray-600'
  return <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${tone}`}>{label(status)}</span>
}

export default function ConditionsPanel({
  conditions,
  canDecide,
  todayYMD,
}: {
  conditions: DealConditionRow[]
  canDecide: boolean
  todayYMD: string
}) {
  const router = useRouter()
  const [rows, setRows] = useState(conditions)
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  // Armed state carries its timestamp: the fire path checks elapsed time at
  // tap time because background tabs throttle timers, and a visually armed
  // button must never fire outside its window (found live in Session 4
  // testing: a throttled disarm let a stray tap decide a real condition).
  const [armed, setArmed] = useState<{ key: string; at: number } | null>(null)
  const [toast, setToast] = useState<{ tone: 'green' | 'amber'; text: string } | null>(null)
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mintGatesToken = useGatesToken()
  const ARM_WINDOW_MS = 4000

  useEffect(() => setRows(conditions), [conditions])
  useEffect(
    () => () => {
      if (armTimer.current) clearTimeout(armTimer.current)
      if (toastTimer.current) clearTimeout(toastTimer.current)
    },
    [],
  )

  const arm = useCallback((key: string) => {
    setArmed({ key, at: Date.now() })
    if (armTimer.current) clearTimeout(armTimer.current)
    armTimer.current = setTimeout(() => setArmed(null), 4000)
  }, [])

  const showToast = useCallback((tone: 'green' | 'amber', text: string) => {
    setToast({ tone, text })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 6000)
  }, [])

  const decide = async (cond: DealConditionRow, action: 'satisfied' | 'moot' | 'waived') => {
    const note = (notes[cond.id] ?? '').trim()
    if ((action === 'moot' || action === 'waived') && note.length < 5) {
      setErrors(e => ({
        ...e,
        [cond.id]: 'Moot and waived remove an obligation without evidence, so they need a note of at least 5 characters.',
      }))
      return
    }
    setArmed(null)
    setBusy(b => ({ ...b, [cond.id]: true }))
    setErrors(e => ({ ...e, [cond.id]: '' }))
    try {
      const token = await mintGatesToken()
      const res = await fetch(`/api/portal/admin/gates/conditions/${cond.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { [GATES_TOKEN_HEADER]: token } : {}) },
        body: JSON.stringify({ action, ...(note ? { note } : {}) }),
      })
      const json = await res.json().catch(() => null)
      if (json?.ok) {
        const statusTo = json.data?.statusTo ?? (action === 'satisfied' ? 'satisfied' : 'waived')
        setRows(rs => rs.map(r => (r.id === cond.id ? { ...r, status: statusTo } : r)))
        showToast(
          'green',
          `Condition ${cond.condNumber ? cond.condNumber + ' ' : ''}recorded as ${action}${
            action === 'moot' ? ' (stored as waived; the audit entry keeps the moot action)' : ''
          }.`,
        )
        router.refresh()
      } else if (json?.kind === 'conflict') {
        showToast('amber', 'Already decided. Refreshing the file.')
        router.refresh()
      } else {
        setErrors(e => ({ ...e, [cond.id]: json?.message ?? `Unexpected response (HTTP ${res.status}).` }))
      }
    } catch {
      setErrors(e => ({ ...e, [cond.id]: 'Could not reach the server. Check your connection and retry.' }))
    } finally {
      setBusy(b => ({ ...b, [cond.id]: false }))
    }
  }

  if (rows.length === 0) {
    return <p className="text-sm text-gray-400 font-body">No conditions recorded on this file.</p>
  }

  return (
    <div>
      {toast && (
        <div
          className={`mb-3 rounded-lg px-3 py-2 text-sm font-body border ${
            toast.tone === 'green'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          {toast.text}
        </div>
      )}
      <div className="space-y-3">
        {rows.map(c => {
          const decided = DECIDED_STATUSES.includes(c.status)
          const overdue = c.dueDate !== null && c.dueDate < todayYMD && !decided
          return (
            <div
              key={c.id}
              className={`border rounded-lg p-3 ${overdue ? 'border-red-200 bg-red-50' : 'border-gray-100'}`}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="text-sm font-body text-gray-700 min-w-0 flex-1">
                  {c.condNumber ? `${c.condNumber}. ` : ''}
                  {c.text}
                </p>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-body text-gray-500">
                <StatusChip status={c.status} />
                <span className="capitalize">{c.owner}</span>
                <span className={overdue ? 'text-red-700 font-semibold' : ''}>
                  {c.dueDate ? `due ${fmtShort(c.dueDate)}${overdue ? ' (overdue)' : ''}` : 'no due date'}
                </span>
                <span className="text-gray-400">source: {label(c.source)}</span>
              </div>
              {canDecide && !decided && (
                <>
                  <textarea
                    value={notes[c.id] ?? ''}
                    onChange={e => setNotes(n => ({ ...n, [c.id]: e.target.value }))}
                    maxLength={2000}
                    rows={1}
                    placeholder="Note (optional for satisfied; required, 5+ characters, for moot and waived)"
                    className="mt-2 w-full text-sm font-body border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-navy/50 resize-y"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(['satisfied', 'moot', 'waived'] as const).map(action => {
                      const key = `${c.id}:${action}`
                      const isArmed = armed?.key === key
                      return (
                        <button
                          key={action}
                          disabled={Boolean(busy[c.id])}
                          onClick={() =>
                            isArmed && armed && Date.now() - armed.at <= ARM_WINDOW_MS
                              ? void decide(c, action)
                              : arm(key)
                          }
                          className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold font-body transition-colors disabled:opacity-50 ${
                            isArmed
                              ? 'bg-navy text-white'
                              : action === 'satisfied'
                                ? 'bg-lime text-navy hover:bg-lime/80'
                                : 'bg-white border border-gray-300 text-navy hover:bg-gray-50'
                          }`}
                        >
                          {busy[c.id]
                            ? 'Working…'
                            : isArmed
                              ? 'Tap again to confirm'
                              : action === 'satisfied'
                                ? 'Satisfied'
                                : action === 'moot'
                                  ? 'Moot'
                                  : 'Waived'}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
              {errors[c.id] && <p className="mt-2 text-xs text-red-700 font-body">{errors[c.id]}</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
