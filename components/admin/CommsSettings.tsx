'use client'

// Client comms settings (B7-P Task 4): the master kill switch, the per-client
// caps, the CASL mailing address, and the read-only suppression list. All state
// is read from the workbench (fail-closed: an absent settings row reads as OFF /
// dark). The switch flip and every change are gated comms.decide actions minted
// on the signed-in session; the suppression list can NEVER be edited here (an
// unsubscribe is permanent under CASL — stated in the interface).
//
// Navy / cool / amber only — no lime, no decision token (a settings surface is
// not the queued-decision signal).

import { useCallback, useEffect, useState } from 'react'
import { GATES_TOKEN_HEADER, useGatesToken } from '@/lib/gates-token'

interface Suppression {
  clientEmail: string
  reason: string
  source: string
  suppressedAt: string
}
interface Payload {
  ok: boolean
  configured?: boolean
  commsEnabled?: boolean
  hasSettingsRow?: boolean
  mailingAddress?: string | null
  maxPerDay?: number
  maxPerWeek?: number
  suppressions?: Suppression[]
}

export default function CommsSettings({ canWrite }: { canWrite: boolean }) {
  const mint = useGatesToken()
  const [state, setState] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [address, setAddress] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/portal/admin/comms/settings', { cache: 'no-store' })
      const data = (await res.json().catch(() => null)) as Payload | null
      if (!res.ok || !data?.ok) {
        setError(data && 'message' in (data as any) ? String((data as any).message) : 'Could not load comms settings.')
        return
      }
      setState(data)
      setAddress(data.mailingAddress ?? '')
      setError(null)
    } catch {
      setError('Could not load comms settings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = useCallback(
    async (patch: Record<string, unknown>) => {
      setBusy(true)
      setError(null)
      try {
        const token = await mint()
        const res = await fetch('/api/portal/admin/gates/comms/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { [GATES_TOKEN_HEADER]: token } : {}) },
          body: JSON.stringify(patch),
        })
        const j = await res.json().catch(() => null)
        if (!res.ok || !j?.ok) {
          setError(j?.message ?? `Could not save (HTTP ${res.status}).`)
          return
        }
        await load()
      } catch {
        setError('Network error; retry.')
      } finally {
        setBusy(false)
      }
    },
    [mint, load],
  )

  const enabled = state?.commsEnabled === true
  const hasRow = state?.hasSettingsRow === true

  return (
    <section id="comms" className="scroll-mt-24 bg-white border border-cool-200 rounded-[9px] p-5">
      <h2 className="font-heading text-navy font-bold text-base">Client comms</h2>
      <p className="text-cool-500 font-ui text-sm mt-0.5">
        The engine that sends clients plain-words updates at the moments that matter, in Michael&rsquo;s
        voice. Every message is individually approved on the Approvals comms queue; this is the master
        control and the permanent suppression list.
      </p>

      {loading ? (
        <p className="mt-4 font-ui text-sm text-cool-500">Loading&hellip;</p>
      ) : error && !state ? (
        <div className="mt-4 rounded-[9px] border border-amber-200 bg-amber-50 p-4">
          <p className="font-ui text-sm text-amber-800">{error}</p>
          <button
            type="button"
            onClick={load}
            className="mt-2 rounded-md bg-navy px-3 py-1.5 text-xs font-ui text-white hover:bg-navy/90"
          >
            Try again
          </button>
        </div>
      ) : state?.configured === false ? (
        <p className="mt-4 font-ui text-sm text-cool-500">
          Workbench not connected. The comms engine appears here once the workbench read role is set.
        </p>
      ) : (
        <div className="mt-4 space-y-6">
          {/* ── The master switch ── */}
          <div className="rounded-[9px] border border-cool-200 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-ui text-sm font-semibold text-navy">Master switch</p>
                <p className="mt-0.5 font-ui text-xs text-cool-600">
                  {enabled
                    ? 'On. Approved messages can send.'
                    : hasRow
                      ? 'Off. The engine is dark; nothing sends even when a message is approved.'
                      : 'Off. No settings row exists yet, so the engine is dark by absence. Turning it on creates the row as an explicit action.'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={enabled ? 'Turn client comms off' : 'Turn client comms on'}
                disabled={!canWrite || busy}
                onClick={() => save({ comms_enabled: !enabled })}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full motion-safe:transition-colors disabled:opacity-50 ${
                  enabled ? 'bg-navy' : 'bg-cool-300'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow motion-safe:transition-transform ${
                    enabled ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
            {!enabled && (
              <p className="mt-3 rounded-md bg-cool-50 px-3 py-2 font-ui text-xs text-cool-600">
                While the master switch is off, the workbench refuses every send, so approving a message
                on the queue does nothing. This is the intended dark default.
              </p>
            )}
          </div>

          {/* ── CASL mailing address ── */}
          <div className="rounded-[9px] border border-cool-200 p-4">
            <p className="font-ui text-sm font-semibold text-navy">Mailing address</p>
            <p className="mt-0.5 font-ui text-xs text-cool-600">
              By law a licensed agent&rsquo;s electronic messages carry a physical address. A send is
              refused until this is set.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value.slice(0, 300))}
                disabled={!canWrite || busy}
                placeholder="Street, city, province, postal code"
                className="min-w-0 flex-1 rounded-md border border-cool-300 px-2 py-1.5 text-sm font-ui disabled:bg-cool-50"
              />
              {canWrite && (
                <button
                  type="button"
                  disabled={busy || address.trim().length < 6 || address.trim() === (state?.mailingAddress ?? '')}
                  onClick={() => save({ comms_mailing_address: address.trim() })}
                  className="rounded-md bg-navy px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  Save
                </button>
              )}
            </div>
            {!state?.mailingAddress && (
              <p className="mt-2 font-ui text-xs text-amber-700">No address on file yet, so no message can send.</p>
            )}
          </div>

          {/* ── Per-client caps (read-only display; changed workbench-side) ── */}
          <div className="rounded-[9px] border border-cool-200 p-4">
            <p className="font-ui text-sm font-semibold text-navy">Per-client caps</p>
            <p className="mt-0.5 font-ui text-xs text-cool-600">
              The most a single client can receive across all comms.
            </p>
            <div className="mt-2 flex gap-6 font-ui text-sm text-cool-700 tabular-nums">
              <span>{state?.maxPerDay ?? 1} per day</span>
              <span>{state?.maxPerWeek ?? 3} per week</span>
            </div>
          </div>

          {/* ── The suppression list (read-only, permanent) ── */}
          <div className="rounded-[9px] border border-cool-200 p-4">
            <p className="font-ui text-sm font-semibold text-navy">
              Suppression list ({state?.suppressions?.length ?? 0})
            </p>
            <p className="mt-0.5 font-ui text-xs text-cool-600">
              Clients who opted out. An unsubscribe is permanent under CASL and cannot be removed here.
            </p>
            {state?.suppressions && state.suppressions.length > 0 ? (
              <ul className="mt-3 divide-y divide-cool-100">
                {state.suppressions.map((s, i) => (
                  <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                    <span className="font-ui text-sm text-cool-700">{s.clientEmail}</span>
                    <span className="font-ui text-xs text-cool-500">
                      {s.reason} &middot; {s.source} &middot; {s.suppressedAt.slice(0, 10)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 font-ui text-sm text-cool-500">No one has unsubscribed.</p>
            )}
          </div>

          {error && <p className="font-ui text-xs font-semibold text-red-600">{error}</p>}
          {!canWrite && (
            <p className="font-ui text-xs text-cool-500">
              This surface is read-only right now (demo mode, or your role cannot decide).
            </p>
          )}
        </div>
      )}
    </section>
  )
}
