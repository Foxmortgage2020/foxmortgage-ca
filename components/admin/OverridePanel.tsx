'use client'

// Michael's manual comparable override for one monitored mortgage. Two paths:
// pick from the server-derived eligible candidate list (approved + eligible +
// same tier — nothing outside it can be set, the route re-derives and matches
// the key), or enter a desk rate with a mandatory source note. Every override
// takes a mandatory reason and a two-tap confirm; the write is POST-only.
// Retiring the active override is the same two-tap POST.

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function OverridePanel({
  householdId,
  uploadId,
  overrideId,
  options,
}: {
  householdId: string
  uploadId: string
  overrideId: string | null
  options: { key: string; label: string }[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'book_quote' | 'desk_rate'>('book_quote')
  const [candidateKey, setCandidateKey] = useState('')
  const [lender, setLender] = useState('')
  const [rate, setRate] = useState('')
  const [rateType, setRateType] = useState('fixed')
  const [termMonths, setTermMonths] = useState('60')
  const [sourceNote, setSourceNote] = useState('')
  const [reason, setReason] = useState('')
  const [armed, setArmed] = useState<'set' | 'retire' | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function post(body: Record<string, unknown>, okMsg: string) {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/portal/admin/opportunities/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setMsg(okMsg)
        setOpen(false)
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

  function submit() {
    if (armed !== 'set') {
      setArmed('set')
      setTimeout(() => setArmed(a => (a === 'set' ? null : a)), 5000)
      return
    }
    setArmed(null)
    if (mode === 'book_quote') {
      void post(
        { householdId, uploadId, type: 'book_quote', candidateKey, reason: reason.trim() },
        'Override set.',
      )
    } else {
      void post(
        {
          householdId,
          uploadId,
          type: 'desk_rate',
          desk: { lender: lender.trim(), rate: Number(rate), rateType, termMonths: Number(termMonths), sourceNote: sourceNote.trim() },
          reason: reason.trim(),
        },
        'Desk rate set.',
      )
    }
  }

  function retire() {
    if (armed !== 'retire') {
      setArmed('retire')
      setTimeout(() => setArmed(a => (a === 'retire' ? null : a)), 5000)
      return
    }
    setArmed(null)
    void post({ action: 'retire', overrideId }, 'Override retired.')
  }

  return (
    <div className="mt-2 border-t border-cool-100 pt-2">
      <div className="flex items-center gap-2 flex-wrap">
        {overrideId ? (
          <button
            onClick={retire}
            disabled={busy}
            className={`text-[11px] font-semibold rounded-lg px-2.5 py-1 border disabled:opacity-50 ${armed === 'retire' ? 'bg-navy text-white border-navy' : 'text-navy border-navy/25 hover:border-navy'}`}
          >
            {armed === 'retire' ? 'Confirm: retire the override?' : 'Retire override'}
          </button>
        ) : (
          <button
            onClick={() => setOpen(o => !o)}
            disabled={busy}
            className="text-[11px] font-semibold rounded-lg px-2.5 py-1 border text-navy border-navy/25 hover:border-navy disabled:opacity-50"
          >
            {open ? 'Close override' : 'Override comparable'}
          </button>
        )}
        {msg && <span className="text-[11px] font-ui text-cool-500">{msg}</span>}
      </div>

      {open && !overrideId && (
        <div className="mt-2 rounded-lg border border-cool-200 bg-cool-50/60 px-3 py-2 space-y-2 text-xs font-ui">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" checked={mode === 'book_quote'} onChange={() => setMode('book_quote')} className="accent-navy" />
              <span>Pick an approved quote</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" checked={mode === 'desk_rate'} onChange={() => setMode('desk_rate')} className="accent-navy" />
              <span>Desk rate Michael was quoted</span>
            </label>
          </div>

          {mode === 'book_quote' &&
            (options.length === 0 ? (
              <p className="text-cool-500">No eligible same-tier candidates exist for this client; a desk rate is the only path.</p>
            ) : (
              <select value={candidateKey} onChange={e => setCandidateKey(e.target.value)} className="w-full border border-cool-300 rounded-lg px-2 py-1 bg-white">
                <option value="">choose an eligible quote…</option>
                {options.map(o => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
            ))}

          {mode === 'desk_rate' && (
            <div className="grid grid-cols-2 gap-2">
              <input value={lender} onChange={e => setLender(e.target.value)} placeholder="lender name" className="border border-cool-300 rounded-lg px-2 py-1" />
              <input value={rate} onChange={e => setRate(e.target.value)} placeholder="rate % (e.g. 4.44)" className="border border-cool-300 rounded-lg px-2 py-1" />
              <select value={rateType} onChange={e => setRateType(e.target.value)} className="border border-cool-300 rounded-lg px-2 py-1 bg-white">
                <option value="fixed">fixed</option>
                <option value="adjustable">adjustable</option>
                <option value="variable">variable</option>
              </select>
              <input value={termMonths} onChange={e => setTermMonths(e.target.value)} placeholder="term (months)" className="border border-cool-300 rounded-lg px-2 py-1" />
              <input value={sourceNote} onChange={e => setSourceNote(e.target.value)} placeholder="source: who quoted it and when (required)" className="col-span-2 border border-cool-300 rounded-lg px-2 py-1" />
            </div>
          )}

          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="reason for the override (required; this is the suitability record)" className="w-full border border-cool-300 rounded-lg px-2 py-1" />

          <button
            onClick={submit}
            disabled={busy || reason.trim().length < 5 || (mode === 'book_quote' ? !candidateKey : sourceNote.trim().length < 5)}
            className={`text-[11px] font-semibold rounded-lg px-3 py-1 border disabled:opacity-50 ${armed === 'set' ? 'bg-navy text-white border-navy' : 'text-navy border-navy/25 hover:border-navy'}`}
          >
            {armed === 'set' ? 'Confirm: set this override?' : 'Set override'}
          </button>
        </div>
      )}
    </div>
  )
}
