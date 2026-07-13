'use client'

// One monitored mortgage as an opportunity: the current position, Fox's
// analysis beside the service's figure (each sourced), and the actions —
// one-tap scenario, call prep, portal-side status, and the savings report.
// Nothing here is presented as verified; it is analysis from monitored data.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { FoxAnalysis } from '@/lib/smm'

const money = (n: number | null | undefined) => (n == null ? 'n/a' : '$' + Math.round(n).toLocaleString('en-CA'))
const money2 = (n: number | null | undefined) => (n == null ? 'n/a' : '$' + n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
function shortDate(ymd: string | null) {
  if (!ymd) return 'n/a'
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'n/a'
}

const STATUS_ACTIONS = [
  { key: 'contacted', label: 'Contacted' },
  { key: 'in_discussion', label: 'In discussion' },
  { key: 'application_out', label: 'Application out' },
  { key: 'converted', label: 'Converted' },
  { key: 'declined', label: 'Declined' },
] as const

export default function OpportunityCard({
  householdId,
  uploadId,
  name,
  extraBorrowers,
  rate,
  rateType,
  lender,
  balance,
  maturity,
  analysis,
  serviceSavings,
  serviceRelief,
  scenarioHref,
  prepHref,
  status,
  canManage,
}: {
  householdId: string
  uploadId: string
  name: string
  extraBorrowers: number
  rate: number | null
  rateType: string | null
  lender: string
  balance: number | null
  maturity: string | null
  analysis: FoxAnalysis
  serviceSavings: number | null
  serviceRelief: number | null
  scenarioHref: string
  prepHref: string
  status: string | null
  canManage: boolean
}) {
  const router = useRouter()
  const [armed, setArmed] = useState<string | null>(null)
  const [altArmed, setAltArmed] = useState(false)
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
    try {
      const res = await fetch('/api/portal/admin/opportunities/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ householdId, uploadId, status: key }),
      })
      const data = await res.json().catch(() => ({}))
      setMsg(res.ok ? 'Saved.' : (data.message ?? 'Did not save.'))
      if (res.ok) router.refresh()
    } catch {
      setMsg('Network error.')
    } finally {
      setBusy(false)
    }
  }

  const a = analysis
  // Fox and the service disagree when Fox says stay-put/marginal but the
  // service shows a positive saving, or vice versa.
  const foxPositive = (a.netBenefit ?? 0) > 0
  const servicePositive = (serviceSavings ?? 0) > 0
  const blocked = a.bucket === 'insufficient' || a.bucket === 'review'
  const disagree = !blocked && serviceSavings != null && foxPositive !== servicePositive

  return (
    <div className="border border-gray-200 rounded-xl bg-white px-4 py-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="font-heading font-bold text-navy text-sm">
            {name}
            {extraBorrowers > 0 && <span className="text-gray-400 font-normal"> +{extraBorrowers} borrower{extraBorrowers === 1 ? '' : 's'}</span>}
          </p>
          <p className="text-xs font-body text-gray-500">
            {rate != null ? `${rate}% ${rateType ?? ''}` : 'rate not on file'} · {lender} · {money(balance)}
            {maturity ? ` · matures ${shortDate(maturity)}` : ''}
          </p>
        </div>
        {status && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-lime/20 text-navy shrink-0">{status.replace(/_/g, ' ')}</span>
        )}
      </div>

      {/* Side by side: Fox's analysis | the service's figure */}
      <div className="mt-2 grid sm:grid-cols-2 gap-2">
        <div className="rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2">
          <p className="text-[11px] font-body text-gray-400 uppercase tracking-wide mb-1">
            Fox&apos;s analysis
            {a.transaction && (
              <span className="ml-1 normal-case text-navy font-semibold">· {a.transaction === 'refinance' ? 'Refinance (break)' : 'Switch'}</span>
            )}
          </p>
          {blocked || a.comparable == null ? (
            <p className="text-xs font-body text-amber-700">{a.blockReason ?? 'Not analyzable (placeholder, missing rate, or the approved book is unavailable).'}</p>
          ) : (
            <div className="text-xs font-body space-y-0.5">
              <p>
                Best eligible {a.comparable.kind === 'floating' ? `${a.comparable.rateType ?? 'floating'} ` : ''}
                <span className="text-navy font-semibold">{a.comparable.rate}%</span>{' '}
                {a.comparable.kind === 'floating' && a.comparable.primeUsed != null && (
                  <span className="text-gray-400">(prime {a.comparable.primeUsed}% {a.comparable.variance != null ? (a.comparable.variance < 0 ? a.comparable.variance : `+${a.comparable.variance}`) : ''}) </span>
                )}
                <span className="text-gray-400">{a.comparable.lender}, {a.productClass}, as of {shortDate(a.comparable.asOf)}</span>
              </p>
              <p className="text-gray-600">
                Payment {money2(a.currentPayment)} → {money2(a.newPayment)}
                {a.monthlySaving && a.monthlySaving > 0 ? <span className="text-green-700 font-semibold"> ({money2(a.monthlySaving)}/mo saved)</span> : ''}
              </p>
              <p className={`font-heading font-bold ${(a.netBenefit ?? 0) > 0 ? 'text-green-700' : 'text-gray-600'}`}>
                Net benefit {money(a.netBenefit)}{a.horizonMonths != null ? ` over ${a.horizonMonths} mo` : ''}
              </p>
              {a.penalty && (
                <p className="text-gray-500">
                  Penalty ~{money(a.penalty.threeMonthsInterest)} (3mo interest){a.breakEvenMonths != null ? `, break-even ${Math.ceil(a.breakEvenMonths)} mo` : ''}
                </p>
              )}
              {a.transaction === 'switch' && <p className="text-[10px] text-gray-500">Switch at maturity: no penalty applies.</p>}
              {a.requalification && <p className="text-[10px] text-amber-700">Refinance: requires requalifying at the stress test; this assumes qualification.</p>}
              {a.penalty && !a.penalty.methodologyKnown && (
                <p className="text-[10px] text-amber-700">Fixed IRD methodology not documented for this lender; no single penalty asserted.</p>
              )}
              {a.alternative && (
                <div className="mt-1 border-t border-gray-100 pt-1 space-y-0.5">
                  <p className="text-[10px] uppercase tracking-wide text-amber-700 font-semibold">
                    {a.alternative.crossFamily ? 'Alternative, different rate type' : 'Steady option, same rate type'}
                  </p>
                  <p className="text-gray-600">
                    {a.alternative.comparable.rateType ?? a.alternative.comparable.kind}{' '}
                    <span className="text-navy font-semibold">{a.alternative.comparable.rate}%</span>{' '}
                    {a.alternative.comparable.primeUsed != null && (
                      <span className="text-gray-400">
                        (prime {a.alternative.comparable.primeUsed}%{' '}
                        {a.alternative.comparable.variance != null ? (a.alternative.comparable.variance < 0 ? a.alternative.comparable.variance : `+${a.alternative.comparable.variance}`) : ''}
                        ){' '}
                      </span>
                    )}
                    <span className="text-gray-400">{a.alternative.comparable.lender}, as of {shortDate(a.alternative.comparable.asOf)}</span>
                    {' '}payment {money2(a.alternative.newPayment)}
                    {a.alternative.monthlySaving > 0 ? ` (${money2(a.alternative.monthlySaving)}/mo less)` : ''}
                  </p>
                  {a.alternative.riskLine && <p className="text-[10px] text-amber-700">{a.alternative.riskLine}</p>}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2">
          <p className="text-[11px] font-body text-gray-400 uppercase tracking-wide mb-1">Strategic Mortgage Monitoring</p>
          <div className="text-xs font-body space-y-0.5">
            <p>
              Savings potential{' '}
              {serviceSavings == null ? <span className="text-gray-400">not computed</span> : <span className={serviceSavings > 0 ? 'text-green-700 font-semibold' : 'text-gray-600 font-semibold'}>{money2(serviceSavings)}</span>}
            </p>
            <p className="text-gray-500">Payment relief {serviceRelief == null ? 'not computed' : `${money2(serviceRelief)}/mo`}</p>
            <p className="text-[10px] text-gray-400">The monitoring service&apos;s own figure, estimated.</p>
          </div>
        </div>
      </div>
      {disagree && (
        <p className="mt-1.5 text-[11px] font-body text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          Fox&apos;s analysis and the service&apos;s figure disagree on direction. Disagreement is information; check both before the call.
        </p>
      )}
      <p className="mt-1 text-[10px] font-body text-gray-400">
        Estimates from monitored data; every rate carries its sheet date. Underwriting begins at application.
      </p>

      {/* Actions */}
      <div className="mt-2.5 flex items-center gap-2 flex-wrap">
        <Link href={scenarioHref} className="text-xs font-semibold text-white bg-navy rounded-lg px-3 py-1.5 hover:bg-navy/90">Open scenario</Link>
        <Link href={prepHref} className="text-xs font-semibold text-navy border border-navy/25 rounded-lg px-3 py-1.5 hover:border-navy">Prep a call</Link>
        <a href={`/api/portal/admin/opportunities/${encodeURIComponent(householdId)}/pdf?upload=${encodeURIComponent(uploadId)}`} className="text-xs font-semibold text-navy border border-navy/25 rounded-lg px-3 py-1.5 hover:border-navy">Savings report</a>
        {canManage && a.alternative?.crossFamily && (
          // Two-tap confirmed action, POST-only: recommending a different rate
          // family on a client document is Michael's explicit call. A GET can
          // never mint the approved variant (bookmarks and crafted links
          // replay), and the applied approval is recorded on the
          // savings-analysis log by the route.
          <form
            method="POST"
            action={`/api/portal/admin/opportunities/${encodeURIComponent(householdId)}/pdf`}
            onSubmit={e => {
              if (!altArmed) {
                e.preventDefault()
                setAltArmed(true)
                setTimeout(() => setAltArmed(false), 4000)
              }
            }}
            className="inline"
          >
            <input type="hidden" name="upload" value={uploadId} />
            <input type="hidden" name="alt" value="approve" />
            <button
              type="submit"
              className={`text-xs font-semibold rounded-lg px-3 py-1.5 border ${altArmed ? 'bg-navy text-white border-navy' : 'text-amber-800 border-amber-300 hover:border-amber-500'}`}
            >
              {altArmed
                ? `Confirm: recommend the ${a.alternative.comparable.rateType ?? 'other'} option?`
                : `Report with the ${a.alternative.comparable.rateType ?? 'other'} option`}
            </button>
          </form>
        )}
      </div>

      {canManage && (
        <div className="mt-2.5 border-t border-gray-100 pt-2.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            {STATUS_ACTIONS.map(s => (
              <button
                key={s.key}
                onClick={() => act(s.key)}
                disabled={busy}
                className={`text-[11px] font-semibold rounded-lg px-2.5 py-1 border disabled:opacity-50 ${armed === s.key ? 'bg-navy text-white border-navy' : 'text-navy border-navy/25 hover:border-navy'}`}
              >
                {armed === s.key ? `Confirm: ${s.label}?` : s.label}
              </button>
            ))}
          </div>
          {msg && <p className="mt-1.5 text-[11px] font-body text-gray-500">{msg}</p>}
        </div>
      )}
    </div>
  )
}
