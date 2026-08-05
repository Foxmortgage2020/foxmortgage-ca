'use client'

// The committed-terms card (2026-08-04) — the deal room's view of what the
// lender actually committed to, and the one control that accepts it.
//
// WHAT MICHAEL IS APPROVING IS EVIDENCE, NOT A SUMMARY. Every field renders
// the string the document printed, beside the page it came from and the
// verbatim snippet around it. A resolved reading (the maturity's ISO date, the
// rate type's classification) renders BESIDE the printed token, never in place
// of it, with the basis that produced it. The rules themselves live in
// lib/commitment-terms.ts and are unit-tested there; this file is the render.
//
// ONE BUTTON, NOT TEN. The gate is per DOCUMENT: a commitment's fields are one
// lender's one offer, so the whole set moves together and the card states the
// set's status rather than ten of them. There is deliberately NO edit control
// anywhere here — the only writes this component can make are approve and
// reject, and a correction is a re-extraction, not a typed-over value.
//
// The pending state is AMBER, matching the commitment-conditions banner off
// the same upload. Lime is spent elsewhere (the exhaustive audit in
// tests/shell.test.ts enumerates every surface that may carry it).

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { GATES_TOKEN_HEADER, useGatesToken } from '@/lib/gates-token'
import {
  TERM_NOTE_MAX,
  termDisplay,
  termSetStatusLabel,
  type TermGroup,
} from '@/lib/commitment-terms'

// Two-tap confirm, enforced by TIMESTAMP at tap time rather than by a timer
// alone — a background tab's throttled timer once left a confirm button armed
// and a stray tap decided a live condition (the Session 4 incident).
const ARM_WINDOW_MS = 4000

function Chip({ tone, children }: { tone: 'amber' | 'green' | 'red' | 'gray'; children: React.ReactNode }) {
  const cls = {
    amber: 'bg-amber-100 text-amber-800',
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    gray: 'bg-cool-100 text-cool-700',
  }[tone]
  return <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{children}</span>
}

function toneForState(state: TermGroup['status']['state']): 'amber' | 'green' | 'red' | 'gray' {
  if (state === 'pending') return 'amber'
  if (state === 'approved') return 'green'
  if (state === 'rejected') return 'red'
  return 'gray'
}

