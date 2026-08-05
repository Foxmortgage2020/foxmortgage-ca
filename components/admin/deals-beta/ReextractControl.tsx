'use client'

// The re-extract control (handoff 53) — the retry for a commitment whose
// condition extraction failed, on the Deals (Beta) Commitment tab.
//
// THE PREVIEW IS NOT OPTIONAL. The first press runs a dry run, which writes
// nothing, and Michael reads the full list of conditions the run would draft
// before any way to apply exists on the screen. A system that drafts twelve
// conditions onto a live file the instant someone clicks is how one file ended
// up carrying 157 rows, so the apply step does not render until a preview has
// succeeded in this mount.
//
// APPLY IS A DECISION AND IS SHAPED LIKE ONE: a typed reason (required, never
// prefilled, refused over-long rather than truncated), an armed button (one
// press arms, a second commits, the window enforced by timestamp at tap time),
// and a LATCH after a successful press rather than merely going un-busy while
// router.refresh catches up. That last is the defect the Remove control hit
// and fixed. A conflict latches too, because pressing again cannot help.
//
// THE GATE'S REFUSAL IS SURFACED, NEVER HIDDEN. A document that already has a
// succeeded attempt answers conflict, and that is the safety property working,
// so it renders as a reason in plain language rather than a broken button. The
// portal has no read on extraction attempts and does not try to predict the
// refusal.
//
// Nothing here can delete anything (guardrail 21) and the human actor comes
// from the verified session the browser-minted token carries, never from a
// payload field (guardrail 19). The only network call is the gate proxy under
// /api/portal/admin/gates/, which keeps the write guarantee's allowlist exact.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GATES_TOKEN_HEADER, useGatesToken } from '@/lib/gates-token'
import {
  REEXTRACT_PENDING_COPY,
  REEXTRACT_TERMS_COPY,
  checkReextractReason,
} from '@/lib/reextract'
import type { ForecastCondition } from '@/lib/gates'

const ARM_WINDOW_MS = 4000

const OWNER_LABELS: Record<string, string> = {
  broker: 'Broker',
  solicitor: 'Solicitor',
  borrower: 'Borrower',
  lender: 'Lender',
  underwriting: 'Underwriting',
}

