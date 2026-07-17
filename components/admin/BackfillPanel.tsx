'use client'

// Backfill review: scan candidates in small batches (Zoho rate-limit + timeout
// safe), then approve fills per deal. The client sends only field KEYS to apply;
// the server recomputes the values from the persisted export and the live Zoho
// read, so a stale or tampered value can never be written. Conflicts are shown
// read-only — the server would refuse to write them anyway.

import { useState } from 'react'

export interface BackfillCandidate {
  householdId: string
  name: string
  maturityDate: string | null
  rate: number | null
  lenderDisplay: string
}

interface Fill {
  field: string
  value: string | number
}
interface Conflict {
  field: string
  zohoValue: string
  exportValue: string
}
interface DealView {
  dealId: string
  dealName: string
  stage: string | null
  current: { Maturity_Date: string | null; Mortgage_Rate: number | null }
  fills: Fill[]
  conflicts: Conflict[]
}
interface ClaimantView {
  householdId: string
  name: string
  address: string | null
  amount: number | null
  maturityDate: string | null
  rate: number | null
}
interface CandidateDealView {
  dealId: string
  dealName: string
  stage: string | null
  street: string | null
  city: string | null
  amount: number | null
  current: { Maturity_Date: string | null; Mortgage_Rate: number | null }
}
type ScanResult =
  | { householdId: string; status: 'not_in_upload' }
  | { householdId: string; name: string; status: 'placeholder' }
  | { householdId: string; name: string; status: 'error'; message: string }
  | { householdId: string; name: string; status: 'ambiguous' | 'unmatched'; candidates: { id: string; fullName: string }[]; export: unknown }
  | {
      householdId: string
      name: string
      status: 'matched'
      matchedBy: string | null
      contact: { id: string }
      deals: DealView[]
      export: unknown
      /** Several export mortgages share this identity; only deals attributed
       * to this mortgage by evidence are shown. */
      sharedIdentity?: boolean
      withheldContested?: number
    }
  | {
      householdId: string
      name: string
      status: 'needs_manual_match'
      matchedBy: string | null
      contact: { id: string }
      claimants: ClaimantView[]
      candidateDeals: CandidateDealView[]
      export: unknown
    }

const CHUNK = 6
const FIELD_LABEL: Record<string, string> = { Maturity_Date: 'Maturity date', Mortgage_Rate: 'Mortgage rate' }

function fmtFill(f: Fill): string {
  if (f.field === 'Mortgage_Rate') return `${f.value}%`
  return String(f.value)
}

