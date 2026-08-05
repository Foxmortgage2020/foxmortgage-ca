'use client'

// The Remove control and its reversal (handoff 50, 2026-08-05).
//
// TWO CONTROLS, ONE MACHINE. Withdrawing and reversing are the same shape: a
// disclosure, a required typed reason, an armed press, one POST through a gate
// proxy on a browser-minted token. They share the machine below so the two can
// never drift on arming, on error handling or on what a failure looks like.
//
// THE REASON IS REQUIRED AND NEVER PREFILLED. Not defaulted, not carried over
// from the last record, not filled in from the file reference. In three months
// the only answer to "why did this file go away" is what Michael typed here,
// and a prefilled box is a box nobody reads. The Remove button stays disabled
// until the reason clears the same bounds the route and the gate enforce, so
// the refusal is visible before the press rather than after it.
//
// ARMED, NOT SINGLE PRESS, and armed BY TIMESTAMP rather than by a timer alone.
// A background tab's throttled timer once left a confirm button armed and a
// stray tap decided a live condition (the Session 4 incident), so the window is
// checked at tap time. Same pattern as the committed-terms card.
//
// NOTHING HERE SAYS DELETE, deliberately. The record is not deleted. It stays,
// carries the decision, and the loader declines to recreate it. Calling that a
// delete would send a person looking for a bin that does not exist. Every word
// of that explanation comes from lib/rec-withdrawal.ts so the board, the file
// page and the tests cannot disagree about what the button claims.
//
// THE WRITE GUARANTEE. The only fetches below target
// /api/portal/admin/gates/rec/withdrawals, an existing gate proxy, on a
// per-action Clerk token minted in the browser. No direct database write, no
// service-role key, no human actor supplied from this side: instructed_by comes
// from the verified session at the far end (guardrail 19) and is structurally
// absent from the body.

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { GATES_TOKEN_HEADER, useGatesToken } from '@/lib/gates-token'
import {
  REVERSAL_EXPLAINER,
  WITHDRAWAL_EXPLAINER,
  WITHDRAWAL_PERMANENCE,
  WITHDRAW_REASON_MAX,
  checkReason,
  postureNotice,
  type FeedPosture,
  type WithdrawalLike,
} from '@/lib/rec-withdrawal'

const ARM_WINDOW_MS = 4000

type Variant = 'card' | 'file'

// ─── The shared machine ─────────────────────────────────────────────────────

function useDecision(run: (reason: string, token: string | null) => Promise<Response>) {
  const router = useRouter()
  const mintGatesToken = useGatesToken()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [armed, setArmed] = useState<number | null>(null)
  // DONE IS ONE-WAY AND IS NEVER CLEARED. `router.refresh()` is fire and
  // forget, and the page it refreshes re-runs a dozen workbench reads, so there
  // is a real window between the gate answering and the screen catching up. If
  // the control simply went un-busy in that window it would sit there with the
  // reason still typed and the button live, inviting a second press on a record
  // that has already been withdrawn. Latching instead means the control can be
  // pressed exactly once per mount, whatever the network does.
  const [done, setDone] = useState<string | null>(null)
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (armTimer.current) clearTimeout(armTimer.current)
    },
    [],
  )

  const arm = useCallback(() => {
    setArmed(Date.now())
    if (armTimer.current) clearTimeout(armTimer.current)
    armTimer.current = setTimeout(() => setArmed(null), ARM_WINDOW_MS)
  }, [])

  const go = useCallback(
    async (reason: string) => {
      setArmed(null)
      setBusy(true)
      setError('')
      try {
        // Minted per action, in the browser, right before the POST. A
        // backend-minted template token carries no azp claim and the gate
        // refuses it by design. It lives 60 seconds and is never cached,
        // stored or logged.
        const token = await mintGatesToken()
        const res = await run(reason, token)
        const json = await res.json().catch(() => null)
        if (json?.ok) {
          // Both surfaces are server components, so the state on screen comes
          // back from the read rather than from anything optimistic here.
          setDone(DONE_COPY)
          router.refresh()
          return true
        }
        // 409 IS NOT AN ERROR TO RETRY. Either this record was already decided
        // or it is in a state that refuses, and in both cases pressing again
        // cannot help. It latches like a success so the control locks, and the
        // refresh brings back whichever of the two it actually was.
        if (json?.kind === 'conflict') {
          setDone(json?.message ?? CONFLICT_COPY)
          router.refresh()
          return false
        }
        setError(json?.message ?? `Unexpected response (HTTP ${res.status}).`)
        return false
      } catch {
        setError('Could not reach the server. Check your connection and retry.')
        return false
      } finally {
        setBusy(false)
      }
    },
    [mintGatesToken, router, run],
  )

  const fire = (reason: string) => {
    if (done || busy) return
    if (armed !== null && Date.now() - armed <= ARM_WINDOW_MS) void go(reason)
    else arm()
  }

  return { busy, error, done, fire, isArmed: armed !== null }
}