export default function ReextractControl({
  documentId,
  docLabel,
}: {
  documentId: string
  /** Short human context for which document this retries, e.g.
   *  "signed commitment received 31 July 2026". */
  docLabel: string
}) {
  const router = useRouter()
  const mintGatesToken = useGatesToken()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  /** The successful dry run's forecast. Its existence is what unlocks apply. */
  const [forecast, setForecast] = useState<ForecastCondition[] | null>(null)
  /** Terminal states. Set once, never cleared: success or conflict both end
   *  this mount's story, and the refresh brings back the true state. */
  const [done, setDone] = useState<string | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [armed, setArmed] = useState<number | null>(null)
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (armTimer.current) clearTimeout(armTimer.current)
    },
    [],
  )

  const post = useCallback(
    async (mode: 'dry_run' | 'apply') => {
      setBusy(true)
      setError('')
      try {
        // Minted per action, in the browser, right before the POST. It lives
        // 60 seconds and is never cached, stored or logged.
        const token = await mintGatesToken()
        const res = await fetch(
          `/api/portal/admin/gates/commitment-extractions/${encodeURIComponent(documentId)}/retry`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              ...(token ? { [GATES_TOKEN_HEADER]: token } : {}),
            },
            body: JSON.stringify(mode === 'apply' ? { mode, reason } : { mode }),
          },
        )
        const json = await res.json().catch(() => null)
        return { res, json }
      } catch {
        setError('Could not reach the server. Check your connection and retry.')
        return null
      } finally {
        setBusy(false)
      }
    },
    [documentId, mintGatesToken, reason],
  )

  const preview = useCallback(async () => {
    const out = await post('dry_run')
    if (!out) return
    const { json } = out
    if (json?.ok) {
      const rows = Array.isArray(json.data?.conditions) ? json.data.conditions : []
      setForecast(rows)
      return
    }
    if (json?.kind === 'conflict') {
      // The safety property, not a fault: a succeeded attempt already exists
      // on this document, so there is nothing a retry may do.
      setRefused(json?.message ?? 'This document already has a succeeded extraction, so a retry is refused.')
      return
    }
    setError(json?.message ?? 'The preview did not answer. Nothing was written.')
  }, [post])

  const apply = useCallback(async () => {
    setArmed(null)
    const out = await post('apply')
    if (!out) return
    const { json } = out
    if (json?.ok) {
      const n = typeof json.data?.drafted === 'number' ? json.data.drafted : forecast?.length ?? 0
      setDone(
        `Drafted ${n} conditions as pending. They are now waiting on the condition list gate, on the Conditions tab.`,
      )
      router.refresh()
      return
    }
    if (json?.kind === 'conflict') {
      setDone(json?.message ?? 'That was already decided. Refreshing to show where it stands.')
      router.refresh()
      return
    }
    setError(json?.message ?? 'The apply did not answer. Check the Conditions tab before retrying.')
  }, [forecast, post, router])

  const fireApply = () => {
    if (done || busy) return
    if (armed !== null && Date.now() - armed <= ARM_WINDOW_MS) {
      void apply()
    } else {
      setArmed(Date.now())
      if (armTimer.current) clearTimeout(armTimer.current)
      armTimer.current = setTimeout(() => setArmed(null), ARM_WINDOW_MS)
    }
  }

  const reasonCheck = checkReextractReason(reason)

  return (
    <section
      className="rounded-[9px] border border-cool-200 bg-white p-4"
      data-testid={`beta-reextract-${documentId}`}
    >
      <h3 className="font-heading text-sm font-semibold text-navy">
        Re-run the condition extraction
      </h3>
      <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-cool-600 font-ui">
        For a commitment whose extraction failed, so the file shows approved terms and an empty
        checklist. This retries the read of {docLabel}.
      </p>
      <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-cool-600 font-ui">
        {REEXTRACT_PENDING_COPY}
      </p>
      <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-cool-600 font-ui">
        {REEXTRACT_TERMS_COPY}
      </p>

      {refused ? (
        <p
          className="mt-3 max-w-prose rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] font-ui text-amber-900"
          data-testid="beta-reextract-refused"
        >
          {refused}
        </p>
      ) : done ? (
        <p
          className="mt-3 max-w-prose rounded-md border border-cool-200 bg-cool-50 px-3 py-2 text-[13px] font-ui text-cool-700"
          data-testid="beta-reextract-done"
        >
          {done}
        </p>
      ) : (
        <>
          {forecast === null ? (
            <button
              type="button"
              onClick={() => void preview()}
              disabled={busy}
              data-testid="beta-reextract-preview"
              className="mt-3 rounded-[7px] border border-navy bg-white px-3 py-1.5 text-xs font-heading text-navy hover:bg-cool-50 disabled:opacity-50"
            >
              {busy ? 'Running the preview…' : 'Preview what it would draft'}
            </button>
          ) : (
            <div className="mt-3">
              <p className="text-[13px] font-ui text-cool-700">
                This run would draft{' '}
                <span className="font-semibold tabular-nums">{forecast.length}</span>{' '}
                {forecast.length === 1 ? 'condition' : 'conditions'}, all pending. Read them before
                applying.
              </p>
              {forecast.length > 0 && (
                <ol
                  className="mt-2 max-w-prose list-decimal space-y-1.5 pl-5"
                  data-testid="beta-reextract-forecast"
                >
                  {forecast.map((c, i) => (
                    <li key={i} className="text-[13px] leading-relaxed text-navy font-ui">
                      {String(c.text ?? '')}
                      {c.owner != null && String(c.owner).trim() !== '' && (
                        <span className="ml-2 rounded-full border border-cool-300 px-1.5 py-0.5 text-[10px] font-semibold text-cool-600">
                          {OWNER_LABELS[String(c.owner)] ?? String(c.owner)}
                        </span>
                      )}
                      {c.category != null && String(c.category).trim() !== '' && (
                        <span className="ml-1.5 text-[11px] text-cool-500">
                          {String(c.category)}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              )}

              <div className="mt-4 border-t border-cool-100 pt-3">
                <label
                  className="block text-[11px] font-semibold uppercase tracking-wide text-cool-600"
                  htmlFor={`reextract-reason-${documentId}`}
                >
                  Why this is being re-drafted
                </label>
                {/* Required and never prefilled. This sentence is the record of
                    why the checklist was re-drafted, so it must be typed. */}
                <textarea
                  id={`reextract-reason-${documentId}`}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  rows={2}
                  placeholder="The extraction failed on upload and this run drafts the checklist it should have produced."
                  className="mt-1 w-full max-w-prose rounded-md border border-cool-300 px-2.5 py-1.5 text-[13px] font-ui text-navy placeholder:text-cool-400"
                  data-testid="beta-reextract-reason"
                />
                {reason.trim() !== '' && !reasonCheck.ok && (
                  <p className="mt-1 max-w-prose text-[12px] text-amber-800 font-ui">
                    {reasonCheck.message}
                  </p>
                )}
                <button
                  type="button"
                  onClick={fireApply}
                  disabled={busy || !reasonCheck.ok}
                  data-testid="beta-reextract-apply"
                  className={`mt-2 rounded-[7px] border px-3 py-1.5 text-xs font-heading disabled:opacity-50 ${
                    armed !== null
                      ? 'border-amber-500 bg-amber-500 text-white'
                      : 'border-navy bg-navy text-white hover:bg-navy/90'
                  }`}
                >
                  {busy
                    ? 'Drafting…'
                    : armed !== null
                      ? `Press again to draft ${forecast.length} conditions as pending`
                      : `Apply and draft ${forecast.length} conditions as pending`}
                </button>
              </div>
            </div>
          )}
          {error && (
            <p className="mt-2 max-w-prose text-[12px] text-amber-800 font-ui" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  )
}