export default function BackfillPanel({
  uploadId,
  candidates,
  canManage,
}: {
  uploadId: string
  candidates: BackfillCandidate[]
  canManage: boolean
}) {
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<ScanResult[]>([])
  const [scanned, setScanned] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function scan() {
    setScanning(true)
    setErr(null)
    setResults([])
    setProgress(0)
    const ids = candidates.map(c => c.householdId)
    const acc: ScanResult[] = []
    try {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK)
        const res = await fetch('/api/portal/admin/opportunities/backfill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uploadId, householdIds: chunk }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setErr(data.message ?? 'Scan failed.')
          break
        }
        acc.push(...(data.results ?? []))
        setResults([...acc])
        setProgress(Math.min(i + CHUNK, ids.length))
      }
      setScanned(true)
    } catch {
      setErr('Network error during scan.')
    } finally {
      setScanning(false)
    }
  }

  const matched = results.filter((r): r is Extract<ScanResult, { status: 'matched' }> => r.status === 'matched')
  const withFills = matched.filter(r => r.deals.some(d => d.fills.length > 0))
  const withConflicts = matched.filter(r => r.deals.some(d => d.conflicts.length > 0))
  const ambiguous = results.filter(r => r.status === 'ambiguous')
  const unmatched = results.filter(r => r.status === 'unmatched')
  const errored = results.filter(r => r.status === 'error')
  const placeholders = results.filter(r => r.status === 'placeholder')
  // One manual-match card per CONTACT: every household sharing the identity
  // scans to the same card, so dedupe on the contact id.
  const manualByContact = new Map<string, Extract<ScanResult, { status: 'needs_manual_match' }>>()
  for (const r of results) {
    if (r.status === 'needs_manual_match' && !manualByContact.has(r.contact.id)) manualByContact.set(r.contact.id, r)
  }
  const needsManual = Array.from(manualByContact.values())

  const nameByHid = new Map(candidates.map(c => [c.householdId, c.name]))

  return (
    <div className="space-y-4">
      <div className="bg-white border border-cool-200 rounded-xl p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={scan}
            disabled={scanning || candidates.length === 0}
            className="text-sm font-semibold text-white bg-navy rounded-lg px-4 py-2 hover:bg-navy/90 disabled:opacity-50"
          >
            {scanning ? `Scanning ${progress}/${candidates.length}…` : scanned ? 'Re-scan' : `Scan ${candidates.length} files`}
          </button>
          {scanned && !scanning && (
            <p className="text-sm font-ui text-cool-500">
              {withFills.length} with fillable gaps · {withConflicts.length} with conflicts ·{' '}
              {needsManual.length} need a manual match · {ambiguous.length} ambiguous ·{' '}
              {unmatched.length} unmatched{errored.length ? ` · ${errored.length} errored` : ''}
            </p>
          )}
        </div>
        {err && <p className="mt-2 text-sm font-ui text-red-600">{err}</p>}
        {scanning && (
          <div className="mt-3 h-1.5 bg-cool-100 rounded-full overflow-hidden">
            <div className="h-full bg-navy transition-all" style={{ width: `${(progress / Math.max(candidates.length, 1)) * 100}%` }} />
          </div>
        )}
      </div>

      {withFills.length > 0 && (
        <section>
          <h2 className="font-heading font-bold text-navy text-lg mb-2">Ready to fill</h2>
          <div className="space-y-2">
            {withFills.map(r => (
              <MatchedCard key={r.householdId} result={r} uploadId={uploadId} canManage={canManage} />
            ))}
          </div>
        </section>
      )}

      {needsManual.length > 0 && (
        <section>
          <h2 className="font-heading font-bold text-navy text-lg mb-2">Needs a manual match</h2>
          <p className="text-xs font-ui text-cool-400 mb-2">
            Two or more mortgages in the export share this identity (same email, phone, or name), and the Zoho
            deal could not be attributed by property address or amount. Nothing is proposed automatically; pick
            which mortgage each deal belongs to.
          </p>
          <div className="space-y-2">
            {needsManual.map(r => (
              <ManualMatchCard key={r.contact.id} result={r} uploadId={uploadId} canManage={canManage} />
            ))}
          </div>
        </section>
      )}

      {withConflicts.length > 0 && (
        <section>
          <h2 className="font-heading font-bold text-navy text-lg mb-2">Conflicts to review</h2>
          <p className="text-xs font-ui text-cool-400 mb-2">
            Both Zoho and the export hold a value and they differ. Nothing is proposed; resolve these in Zoho.
          </p>
          <div className="space-y-2">
            {withConflicts.map(r => (
              <div key={r.householdId} className="border border-amber-200 bg-amber-50/50 rounded-xl px-4 py-3">
                <p className="font-heading font-bold text-navy text-sm">{r.name}</p>
                {r.deals.flatMap(d =>
                  d.conflicts.map(c => (
                    <p key={`${d.dealId}-${c.field}`} className="text-xs font-ui text-amber-800 mt-1">
                      {d.dealName}: {FIELD_LABEL[c.field] ?? c.field} — Zoho{' '}
                      <span className="font-semibold">{c.zohoValue}</span> vs export{' '}
                      <span className="font-semibold">{c.exportValue}</span>
                    </p>
                  )),
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {(ambiguous.length > 0 || unmatched.length > 0 || errored.length > 0 || placeholders.length > 0) && scanned && (
        <section>
          <h2 className="font-heading font-bold text-navy text-lg mb-2">Not matched</h2>
          <div className="bg-white border border-cool-200 rounded-xl p-4 text-sm font-ui text-cool-600 space-y-2">
            {ambiguous.length > 0 && (
              <p>
                <span className="font-semibold text-navy">{ambiguous.length} ambiguous</span> — more than one Zoho contact
                matched; open Zoho to pick: {ambiguous.map(r => nameByHid.get(r.householdId) ?? r.householdId).slice(0, 8).join(', ')}
                {ambiguous.length > 8 ? '…' : ''}
              </p>
            )}
            {unmatched.length > 0 && (
              <p>
                <span className="font-semibold text-navy">{unmatched.length} unmatched</span> — no Zoho contact found
                (often a prospect not yet in the CRM).
              </p>
            )}
            {placeholders.length > 0 && (
              <p>
                <span className="font-semibold text-navy">{placeholders.length} placeholder</span> — a $1 amount or
                balance is a vendor data problem; nothing is ever proposed from those rows. Confirm the real figures
                with the lender.
              </p>
            )}
            {errored.length > 0 && (
              <p className="text-red-600">
                <span className="font-semibold">{errored.length} errored</span> during lookup; re-scan to retry.
              </p>
            )}
          </div>
        </section>
      )}

      {scanned && withFills.length === 0 && withConflicts.length === 0 && needsManual.length === 0 && !scanning && (
        <p className="text-sm font-ui text-cool-400">No empty fields to fill from this export. Everything matched is already complete.</p>
      )}
    </div>
  )
}

function MatchedCard({
  result,
  uploadId,
  canManage,
}: {
  result: Extract<ScanResult, { status: 'matched' }>
  uploadId: string
  canManage: boolean
}) {
  return (
    <div className="border border-cool-200 rounded-xl bg-white px-4 py-3">
      <p className="font-heading font-bold text-navy text-sm">
        {result.name}
        {result.matchedBy && <span className="text-cool-400 font-normal"> · matched by {result.matchedBy}</span>}
      </p>
      {result.sharedIdentity && (
        <p className="mt-0.5 text-[11px] font-ui text-amber-700">
          Shared identity: another mortgage in the export carries the same contact details. Only the deals
          attributed to this mortgage by property address or amount are shown
          {result.withheldContested ? `; ${result.withheldContested} contested deal${result.withheldContested === 1 ? '' : 's'} withheld to the manual-match card` : ''}.
        </p>
      )}
      <div className="mt-2 space-y-2">
        {result.deals
          .filter(d => d.fills.length > 0)
          .map(d => (
            <DealFill key={d.dealId} householdId={result.householdId} deal={d} uploadId={uploadId} canManage={canManage} />
          ))}
      </div>
    </div>
  )
}

const money = (n: number | null) => (n == null ? 'n/a' : '$' + Math.round(n).toLocaleString('en-CA'))

// One card per shared-identity CONTACT: the claimant mortgages side by side,
// then each contested Zoho deal with a pick. Nothing writes until Michael
// binds a deal to a mortgage and confirms; the server re-validates the pick
// and still fills only fields that are empty at write time.
function ManualMatchCard({
  result,
  uploadId,
  canManage,
}: {
  result: Extract<ScanResult, { status: 'needs_manual_match' }>
  uploadId: string
  canManage: boolean
}) {
  return (
    <div className="border border-amber-200 bg-amber-50/40 rounded-xl px-4 py-3">
      <p className="font-heading font-bold text-navy text-sm">
        {result.claimants.map(c => c.name).filter((n, i, a) => a.indexOf(n) === i).join(' / ')}
        <span className="text-cool-400 font-normal"> · {result.claimants.length} mortgages share this identity</span>
      </p>
      <div className="mt-2 grid sm:grid-cols-2 gap-2">
        {result.claimants.map(c => (
          <div key={c.householdId} className="rounded-lg border border-cool-200 bg-white px-3 py-2 text-xs font-ui">
            <p className="font-semibold text-navy">{c.name}</p>
            <p className="text-cool-500">{c.address ?? 'address not in export'}</p>
            <p className="text-cool-500">
              {money(c.amount)} · {c.rate != null ? `${c.rate}%` : 'rate n/a'} · matures {c.maturityDate ?? 'n/a'}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-2 space-y-2">
        {result.candidateDeals.map(d => (
          <ManualDealPick key={d.dealId} deal={d} claimants={result.claimants} uploadId={uploadId} canManage={canManage} />
        ))}
        {result.candidateDeals.length === 0 && (
          <p className="text-xs font-ui text-cool-500">No contested deals to place; the contact&apos;s records are already attributed.</p>
        )}
      </div>
    </div>
  )
}

function ManualDealPick({
  deal,
  claimants,
  uploadId,
  canManage,
}: {
  deal: CandidateDealView
  claimants: ClaimantView[]
  uploadId: string
  canManage: boolean
}) {
  const [picked, setPicked] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const claimant = claimants.find(c => c.householdId === picked) ?? null
  // What the pick could fill: empty deal fields the chosen mortgage has values
  // for. Display only; the server recomputes the authoritative values.
  const fillable: { field: string; value: string }[] = claimant
    ? [
        ...(!deal.current.Maturity_Date && claimant.maturityDate ? [{ field: 'Maturity_Date', value: claimant.maturityDate }] : []),
        ...(deal.current.Mortgage_Rate == null && claimant.rate != null ? [{ field: 'Mortgage_Rate', value: `${claimant.rate}%` }] : []),
      ]
    : []

  function pick(householdId: string) {
    setPicked(householdId)
    const c = claimants.find(x => x.householdId === householdId)
    const s = new Set<string>()
    if (c && !deal.current.Maturity_Date && c.maturityDate) s.add('Maturity_Date')
    if (c && deal.current.Mortgage_Rate == null && c.rate != null) s.add('Mortgage_Rate')
    setSelected(s)
    setArmed(false)
    setMsg(null)
  }

  async function apply() {
    if (!picked) return
    if (!armed) {
      setArmed(true)
      setTimeout(() => setArmed(false), 4000)
      return
    }
    setArmed(false)
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/portal/admin/opportunities/backfill/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId, householdId: picked, dealId: deal.dealId, fields: Array.from(selected), manualMatch: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setDone(`Wrote ${(data.written ?? []).map((f: string) => FIELD_LABEL[f] ?? f).join(', ')} from ${claimant?.name ?? 'the picked mortgage'}.`)
        if (data.auditWarning) setMsg(data.auditWarning)
      } else {
        setMsg(data.message ?? 'Did not write.')
      }
    } catch {
      setMsg('Network error.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50/60 px-3 py-2">
        <p className="text-xs font-ui text-green-800">
          <span className="font-semibold">{deal.dealName}</span> · {done}
        </p>
        {msg && <p className="text-[11px] font-ui text-amber-700 mt-0.5">{msg}</p>}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-cool-200 bg-white px-3 py-2">
      <p className="text-xs font-ui text-cool-500">
        <span className="font-semibold text-navy">{deal.dealName}</span>
        {deal.stage ? <span className="text-cool-400"> · {deal.stage}</span> : null}
      </p>
      <p className="text-[11px] font-ui text-cool-400">
        {[deal.street, deal.city].filter(Boolean).join(', ') || 'no address on the deal'} · {money(deal.amount)} · maturity{' '}
        {deal.current.Maturity_Date ?? 'empty'} · rate {deal.current.Mortgage_Rate != null ? `${deal.current.Mortgage_Rate}%` : 'empty'}
      </p>
      <div className="mt-1.5 flex items-center gap-3 flex-wrap">
        <span className="text-[11px] font-ui text-cool-500">This deal belongs to:</span>
        {claimants.map(c => (
          <label key={c.householdId} className="flex items-center gap-1.5 text-xs font-ui text-navy cursor-pointer">
            <input
              type="radio"
              name={`pick-${deal.dealId}`}
              checked={picked === c.householdId}
              onChange={() => pick(c.householdId)}
              disabled={!canManage || busy}
              className="accent-navy"
            />
            <span>
              {c.name} <span className="text-cool-400">({money(c.amount)}, matures {c.maturityDate ?? 'n/a'})</span>
            </span>
          </label>
        ))}
      </div>
      {claimant && fillable.length === 0 && (
        <p className="mt-1 text-[11px] font-ui text-cool-400">Nothing to fill for that pick; the deal&apos;s fields are already set.</p>
      )}
      {claimant && fillable.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {fillable.map(f => (
            <label key={f.field} className="flex items-center gap-2 text-xs font-ui text-navy cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(f.field)}
                onChange={() =>
                  setSelected(s => {
                    const n = new Set(s)
                    if (n.has(f.field)) n.delete(f.field)
                    else n.add(f.field)
                    return n
                  })
                }
                disabled={!canManage || busy}
                className="accent-navy"
              />
              <span>
                Set <span className="font-semibold">{FIELD_LABEL[f.field] ?? f.field}</span> to{' '}
                <span className="font-semibold text-green-700">{f.value}</span>{' '}
                <span className="text-cool-400">(currently empty)</span>
              </span>
            </label>
          ))}
        </div>
      )}
      {canManage ? (
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <button
            onClick={apply}
            disabled={busy || !picked || selected.size === 0}
            className={`text-[11px] font-semibold rounded-lg px-3 py-1 border disabled:opacity-50 ${armed ? 'bg-navy text-white border-navy' : 'text-navy border-navy/25 hover:border-navy'}`}
          >
            {busy ? 'Writing…' : armed ? 'Confirm this manual match?' : 'Match and backfill'}
          </button>
          {msg && <span className="text-[11px] font-ui text-red-600">{msg}</span>}
        </div>
      ) : (
        <p className="mt-1.5 text-[11px] font-ui text-cool-400">Review only; manage permission needed to pick and write.</p>
      )}
    </div>
  )
}

function DealFill({
  householdId,
  deal,
  uploadId,
  canManage,
}: {
  householdId: string
  deal: DealView
  uploadId: string
  canManage: boolean
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(deal.fills.map(f => f.field)))
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  function toggle(field: string) {
    setSelected(s => {
      const n = new Set(s)
      if (n.has(field)) n.delete(field)
      else n.add(field)
      return n
    })
    setArmed(false)
  }

  async function apply() {
    if (!armed) {
      setArmed(true)
      setTimeout(() => setArmed(false), 4000)
      return
    }
    setArmed(false)
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/portal/admin/opportunities/backfill/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId, householdId, dealId: deal.dealId, fields: Array.from(selected) }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setDone(`Wrote ${(data.written ?? []).map((f: string) => FIELD_LABEL[f] ?? f).join(', ')}.`)
        if (data.auditWarning) setMsg(data.auditWarning)
      } else {
        setMsg(data.message ?? 'Did not write.')
      }
    } catch {
      setMsg('Network error.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50/60 px-3 py-2">
        <p className="text-xs font-ui text-green-800">
          <span className="font-semibold">{deal.dealName}</span> — {done}
        </p>
        {msg && <p className="text-[11px] font-ui text-amber-700 mt-0.5">{msg}</p>}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-cool-200 bg-cool-50/60 px-3 py-2">
      <p className="text-xs font-ui text-cool-500 mb-1.5">
        {deal.dealName}
        {deal.stage ? <span className="text-cool-400"> · {deal.stage}</span> : null}
      </p>
      <div className="space-y-1">
        {deal.fills.map(f => (
          <label key={f.field} className="flex items-center gap-2 text-xs font-ui text-navy cursor-pointer">
            <input type="checkbox" checked={selected.has(f.field)} onChange={() => toggle(f.field)} disabled={!canManage || busy} className="accent-navy" />
            <span>
              Set <span className="font-semibold">{FIELD_LABEL[f.field] ?? f.field}</span> to{' '}
              <span className="font-semibold text-green-700">{fmtFill(f)}</span>{' '}
              <span className="text-cool-400">(currently empty)</span>
            </span>
          </label>
        ))}
      </div>
      {canManage ? (
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <button
            onClick={apply}
            disabled={busy || selected.size === 0}
            className={`text-[11px] font-semibold rounded-lg px-3 py-1 border disabled:opacity-50 ${armed ? 'bg-navy text-white border-navy' : 'text-navy border-navy/25 hover:border-navy'}`}
          >
            {busy ? 'Writing…' : armed ? `Confirm: write ${selected.size} field${selected.size === 1 ? '' : 's'}?` : `Backfill ${selected.size} field${selected.size === 1 ? '' : 's'}`}
          </button>
          {msg && <span className="text-[11px] font-ui text-red-600">{msg}</span>}
        </div>
      ) : (
        <p className="mt-1.5 text-[11px] font-ui text-cool-400">Review only — manage permission needed to write.</p>
      )}
    </div>
  )
}