const DONE_COPY = 'Done. The board is catching up.'
const CONFLICT_COPY = 'That was already decided. Refreshing to show where it stands.'

function DoneLine({ text }: { text: string }) {
  return (
    <p className="rounded-md border border-cool-200 bg-cool-50 px-2.5 py-1.5 text-[11px] font-ui text-cool-700">
      {text}
    </p>
  )
}

// ─── Shared bits of chrome ──────────────────────────────────────────────────

function ReasonField({
  id,
  label,
  value,
  onChange,
  rows,
  disabled,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  rows: number
  disabled: boolean
}) {
  return (
    <>
      <label className="block text-[11px] font-ui text-cool-600" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        maxLength={WITHDRAW_REASON_MAX}
        disabled={disabled}
        className="mt-1 w-full rounded-lg border border-cool-300 px-2.5 py-1.5 text-sm font-ui text-navy focus:outline-none focus:ring-2 focus:ring-navy/20 disabled:opacity-50"
      />
    </>
  )
}

function Explainer({ children }: { children: React.ReactNode }) {
  return <p className="max-w-prose text-[11px] leading-snug font-ui text-cool-600">{children}</p>
}

function ErrorLine({ text }: { text: string }) {
  return <p className="mt-2 text-xs font-ui text-red-700">{text}</p>
}

// ─── Remove ─────────────────────────────────────────────────────────────────

export function RemoveRecordControl({
  sourceId,
  fileRef,
  posture,
  variant,
}: {
  /** rec.deals.source_id, the id the LOADER keys on. Never the rec row's uuid,
   *  which would write a decision about a record that does not exist. */
  sourceId: string
  fileRef: string | null
  posture: FeedPosture
  variant: Variant
}) {
  const [open, setOpen] = useState(false)
  const [showWhy, setShowWhy] = useState(false)
  const [reason, setReason] = useState('')
  const compact = variant === 'card'

  const post = useCallback(
    (r: string, token: string | null) =>
      fetch('/api/portal/admin/gates/rec/withdrawals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { [GATES_TOKEN_HEADER]: token } : {}),
        },
        body: JSON.stringify({ source_id: sourceId, reason: r }),
      }),
    [sourceId],
  )
  const { busy, error, done, isArmed, fire } = useDecision(post)

  const notice = postureNotice(posture)
  const check = checkReason(reason)

  // Pressed once, and that is all this mount will ever do. The record is gone
  // from the board on the next read; until then the control is a statement
  // rather than a button.
  if (done) {
    return (
      <div className={compact ? 'px-3 py-2' : 'mt-2'} data-testid={`beta-remove-done-${fileRef ?? sourceId}`}>
        <DoneLine text={done} />
      </div>
    )
  }

  // REFUSED: no control at all, and the sentence is one press away rather than
  // five lines on every card. The board gives the signal, the reason is right
  // here, and the file page states it in full without a press.
  if (posture === 'refused') {
    return (
      <div className="px-3 py-2" data-testid={`beta-remove-refused-${fileRef ?? sourceId}`}>
        {compact ? (
          <>
            <button
              type="button"
              onClick={() => setShowWhy(v => !v)}
              className="text-[11px] font-ui text-cool-500 underline underline-offset-2 hover:text-navy"
            >
              {showWhy ? 'Hide why removal is blocked' : 'Removal is blocked on this record'}
            </button>
            {showWhy && <p className="mt-1 text-[11px] leading-snug font-ui text-cool-600">{notice}</p>}
          </>
        ) : (
          <p className="max-w-prose text-sm font-ui text-cool-700">{notice}</p>
        )}
      </div>
    )
  }

  if (!open) {
    return (
      <div className={compact ? 'px-3 py-1.5' : ''}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid={`beta-remove-open-${fileRef ?? sourceId}`}
          className={
            compact
              ? 'text-[11px] font-ui text-cool-500 underline underline-offset-2 hover:text-danger'
              : 'min-h-[40px] rounded-lg border border-danger px-3.5 py-2 text-xs font-semibold font-ui text-danger hover:bg-danger/5'
          }
        >
          Remove this record
        </button>
      </div>
    )
  }

  return (
    <div
      className={`${compact ? 'px-3 pb-2.5 pt-1.5' : 'mt-2 rounded-lg border border-cool-200 bg-white p-3'}`}
      data-testid={`beta-remove-panel-${fileRef ?? sourceId}`}
    >
      <Explainer>
        {WITHDRAWAL_EXPLAINER} {WITHDRAWAL_PERMANENCE}
      </Explainer>

      {/* The live-feed and open-file cautions are not refusals, so they sit
          where they cannot be pressed past rather than hidden behind one. */}
      {notice && (
        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug font-ui text-amber-900">
          {notice}
        </p>
      )}

      <div className="mt-2">
        <ReasonField
          id={`remove-reason-${sourceId}`}
          label="Why is this record being removed? Required, and kept as the record of why."
          value={reason}
          onChange={setReason}
          rows={compact ? 2 : 3}
          disabled={busy}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || !check.ok}
          onClick={() => fire(reason.trim())}
          data-testid={`beta-remove-confirm-${fileRef ?? sourceId}`}
          className="min-h-[36px] rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold font-ui text-white transition-colors hover:opacity-90 disabled:opacity-40"
        >
          {busy ? 'Working…' : isArmed ? 'Press again to confirm the removal.' : 'Remove the record'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setOpen(false)
            setReason('')
          }}
          className="min-h-[36px] rounded-lg border border-cool-300 px-3 py-1.5 text-xs font-semibold font-ui text-cool-700 hover:bg-cool-50 disabled:opacity-40"
        >
          Keep it
        </button>
      </div>

      {/* Why the button is dark before it is usable, rather than a mystery. */}
      {!check.ok && reason.length > 0 && (
        <p className="mt-2 text-[11px] font-ui text-cool-600">{check.message}</p>
      )}
      {error && <ErrorLine text={error} />}
    </div>
  )
}

