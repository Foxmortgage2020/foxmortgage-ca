'use client'

// One appears-renewed file: both sides' evidence (the CRM's recorded terms
// beside the monitoring feed's), and the two decisions. Confirm writes
// Renewal_Status = 'Renewed With Us' through the existing confirmed-action
// status route (enumerated action, server-side recheck, FOXCA audit);
// decline records a persisted reason and the flag clears on the next render.
// Both are two-tap.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AppearsRenewedEvidence } from '@/lib/smm-match'

const money = (n: number | null | undefined) => (n == null ? 'n/a' : '$' + Math.round(n).toLocaleString('en-CA'))

const SIGNAL_LABEL: Record<string, string> = {
  start_after_close: 'the feed mortgage starts well after the deal closed',
  lender_changed: 'the lender changed',
  rate_changed: 'the rate changed',
}

export default function AppearsRenewedCard({
  dealId,
  dealName,
  amount,
  from,
  evidence,
  evidenceKey,
  zohoHref,
  canDecide,
}: {
  dealId: string
  dealName: string
  amount: number
  from: 'action' | 'lapsed'
  evidence: AppearsRenewedEvidence
  /** Scopes a decline to THIS evidence; a later feed change re-flags. */
  evidenceKey: string
  zohoHref: string
  canDecide: boolean
}) {
  const router = useRouter()
  const [armed, setArmed] = useState<'confirm' | 'decline' | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function act(kind: 'confirm' | 'decline') {
    if (armed !== kind) {
      setArmed(kind)
      setMsg(null)
      setTimeout(() => setArmed(a => (a === kind ? null : a)), 5000)
      return
    }
    if (kind === 'decline' && reason.trim().length < 5) {
      setMsg('A reason (5+ characters) is needed to clear the flag.')
      return
    }
    setArmed(null)
    setBusy(true)
    try {
      const res =
        kind === 'confirm'
          ? await fetch(`/api/portal/admin/renewals/${encodeURIComponent(dealId)}/status`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'renewed_with_us' }),
            })
          : await fetch(`/api/portal/admin/renewals/${encodeURIComponent(dealId)}/appears-renewed`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ decision: 'decline', reason: reason.trim(), evidenceKey }),
            })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setMsg(kind === 'confirm' ? 'Recorded: renewed with us.' : 'Flag cleared.')
        router.refresh()
      } else {
        setMsg(data.message ?? 'Did not save.')
      }
    } catch {
      setMsg('Network error.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border border-violet-200 bg-white rounded-xl px-4 py-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="font-heading font-bold text-navy text-sm">
          {dealName} <span className="text-cool-400 font-normal">· {money(amount)} · was in {from === 'action' ? 'Action now' : 'Lapsed'}</span>
        </p>
        <a href={zohoHref} target="_blank" rel="noreferrer" className="text-xs font-semibold text-navy hover:text-ink">Zoho</a>
      </div>
      <p className="mt-1 text-[11px] font-ui text-violet-800">
        Why: {evidence.signals.map(s => SIGNAL_LABEL[s] ?? s).join('; ')}.
      </p>
      <div className="mt-2 grid sm:grid-cols-2 gap-2 text-xs font-ui">
        <div className="rounded-lg border border-cool-200 bg-cool-50/60 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-cool-400 font-semibold mb-0.5">Zoho recorded</p>
          <p className="text-cool-600">closed {evidence.zoho.closingDate ?? 'n/a'} · {evidence.zoho.lender ?? 'lender n/a'} · {evidence.zoho.rate != null ? `${evidence.zoho.rate}%` : 'rate n/a'} · matures {evidence.zoho.maturity ?? 'n/a'}</p>
        </div>
        <div className="rounded-lg border border-cool-200 bg-cool-50/60 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-cool-400 font-semibold mb-0.5">The monitoring feed sees</p>
          <p className="text-cool-600">started {evidence.feed.startDate ?? 'n/a'} · {evidence.feed.lender} · {evidence.feed.rate != null ? `${evidence.feed.rate}%` : 'rate n/a'} · {money(evidence.feed.amount)} · matures {evidence.feed.maturity ?? 'n/a'}</p>
        </div>
      </div>
      {canDecide ? (
        <div className="mt-2.5 flex items-center gap-2 flex-wrap">
          <button
            onClick={() => act('confirm')}
            disabled={busy}
            className={`text-[11px] font-semibold rounded-lg px-3 py-1 border disabled:opacity-50 ${armed === 'confirm' ? 'bg-navy text-white border-navy' : 'text-green-800 border-green-300 hover:border-green-500'}`}
          >
            {armed === 'confirm' ? 'Confirm: renewed with us?' : 'Confirm renewed with us'}
          </button>
          <button
            onClick={() => act('decline')}
            disabled={busy}
            className={`text-[11px] font-semibold rounded-lg px-3 py-1 border disabled:opacity-50 ${armed === 'decline' ? 'bg-navy text-white border-navy' : 'text-navy border-navy/25 hover:border-navy'}`}
          >
            {armed === 'decline' ? 'Confirm: not a renewal?' : 'Not a renewal'}
          </button>
          {armed === 'decline' && (
            <input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="why the flag is wrong (required)"
              className="text-[11px] font-ui border border-cool-300 rounded-lg px-2 py-1 flex-1 min-w-[180px]"
            />
          )}
          {msg && <span className="text-[11px] font-ui text-cool-500">{msg}</span>}
        </div>
      ) : (
        <p className="mt-2 text-[11px] font-ui text-cool-400">Review only; the decide permission is needed to confirm or clear.</p>
      )}
    </div>
  )
}
