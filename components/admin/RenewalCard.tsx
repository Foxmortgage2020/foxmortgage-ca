'use client'

// One renewal, the whole reason a client answers the phone. The payment-shock
// preview, the status, the one-tap prep, and the enumerated status actions
// (two-tap confirm, written to Zoho through the confirmed-action route). Every
// figure carries its source; where the current rate is not on file it says so
// rather than estimating.

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import type { PaymentShock, RenewalActionDef, RenewalDeal } from '@/lib/renewals'
import { termAnomaly, termYearsLabel } from '@/lib/renewals'

function money(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-CA')
}
function money2(n: number): string {
  return '$' + n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function shortDate(ymd: string | null): string {
  if (!ymd) return ''
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return ''
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function ShockRow({ shock, currentRateType }: { shock: PaymentShock; currentRateType: string | null }) {
  const delta = shock.monthlyDelta
  const rises = delta != null && delta > 0
  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2">
      <p className="text-[11px] font-body text-gray-400 uppercase tracking-wide mb-1">Payment shock preview</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1.5 text-xs font-body">
        <div>
          <p className="text-gray-500">Current rate</p>
          {shock.currentRateKnown ? (
            <p className="text-navy font-semibold">
              {shock.currentRate}%{' '}
              <span className="text-gray-400 font-normal">{currentRateType ? currentRateType.toLowerCase() : ''}</span>
            </p>
          ) : (
            <p className="text-amber-700">not on file</p>
          )}
        </div>
        <div>
          <p className="text-gray-500">Best approved</p>
          {shock.newRate != null ? (
            <p className="text-navy font-semibold">
              {shock.newRate}%{' '}
              <span className="text-gray-400 font-normal">
                {shock.newRateTermMonths ? `${shock.newRateTermMonths / 12}yr fix` : ''}
              </span>
            </p>
          ) : (
            <p className="text-amber-700">book unavailable</p>
          )}
        </div>
        <div>
          <p className="text-gray-500">Current payment</p>
          <p className="text-navy">{shock.currentPayment != null ? money2(shock.currentPayment) : 'n/a'}</p>
        </div>
        <div>
          <p className="text-gray-500">New payment</p>
          <p className="text-navy">{shock.newPayment != null ? money2(shock.newPayment) : 'n/a'}</p>
        </div>
      </div>
      {delta != null ? (
        <p className={`mt-1.5 text-sm font-heading font-bold ${rises ? 'text-red-600' : 'text-green-700'}`}>
          {rises ? '+' : ''}
          {money2(delta)}/mo{' '}
          <span className="text-[11px] font-body font-normal text-gray-500">
            {rises ? 'more at renewal' : 'less at renewal'}
          </span>
        </p>
      ) : (
        <p className="mt-1.5 text-xs font-body text-gray-400">
          {!shock.currentRateKnown
            ? 'No delta: the current rate is not on file.'
            : 'No delta: the approved rate book is unavailable.'}
        </p>
      )}
      <p className="mt-1 text-[10px] font-body text-gray-400">
        Estimated at a {shock.amortYears}-year amortization on the original balance {money(shock.balance)}
        {shock.newRateAsOf ? `; best approved rate as of ${shortDate(shock.newRateAsOf)}` : ''}. The delta isolates
        the rate change; it is not a commitment.
      </p>
    </div>
  )
}

export default function RenewalCard({
  deal,
  shock,
  daysRemaining,
  tone,
  prepHref,
  dealHref,
  zohoHref,
  canDecide,
  actions,
}: {
  deal: RenewalDeal
  shock: PaymentShock
  daysRemaining: number | null
  tone: 'red' | 'amber' | 'gray' | 'green'
  prepHref: string
  dealHref: string | null
  zohoHref: string
  canDecide: boolean
  actions: RenewalActionDef[]
}) {
  const router = useRouter()
  const [armed, setArmed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function act(key: string) {
    if (armed !== key) {
      setArmed(key)
      setMsg(null)
      setTimeout(() => setArmed(a => (a === key ? null : a)), 4000)
      return
    }
    setArmed(null)
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/portal/admin/renewals/${encodeURIComponent(deal.id)}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: key }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMsg(data.message ?? 'The status change did not land.')
      } else {
        setMsg(data.auditWarning ?? 'Saved.')
        router.refresh()
      }
    } catch {
      setMsg('Network error; the status change did not land.')
    } finally {
      setBusy(false)
    }
  }

  const barCls =
    tone === 'red' ? 'border-l-red-500' : tone === 'amber' ? 'border-l-amber-500' : tone === 'green' ? 'border-l-green-500' : 'border-l-gray-300'
  const anomaly = termAnomaly(deal.termYears)

  return (
    <div className={`border border-gray-200 border-l-4 ${barCls} rounded-xl bg-white px-4 py-3`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="font-heading font-bold text-navy text-sm truncate">
            {deal.contactName ?? deal.dealName}
          </p>
          <p className="text-xs font-body text-gray-500">
            {money(deal.amount)}
            {deal.lenderName ? ` · ${deal.lenderName}` : ''}
            {deal.dealName && deal.contactName ? ` · ${deal.dealName}` : ''}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs font-body text-gray-500">matures {shortDate(deal.maturityDate)}</p>
          {daysRemaining != null && (
            <p
              className={`text-sm font-heading font-bold ${
                daysRemaining < 0 ? 'text-red-600' : daysRemaining <= 130 ? 'text-amber-700' : 'text-navy'
              }`}
            >
              {daysRemaining < 0 ? `${Math.abs(daysRemaining)}d overdue` : `${daysRemaining}d out`}
            </p>
          )}
        </div>
      </div>

      <ShockRow shock={shock} currentRateType={deal.rateType} />

      <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px] font-body">
        <span className="text-gray-400">
          Status:{' '}
          {deal.renewalStatus ? (
            <span className="text-navy font-semibold">{deal.renewalStatus}</span>
          ) : (
            <span className={tone === 'red' ? 'text-red-600 font-semibold' : 'text-gray-500'}>
              no outcome recorded
            </span>
          )}
        </span>
        {deal.renewalInProgress && (
          <span className="px-1.5 py-0.5 rounded bg-lime/20 text-navy font-semibold">in progress</span>
        )}
        <span className="text-gray-400">
          Term {termYearsLabel(deal.termYears)}
        </span>
        {anomaly && (
          <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200" title={anomaly}>
            term anomaly
          </span>
        )}
      </div>

      <div className="mt-2.5 flex items-center gap-2 flex-wrap">
        <Link
          href={prepHref}
          className="text-xs font-semibold text-white bg-navy rounded-lg px-3 py-1.5 hover:bg-navy/90"
        >
          Prep a call
        </Link>
        {dealHref ? (
          <Link href={dealHref} className="text-xs font-semibold text-navy border border-navy/25 rounded-lg px-3 py-1.5 hover:border-navy">
            Deal room
          </Link>
        ) : null}
        <a
          href={zohoHref}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-semibold text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:border-gray-400"
        >
          Open in Zoho
        </a>
      </div>

      {canDecide && (
        <div className="mt-2.5 border-t border-gray-100 pt-2.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            {actions.map(a => (
              <button
                key={a.key}
                onClick={() => act(a.key)}
                disabled={busy}
                title={a.hint}
                className={`text-[11px] font-semibold rounded-lg px-2.5 py-1 border disabled:opacity-50 ${
                  armed === a.key
                    ? 'bg-navy text-white border-navy'
                    : a.tone === 'stop'
                      ? 'text-red-700 border-red-200 hover:border-red-400'
                      : a.tone === 'go'
                        ? 'text-navy border-navy/25 hover:border-navy'
                        : 'text-gray-600 border-gray-200 hover:border-gray-400'
                }`}
              >
                {armed === a.key ? `Confirm: ${a.label}?` : a.label}
              </button>
            ))}
          </div>
          {msg && <p className="mt-1.5 text-[11px] font-body text-gray-500">{msg}</p>}
        </div>
      )}
    </div>
  )
}