// ─── Reverse ────────────────────────────────────────────────────────────────

export function ReverseWithdrawalControl({
  withdrawal,
  fileRef,
}: {
  withdrawal: WithdrawalLike
  fileRef: string | null
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')

  const post = useCallback(
    (r: string, token: string | null) =>
      fetch(
        `/api/portal/admin/gates/rec/withdrawals/${encodeURIComponent(withdrawal.id)}/reverse`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { [GATES_TOKEN_HEADER]: token } : {}),
          },
          body: JSON.stringify({ reason: r }),
        },
      ),
    [withdrawal.id],
  )
  const { busy, error, done, isArmed, fire } = useDecision(post)
  const check = checkReason(reason)

  if (done) {
    return (
      <div data-testid={`beta-reverse-done-${fileRef ?? withdrawal.source_id}`}>
        <DoneLine text={done} />
      </div>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid={`beta-reverse-open-${fileRef ?? withdrawal.source_id}`}
        className="min-h-[32px] rounded-lg border border-cool-300 px-2.5 py-1 text-[11px] font-semibold font-ui text-cool-700 hover:bg-white"
      >
        Put this record back
      </button>
    )
  }

  return (
    <div
      className="mt-2 w-full rounded-lg border border-cool-200 bg-white p-2.5"
      data-testid={`beta-reverse-panel-${fileRef ?? withdrawal.source_id}`}
    >
      <Explainer>{REVERSAL_EXPLAINER}</Explainer>
      <div className="mt-2">
        <ReasonField
          id={`reverse-reason-${withdrawal.id}`}
          label="Why is this record coming back? Required, and kept beside the withdrawal."
          value={reason}
          onChange={setReason}
          rows={2}
          disabled={busy}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || !check.ok}
          onClick={() => fire(reason.trim())}
          data-testid={`beta-reverse-confirm-${fileRef ?? withdrawal.source_id}`}
          className="min-h-[36px] rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold font-ui text-white transition-colors hover:opacity-90 disabled:opacity-40"
        >
          {busy ? 'Working…' : isArmed ? 'Press again to confirm.' : 'Put it back'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setOpen(false)
            setReason('')
          }}
          className="min-h-[36px] rounded-lg border border-cool-300 px-3 py-1.5 text-xs font-semibold font-ui text-cool-700 hover:bg-cool-50 disabled:opacity-40"
        >
          Leave it removed
        </button>
      </div>
      {!check.ok && reason.length > 0 && (
        <p className="mt-2 text-[11px] font-ui text-cool-600">{check.message}</p>
      )}
      {error && <ErrorLine text={error} />}
    </div>
  )
}

// ─── The withdrawn state, stated ────────────────────────────────────────────

/** Rendered under the file page header, beside the flag strip, because a
 *  withdrawn record is an INTERRUPTING fact: it must be visible from every tab
 *  rather than found on one of them. */
export function WithdrawnStrip({ withdrawal }: { withdrawal: WithdrawalLike }) {
  return (
    <div
      className="mt-3 rounded-[9px] border border-amber-200 bg-amber-50 p-3"
      data-testid="beta-withdrawn-strip"
    >
      <p className="font-heading text-sm text-amber-900">This record has been removed</p>
      <p className="mt-1 max-w-prose text-sm font-ui text-amber-900">
        The record is still here and still readable. The loader will not recreate it, and any live
        feed for it has stopped.
      </p>
      <p className="mt-1.5 text-[11px] font-ui text-amber-800">
        {withdrawal.instructed_by ? `Removed by ${withdrawal.instructed_by}` : 'Removed'}
        {withdrawal.instructed_on ? ` on ${withdrawal.instructed_on}` : ''}
      </p>
      {withdrawal.reason && (
        <p className="mt-1.5 max-w-prose text-sm font-ui text-amber-900">
          <span className="text-amber-700">Reason given: </span>
          {withdrawal.reason}
        </p>
      )}
    </div>
  )
}
