'use client'

// Client lender constraints (Part 2): the per-client rules a rate sheet never
// knows — a prior bad experience, an existing banking relationship, a refusal
// to deal with an institution. Recorded here on the deal room, keyed to a
// stable per-client key (Zoho potential id, or the file ref when none), so the
// constraint follows the client onto the Rates scenario and every other
// surface. The reason is the point, so a reason is required on every one.
//
// Constraints never override structural eligibility. applyConstraints (the
// backend model) runs over a list province + program eligibility has already
// filtered, so a required-but-ineligible lender yields an honest empty state,
// never a wrong result. That line is stated on the card.
//
// Two-tap confirm on add and on retire, matching the approvals desk and the
// conditions panel. Nothing deletes: retiring a constraint moves it to the
// history, retained with who and when.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CONSTRAINT_TYPES,
  CONSTRAINT_LABEL,
  CONSTRAINT_HELP,
  activeConstraints,
  type Constraint,
  type ConstraintType,
} from '@/lib/constraints'

const ARM_WINDOW_MS = 4000

function fmtWhen(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('en-CA', {
    timeZone: 'America/Toronto',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function TypeChip({ type }: { type: ConstraintType }) {
  const tone =
    type === 'excluded'
      ? 'bg-red-100 text-red-700'
      : type === 'required'
        ? 'bg-navy/10 text-navy'
        : 'bg-lime/25 text-navy'
  return (
    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${tone}`}>
      {CONSTRAINT_LABEL[type]}
    </span>
  )
}

export default function ClientConstraints({
  clientKey,
  canManage,
}: {
  clientKey: string
  canManage: boolean
}) {
  const router = useRouter()
  const [all, setAll] = useState<Constraint[]>([])
  const [configured, setConfigured] = useState(true)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Add form
  const [lenderSlug, setLenderSlug] = useState('')
  const [lenderLabel, setLenderLabel] = useState('')
  const [type, setType] = useState<ConstraintType | ''>('')
  const [reason, setReason] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [armed, setArmed] = useState<{ key: string; at: number } | null>(null)
  const [toast, setToast] = useState<{ tone: 'green' | 'amber'; text: string } | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/portal/admin/constraints?client=${encodeURIComponent(clientKey)}`)
      const json = await res.json().catch(() => null)
      if (json?.ok) {
        setAll(Array.isArray(json.constraints) ? json.constraints : [])
        setConfigured(json.configured !== false)
      } else {
        setLoadError(json?.message ?? `Could not load constraints (HTTP ${res.status}).`)
      }
    } catch {
      setLoadError('Could not reach the server. Reload to retry.')
    } finally {
      setLoading(false)
    }
  }, [clientKey])

  useEffect(() => {
    void load()
  }, [load])
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
    armTimer.current = setTimeout(() => setArmed(null), ARM_WINDOW_MS)
  }, [])

  const showToast = useCallback((tone: 'green' | 'amber', text: string) => {
    setToast({ tone, text })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 6000)
  }, [])

  const validateAdd = (): string | null => {
    if (!type) return 'Choose a constraint type.'
    if (!lenderSlug.trim()) return 'A lender is required.'
    if (reason.trim().length < 4) return 'A reason is required (the reason is the point). At least 4 characters.'
    return null
  }

  const armAdd = () => {
    const problem = validateAdd()
    if (problem) {
      setFormError(problem)
      setArmed(null)
      return
    }
    setFormError(null)
    arm('add')
  }

  const submitAdd = async () => {
    const problem = validateAdd()
    if (problem) {
      setFormError(problem)
      setArmed(null)
      return
    }
    setArmed(null)
    setBusyKey('add')
    setFormError(null)
    try {
      const res = await fetch('/api/portal/admin/constraints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientKey,
          lenderSlug: lenderSlug.trim(),
          lenderLabel: lenderLabel.trim() || null,
          type,
          reason: reason.trim(),
        }),
      })
      const json = await res.json().catch(() => null)
      if (json?.ok) {
        setLenderSlug('')
        setLenderLabel('')
        setType('')
        setReason('')
        showToast('green', 'Constraint recorded.')
        await load()
        router.refresh()
      } else {
        setFormError(json?.message ?? `Could not save the constraint (HTTP ${res.status}).`)
      }
    } catch {
      setFormError('Could not reach the server. Check your connection and retry.')
    } finally {
      setBusyKey(null)
    }
  }

  const retire = async (c: Constraint) => {
    setArmed(null)
    setBusyKey(`retire:${c.id}`)
    try {
      const res = await fetch('/api/portal/admin/constraints/retire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id }),
      })
      const json = await res.json().catch(() => null)
      if (json?.ok) {
        showToast('green', 'Constraint retired. It stays in the history.')
        await load()
        router.refresh()
      } else {
        showToast('amber', json?.message ?? `Could not retire the constraint (HTTP ${res.status}).`)
      }
    } catch {
      showToast('amber', 'Could not reach the server. Check your connection and retry.')
    } finally {
      setBusyKey(null)
    }
  }

  const active = activeConstraints(all)
  const retired = all.filter(c => c.retiredAt != null)

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5" data-testid="client-constraints">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading text-navy font-bold text-base">Client lender constraints</h2>
        {active.length > 0 && (
          <span className="text-xs font-body text-gray-500">
            {active.length} active
          </span>
        )}
      </div>

      <p className="text-xs text-gray-500 font-body mb-3">
        Rules a rate sheet never knows: a prior experience, a banking relationship, a lender this
        client will not use. Each one carries the reason. They narrow the eligible list and never
        override it, so a required lender that cannot do the deal finds an honest empty state, not a
        wrong one.
      </p>

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

      {loading ? (
        <p className="text-sm text-gray-400 font-body">Loading constraints…</p>
      ) : loadError ? (
        <p className="text-sm text-red-700 font-body">{loadError}</p>
      ) : !configured ? (
        <p className="text-sm text-gray-400 font-body">
          The constraints store is not connected. When it is, this client&rsquo;s lender rules render
          here.
        </p>
      ) : (
        <>
          {/* Active constraints */}
          {active.length === 0 ? (
            <p className="text-sm text-gray-400 font-body">No lender constraints recorded for this client.</p>
          ) : (
            <div className="space-y-2">
              {active.map(c => {
                const retireKey = `retire:${c.id}`
                const isArmed = armed?.key === retireKey
                const isBusy = busyKey === retireKey
                return (
                  <div key={c.id} className="border border-gray-100 rounded-lg p-3" data-testid={`constraint-${c.id}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <TypeChip type={c.type} />
                      <span className="text-sm font-body font-semibold text-navy">
                        {c.lenderLabel || c.lenderSlug}
                      </span>
                      {c.lenderLabel && (
                        <span className="text-[11px] text-gray-400 font-body">{c.lenderSlug}</span>
                      )}
                    </div>
                    <p className="text-sm font-body text-gray-700 mt-1.5 break-words">{c.reason}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-[11px] text-gray-400 font-body">
                        {c.actingEmail} · {fmtWhen(c.createdAt)}
                      </span>
                      {canManage && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            isArmed && armed && Date.now() - armed.at <= ARM_WINDOW_MS
                              ? void retire(c)
                              : arm(retireKey)
                          }
                          className={`ml-auto min-h-[32px] px-3 py-1 rounded-lg text-xs font-semibold font-body transition-colors disabled:opacity-50 ${
                            isArmed
                              ? 'bg-navy text-white'
                              : 'bg-white border border-gray-300 text-navy hover:bg-gray-50'
                          }`}
                          data-testid={`retire-constraint-${c.id}`}
                        >
                          {isBusy ? 'Working…' : isArmed ? 'Tap again to retire' : 'Retire'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Add form */}
          {canManage && (
            <div className="mt-4 border-t border-gray-100 pt-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Add a constraint
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-gray-500 font-body block mb-1" htmlFor="cc-lender-slug">
                    Lender (slug)
                  </label>
                  <input
                    id="cc-lender-slug"
                    type="text"
                    value={lenderSlug}
                    onChange={e => setLenderSlug(e.target.value)}
                    placeholder="e.g. scotia"
                    className="w-full text-sm font-body border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-navy/50"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-500 font-body block mb-1" htmlFor="cc-lender-label">
                    Lender name (optional)
                  </label>
                  <input
                    id="cc-lender-label"
                    type="text"
                    value={lenderLabel}
                    onChange={e => setLenderLabel(e.target.value)}
                    placeholder="e.g. Scotiabank"
                    className="w-full text-sm font-body border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-navy/50"
                  />
                </div>
              </div>

              <fieldset className="mt-3">
                <legend className="text-[11px] text-gray-500 font-body mb-1">Type</legend>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {CONSTRAINT_TYPES.map(t => (
                    <label
                      key={t}
                      className={`flex flex-col gap-0.5 border rounded-lg p-2.5 cursor-pointer transition-colors ${
                        type === t ? 'border-navy bg-navy/5' : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="cc-type"
                          value={t}
                          checked={type === t}
                          onChange={() => {
                            setType(t)
                            setArmed(null)
                          }}
                          className="accent-navy"
                        />
                        <span className="text-sm font-body font-semibold text-navy">{CONSTRAINT_LABEL[t]}</span>
                      </span>
                      <span className="text-[11px] text-gray-500 font-body">{CONSTRAINT_HELP[t]}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="mt-3">
                <label className="text-[11px] text-gray-500 font-body block mb-1" htmlFor="cc-reason">
                  Reason (required — the reason is the point)
                </label>
                <textarea
                  id="cc-reason"
                  value={reason}
                  onChange={e => {
                    setReason(e.target.value)
                    setArmed(null)
                  }}
                  maxLength={2000}
                  rows={2}
                  placeholder="Why this lender is excluded, required, or preferred for this client."
                  className="w-full text-sm font-body border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-navy/50 resize-y"
                />
              </div>

              {formError && <p className="mt-2 text-xs text-red-700 font-body">{formError}</p>}

              <div className="mt-3">
                <button
                  type="button"
                  disabled={busyKey === 'add'}
                  onClick={() =>
                    armed?.key === 'add' && armed && Date.now() - armed.at <= ARM_WINDOW_MS
                      ? void submitAdd()
                      : armAdd()
                  }
                  className={`min-h-[40px] px-4 py-2 rounded-lg text-sm font-semibold font-body transition-colors disabled:opacity-50 ${
                    armed?.key === 'add' ? 'bg-navy text-white' : 'bg-lime text-navy hover:bg-lime/80'
                  }`}
                  data-testid="add-constraint"
                >
                  {busyKey === 'add'
                    ? 'Saving…'
                    : armed?.key === 'add'
                      ? 'Tap again to record'
                      : 'Record constraint'}
                </button>
              </div>
            </div>
          )}

          {/* Retired history — nothing deletes */}
          {retired.length > 0 && (
            <div className="mt-4 border-t border-gray-100 pt-3">
              <button
                type="button"
                onClick={() => setShowHistory(s => !s)}
                className="text-xs font-semibold text-gray-500 hover:text-navy font-body"
                data-testid="toggle-constraint-history"
              >
                {showHistory ? 'Hide' : 'Show'} history ({retired.length} retired)
              </button>
              {showHistory && (
                <div className="mt-2 space-y-2">
                  {retired.map(c => (
                    <div key={c.id} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                      <div className="flex flex-wrap items-center gap-2">
                        <TypeChip type={c.type} />
                        <span className="text-sm font-body font-semibold text-navy">
                          {c.lenderLabel || c.lenderSlug}
                        </span>
                        <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">
                          retired
                        </span>
                      </div>
                      <p className="text-sm font-body text-gray-600 mt-1.5 break-words">{c.reason}</p>
                      <p className="text-[11px] text-gray-400 font-body mt-1.5">
                        recorded {c.actingEmail} · {fmtWhen(c.createdAt)}
                        {c.retiredAt
                          ? ` · retired ${c.retiredBy ? `${c.retiredBy} ` : ''}${fmtWhen(c.retiredAt)}`
                          : ''}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