function TermRow({ term }: { term: TermGroup['terms'][number] }) {
  const d = termDisplay(term)
  return (
    <li className="py-3">
      {/* Stacked on a phone, two columns from sm up. Wrapping the label and the
          value onto one line only when the value happens to be short made the
          list read jumpily at 375px — a long term and a short one are the same
          kind of thing and should sit the same way. */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-baseline gap-x-3 gap-y-0.5">
        <span className="text-xs font-semibold font-ui text-cool-500 sm:min-w-[9rem] sm:shrink-0">{d.label}</span>
        {d.printed ? (
          <span className="text-sm font-ui text-navy font-semibold break-words">{d.printed}</span>
        ) : (
          <span className="text-sm font-ui text-red-700 italic">{d.missingNote}</span>
        )}
      </div>

      {/* A reading, never a replacement. The maturity is why this exists: the
          document printed 06/10/2031 and the stored date is 2031-10-06 — read
          the other way round, the renewal moves by four months. */}
      {d.reading && (
        <div className="mt-1 ml-0 sm:ml-[9.75rem] rounded-md bg-cool-50 border border-cool-200 px-2.5 py-1.5">
          {d.reading.kind === 'date' ? (
            <>
              <p className="text-xs font-ui text-navy">
                <span className="text-cool-500">reads as</span> <span className="font-semibold">{d.reading.value}</span>
                {d.reading.convention && (
                  <span className="text-cool-500"> · {d.reading.convention}</span>
                )}
              </p>
              {d.reading.basis && (
                <p className="mt-0.5 text-[11px] text-cool-500 font-ui break-words">{d.reading.basis}</p>
              )}
            </>
          ) : (
            <p className="text-xs font-ui text-navy">
              <span className="text-cool-500">reads as</span> <span className="font-semibold">{d.reading.value}</span>
            </p>
          )}
        </div>
      )}

      {/* Provenance beside every value: the page, the confidence, the snippet
          exactly as stored. */}
      <p className="mt-1 ml-0 sm:ml-[9.75rem] text-[11px] text-cool-500 font-ui break-words">
        {d.page !== null ? `p${d.page}` : 'page not recorded'}
        {d.confidence ? ` · ${d.confidence}` : ''}
        {d.snippet ? <>: &ldquo;{d.snippet}&rdquo;</> : ' · no snippet stored'}
      </p>
    </li>
  )
}

function TermSet({
  group,
  canDecide,
  demo,
}: {
  group: TermGroup
  canDecide: boolean
  demo: boolean
}) {
  const router = useRouter()
  const mintGatesToken = useGatesToken()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<{ tone: 'green' | 'amber'; text: string } | null>(null)
  const [armed, setArmed] = useState<{ key: string; at: number } | null>(null)
  const [note, setNote] = useState('')
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const decide = useCallback(
    async (action: 'approve' | 'reject') => {
      setArmed(null)
      setBusy(true)
      setError('')
      try {
        // Minted per action, in the browser, right before the POST. A
        // backend-minted template token carries no azp claim and the gate
        // refuses it with a 401 by design; the token lives 60 seconds and is
        // never cached, stored, or logged.
        const token = await mintGatesToken()
        const res = await fetch(
          `/api/portal/admin/gates/commitment-terms/${encodeURIComponent(group.documentId)}/decision`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { [GATES_TOKEN_HEADER]: token } : {}) },
            body: JSON.stringify(note.trim() ? { action, note: note.trim() } : { action }),
          },
        )
        const json = await res.json().catch(() => null)
        if (json?.ok) {
          const decided = typeof json.data?.decided === 'number' ? json.data.decided : null
          setToast({
            tone: 'green',
            text:
              action === 'approve'
                ? `Committed terms approved${decided !== null ? ` — ${decided} ${decided === 1 ? 'term' : 'terms'} moved` : ''}.`
                : `Committed terms rejected${decided !== null ? ` — ${decided} ${decided === 1 ? 'term' : 'terms'} moved` : ''}.`,
          })
          setNote('')
          router.refresh()
          return
        }
        // 409 is not an error to retry: nothing was pending, or another
        // session decided it first. Show the current state instead.
        if (json?.kind === 'conflict') {
          setToast({ tone: 'amber', text: 'Already decided. Refreshing the file to show where the terms stand.' })
          router.refresh()
          return
        }
        setError(json?.message ?? `Unexpected response (HTTP ${res.status}).`)
      } catch {
        setError('Could not reach the server. Check your connection and retry.')
      } finally {
        setBusy(false)
        if (toastTimer.current) clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(() => setToast(null), 8000)
      }
    },
    [group.documentId, mintGatesToken, note, router],
  )

  const fire = (key: string, run: () => void) =>
    armed?.key === key && Date.now() - armed.at <= ARM_WINDOW_MS ? run() : arm(key)

  const s = group.status
  const showControls = canDecide && s.decidable

  return (
    <div className="rounded-lg border border-cool-200 bg-white">
      <div
        className={`flex flex-wrap items-center gap-2 px-3 py-2 rounded-t-lg border-b ${
          s.state === 'pending' ? 'bg-amber-50 border-amber-200' : 'bg-cool-50 border-cool-200'
        }`}
      >
        <Chip tone={toneForState(s.state)}>{termSetStatusLabel(s)}</Chip>
        <span className="text-[11px] text-cool-500 font-ui">
          {s.total} {s.total === 1 ? 'term' : 'terms'} from one commitment
        </span>
      </div>

      {s.state === 'pending' && (
        <p className="px-3 pt-3 text-sm font-ui text-amber-900">
          These are the terms read off the commitment. Check each printed value against its snippet, then approve the
          set — they move together.
        </p>
      )}

      {toast && (
        <div
          className={`mx-3 mt-3 rounded-lg px-3 py-2 text-sm font-ui border ${
            toast.tone === 'green'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          {toast.text}
        </div>
      )}

      {showControls && (
        <div className="px-3 pt-3">
          <label className="block text-[11px] font-ui text-cool-500" htmlFor={`term-note-${group.documentId}`}>
            Note (optional, kept on the audit entry)
          </label>
          <textarea
            id={`term-note-${group.documentId}`}
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
            maxLength={TERM_NOTE_MAX}
            className="mt-1 w-full rounded-lg border border-cool-300 px-2.5 py-1.5 text-sm font-ui text-navy focus:outline-none focus:ring-2 focus:ring-navy/20"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => fire('approve', () => void decide('approve'))}
              className="min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold font-ui bg-navy text-white hover:opacity-90 transition-colors disabled:opacity-50"
            >
              {busy
                ? 'Working…'
                : armed?.key === 'approve'
                  ? `Tap again to approve all ${s.pending}`
                  : `Approve all ${s.pending}`}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => fire('reject', () => void decide('reject'))}
              className="min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold font-ui bg-white border border-cool-300 text-navy hover:bg-cool-50 transition-colors disabled:opacity-50"
            >
              {busy ? 'Working…' : armed?.key === 'reject' ? 'Tap again to reject the set' : 'Reject the set'}
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-red-700 font-ui">{error}</p>}
        </div>
      )}

      {/* Decision controls are ABSENT in demo (Session 9 posture), so the
          absence needs its own honest reason rather than the admin-only one. */}
      {!showControls && s.decidable && (
        <p className="px-3 pt-3 text-xs font-ui text-cool-500">
          {demo
            ? 'Demo mode — these terms are fictional and no decision control renders.'
            : 'These terms are awaiting a decision. Deciding them is admin-only.'}
        </p>
      )}

      <ul className="px-3 pb-3 pt-1 divide-y divide-cool-100">
        {group.terms.map(t => (
          <TermRow key={t.id} term={t} />
        ))}
      </ul>
    </div>
  )
}

export default function CommitmentTermsCard({
  groups,
  canDecide,
  demo,
}: {
  /** One group per source document — an amendment gets its own set and its own
   *  decision, because the gate is keyed on the document. */
  groups: TermGroup[]
  canDecide: boolean
  demo: boolean
}) {
  if (groups.length === 0) {
    return (
      <p className="text-sm text-cool-600 font-ui">
        No committed terms have been read off a commitment on this file yet.
      </p>
    )
  }
  return (
    <div className="space-y-3">
      {groups.map(g => (
        <TermSet key={g.documentId} group={g} canDecide={canDecide} demo={demo} />
      ))}
    </div>
  )
}
