'use client'

// The unassigned-call resolver (CC-03, 2026-07-29).
//
// Describe who a call was with in plain language -> see what that produced ->
// correct it -> confirm. The parse step writes nothing, so it can be re-run
// freely; only Confirm writes, and it sends the fields AS EDITED HERE, never
// the raw parse. Both judgment calls the engine makes — client vs partner, and
// existing vs new — are shown with their evidence and are overridable, because
// getting either wrong creates or misfiles a CRM record someone must undo by
// hand.

import { useCallback, useState } from 'react'
import { GATES_TOKEN_HEADER, useGatesToken } from '@/lib/gates-token'
import type { CallIdentityCandidate, CallIdentityProposal } from '@/lib/gates'

export interface ResolverCall {
  id: string
  dialpadCallId: string
  startedAt: string | null
  direction: string | null
  durationSec: number | null
  numberMasked: string | null
  summary: string | null
  transcript: string | null
}

type Kind = 'contact' | 'partner'

interface Draft {
  name: string
  email: string
  phone: string
  kind: Kind
  partnerType: string
  /** null = create a new record; otherwise the chosen existing candidate. */
  chosen: CallIdentityCandidate | null
  reasoning: string | null
  note: string | null
  candidates: CallIdentityCandidate[]
}

function fmtWhen(iso: string | null): string {
  if (!iso) return 'unknown date'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? 'unknown date' : d.toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function CallResolver({ calls }: { calls: ResolverCall[] }) {
  const [open, setOpen] = useState<string | null>(null)
  const [resolved, setResolved] = useState<Record<string, string>>({})

  const remaining = calls.filter(c => !resolved[c.id])

  return (
    <div className="mt-5 space-y-3">
      <p className="text-sm text-cool-600 tabular-nums">
        {remaining.length} unresolved
        {Object.keys(resolved).length > 0 ? ` · ${Object.keys(resolved).length} resolved just now` : ''}
      </p>

      {calls.map(call => (
        <div key={call.id} className="rounded-[9px] border border-cool-200 bg-white">
          <button
            type="button"
            onClick={() => setOpen(open === call.id ? null : call.id)}
            className="flex w-full items-center justify-between gap-4 p-4 text-left"
          >
            <span className="min-w-0">
              <span className="font-heading text-navy tabular-nums">{call.numberMasked ?? 'no number'}</span>
              <span className="ml-3 text-sm text-cool-600 tabular-nums">{fmtWhen(call.startedAt)}</span>
              {call.direction ? <span className="ml-3 text-xs text-cool-500">{call.direction}</span> : null}
            </span>
            {resolved[call.id] ? (
              <span className="shrink-0 rounded-full bg-green-50 px-3 py-1 text-xs text-green-700">
                Resolved · {resolved[call.id]}
              </span>
            ) : (
              <span className="shrink-0 text-xs text-cool-500">{open === call.id ? 'Close' : 'Identify'}</span>
            )}
          </button>

          {open === call.id && !resolved[call.id] ? (
            <CallPanel
              call={call}
              onResolved={label => {
                setResolved(r => ({ ...r, [call.id]: label }))
                setOpen(null)
              }}
            />
          ) : null}
        </div>
      ))}

      {calls.length === 0 ? (
        <p className="rounded-[9px] border border-cool-200 bg-white p-5 text-sm text-cool-600">
          Nothing unresolved. Every call the pipeline could not name has been identified.
        </p>
      ) : null}
    </div>
  )
}

function CallPanel({ call, onResolved }: { call: ResolverCall; onResolved: (label: string) => void }) {
  const getToken = useGatesToken()
  const [text, setText] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState<'parse' | 'confirm' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runParse = useCallback(async () => {
    setBusy('parse')
    setError(null)
    try {
      const token = await getToken()
      const res = await fetch(`/api/portal/admin/gates/calls/${call.id}/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [GATES_TOKEN_HEADER]: token ?? '' },
        body: JSON.stringify({ text }),
      })
      const body = await res.json()
      if (!res.ok || !body?.ok) {
        setError(body?.message ?? 'The description could not be parsed.')
        return
      }
      const p = body.data as CallIdentityProposal
      setDraft({
        name: p.parsed.name ?? '',
        email: p.parsed.email ?? '',
        phone: p.parsed.phone ?? '',
        // 'unsure' is not a choice the engine will accept — it must be
        // decided here, and the default leans to contact only as a starting
        // point, with the reasoning shown next to it.
        kind: p.parsed.kind === 'partner' ? 'partner' : 'contact',
        partnerType: p.parsed.partnerType ?? '',
        chosen: null,
        reasoning: p.parsed.kind === 'unsure'
          ? `Could not tell from the description${p.parsed.reasoning ? `: ${p.parsed.reasoning}` : ''}`
          : p.parsed.reasoning,
        note: p.note,
        candidates: p.candidates,
      })
    } catch {
      setError('Could not reach the parser. Retry.')
    } finally {
      setBusy(null)
    }
  }, [call.id, getToken, text])

  const confirm = useCallback(async () => {
    if (!draft) return
    setBusy('confirm')
    setError(null)
    try {
      const identity = draft.chosen
        ? { mode: 'existing' as const, kind: draft.chosen.kind, zohoId: draft.chosen.zohoId, label: draft.chosen.label }
        : {
            mode: 'create' as const,
            kind: draft.kind,
            name: draft.name.trim(),
            email: draft.email.trim() || null,
            phone: draft.phone.trim() || null,
            partnerType: draft.kind === 'partner' && draft.partnerType ? draft.partnerType : null,
          }
      const token = await getToken()
      const res = await fetch(`/api/portal/admin/gates/calls/${call.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [GATES_TOKEN_HEADER]: token ?? '' },
        body: JSON.stringify({ identity }),
      })
      const body = await res.json()
      if (!res.ok || !body?.ok) {
        setError(body?.message ?? 'The confirmation did not go through.')
        return
      }
      if (body.data?.outcome === 'skipped_no_number') {
        setError('Dialpad could not give a full number for this call, so nothing was written.')
        return
      }
      // CC-04: identifying a number also clears its history, so say so.
      const also = body.data?.siblings?.resolved ?? 0
      const label = draft.chosen ? draft.chosen.label : draft.name.trim()
      onResolved(also > 0 ? `${label} · also resolved ${also} earlier call${also === 1 ? '' : 's'}` : label)
    } catch {
      setError('Could not reach the resolver. Retry.')
    } finally {
      setBusy(null)
    }
  }, [call.id, draft, getToken, onResolved])

  const canConfirm = !!draft && (draft.chosen !== null || draft.name.trim().length > 0)

  return (
    <div className="border-t border-cool-100 p-4">
      {call.summary ? (
        <p className="mb-3 text-sm text-cool-700">
          <span className="font-heading text-xs uppercase tracking-[0.05em] text-cool-500">Summary</span>
          <br />
          {call.summary}
        </p>
      ) : null}
      {call.transcript ? (
        <details className="mb-4">
          <summary className="cursor-pointer text-xs text-cool-500">Transcript</summary>
          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded border border-cool-100 bg-cool-50 p-3 text-xs text-cool-700">
            {call.transcript}
          </pre>
        </details>
      ) : null}

      <label className="block text-xs font-semibold uppercase tracking-[0.05em] text-cool-600">
        Who was this?
      </label>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={3}
        maxLength={4000}
        placeholder="e.g. Sam Reeve, the BDM at RFA — sam@rfa.ca"
        className="mt-1 w-full rounded border border-cool-200 p-2 text-sm"
      />
      <button
        type="button"
        onClick={runParse}
        disabled={busy !== null || !text.trim()}
        className="mt-2 rounded bg-navy px-3 py-1.5 text-sm text-white disabled:opacity-40"
      >
        {busy === 'parse' ? 'Reading…' : draft ? 'Read again' : 'Read this'}
      </button>

      {draft ? (
        <div className="mt-4 rounded border border-cool-200 p-3">
          <p className="font-heading text-xs uppercase tracking-[0.05em] text-cool-500">
            Proposed — check it before confirming
          </p>
          {draft.note ? <p className="mt-1 text-xs text-amber-700">{draft.note}</p> : null}

          {draft.candidates.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs text-cool-600">
                Already in Zoho — use one of these instead of creating a duplicate?
              </p>
              <div className="mt-1 space-y-1">
                {draft.candidates.map(c => (
                  <label key={`${c.kind}:${c.zohoId}`} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`cand-${call.id}`}
                      checked={draft.chosen?.zohoId === c.zohoId && draft.chosen?.kind === c.kind}
                      onChange={() => setDraft({ ...draft, chosen: c })}
                    />
                    <span>
                      {c.label}{' '}
                      <span className="text-xs text-cool-500">
                        ({c.kind}
                        {c.partnerType ? `, ${c.partnerType}` : ''} · matched on {c.matchedOn})
                      </span>
                    </span>
                  </label>
                ))}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={`cand-${call.id}`}
                    checked={draft.chosen === null}
                    onChange={() => setDraft({ ...draft, chosen: null })}
                  />
                  <span>None of these — create a new record</span>
                </label>
              </div>
            </div>
          ) : null}

          {draft.chosen === null ? (
            <div className="mt-3 space-y-2">
              <Field label="Name" value={draft.name} onChange={v => setDraft({ ...draft, name: v })} />
              <Field label="Email" value={draft.email} onChange={v => setDraft({ ...draft, email: v })} />
              <Field label="Phone" value={draft.phone} onChange={v => setDraft({ ...draft, phone: v })} />
              <div>
                <span className="text-xs text-cool-600">Client or partner?</span>
                <div className="mt-1 flex gap-3 text-sm">
                  {(['contact', 'partner'] as Kind[]).map(k => (
                    <label key={k} className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name={`kind-${call.id}`}
                        checked={draft.kind === k}
                        onChange={() => setDraft({ ...draft, kind: k })}
                      />
                      <span>{k === 'contact' ? 'Client (Contacts)' : 'Partner (Partners)'}</span>
                    </label>
                  ))}
                </div>
                {draft.reasoning ? (
                  <p className="mt-1 text-xs text-cool-500">Why: {draft.reasoning}</p>
                ) : null}
              </div>
              {draft.kind === 'partner' ? (
                <Field
                  label="Partner type (optional)"
                  value={draft.partnerType}
                  onChange={v => setDraft({ ...draft, partnerType: v })}
                />
              ) : null}
            </div>
          ) : null}

          <button
            type="button"
            onClick={confirm}
            disabled={busy !== null || !canConfirm}
            className="mt-3 rounded bg-navy px-3 py-1.5 text-sm text-white disabled:opacity-40"
          >
            {busy === 'confirm' ? 'Saving…' : 'Confirm and resolve'}
          </button>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs text-cool-600">{label}</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        className="mt-0.5 w-full rounded border border-cool-200 p-1.5 text-sm"
      />
    </label>
  )
}
