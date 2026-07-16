'use client'

// The Renewal Drip approval desk (2026-07-16). Each pending touch shows the
// client, the touch, the FULL rendered draft, and per-sentence provenance for
// every personalized sentence (the sources_snapshot the workbench recorded) —
// Michael sees exactly where each personal sentence came from before anything
// can send. Approve sends (human-only, gated, mode-gated workbench-side);
// Edit saves a superseding draft (his correction, highest authority); Skip
// cancels the touch with a reason and the sequence continues. Held touches
// show their hold reason and cannot be approved until resolved.

import { useState } from 'react'
import { Check, Loader2, Pencil, SkipForward, PauseCircle } from 'lucide-react'
import { GATES_TOKEN_HEADER, useGatesToken } from '@/lib/gates-token'
import type { RenewalDripQueueItem } from '@/lib/underwriting'

const TOUCH_LABEL: Record<string, string> = {
  'touch-150': '150 days', 'touch-120': '120 days', 'touch-90': '90 days',
  'touch-60': '60 days', 'touch-30': '30 days', 'renewal-confirmed': 'renewal confirmed',
}

export default function RenewalDripQueue({ items, canDecide, demo }: {
  items: RenewalDripQueueItem[]
  canDecide: boolean
  demo: boolean
}) {
  const mint = useGatesToken()
  const [busy, setBusy] = useState<string | null>(null)
  const [gone, setGone] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [skipping, setSkipping] = useState<string | null>(null)
  const [skipReason, setSkipReason] = useState('')

  const post = async (touchId: string, path: string, body: Record<string, unknown>, doneLabel: string) => {
    if (demo) { setErrors((e) => ({ ...e, [touchId]: 'Demo mode: decisions are disabled.' })); return }
    setBusy(touchId)
    setErrors((e) => ({ ...e, [touchId]: '' }))
    try {
      const token = await mint()
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { [GATES_TOKEN_HEADER]: token } : {}) },
        body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => null)
      if (res.ok && j?.ok) {
        setGone((g) => ({ ...g, [touchId]: doneLabel }))
      } else {
        setErrors((e) => ({ ...e, [touchId]: j?.message ?? `Failed (HTTP ${res.status})` }))
      }
    } catch {
      setErrors((e) => ({ ...e, [touchId]: 'Network error; retry.' }))
    } finally {
      setBusy(null)
    }
  }

  if (!items.length) {
    return <p className="text-sm text-slate-500 font-body">No renewal messages waiting. Drafts land here as touches come due.</p>
  }

  return (
    <div className="space-y-4">
      {items.map((it) => {
        const done = gone[it.touchId]
        return (
          <div key={it.touchId} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-900">{it.clientName ?? it.firstName ?? 'Client'}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{TOUCH_LABEL[it.skeletonId] ?? it.skeletonId}</span>
              <span className="text-xs text-slate-500">matures {it.maturityDate}</span>
              {it.status === 'held' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                  <PauseCircle className="h-3 w-3" /> held: {it.heldReason ?? 'no reason recorded'}
                </span>
              )}
              {it.draftSource === 'human_edited' && (
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">edited by Michael</span>
              )}
              {done && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">{done}</span>}
            </div>

            <p className="mt-2 text-xs text-slate-500 font-body">Subject: <span className="font-semibold text-slate-700">{it.subject}</span></p>
            <pre className="mt-2 whitespace-pre-wrap rounded-md bg-slate-50 border border-slate-100 p-3 text-sm text-slate-800 font-body">{it.body}</pre>

            {/* Per-sentence provenance: where each personal sentence came from. */}
            {it.sentences.length > 0 && (
              <div className="mt-2 text-xs text-slate-600 font-body">
                <p className="font-semibold text-slate-700">Personalized content and its source:</p>
                {it.sentences.map((s, i) => (
                  <p key={i} className="mt-0.5">&ldquo;{s.text}&rdquo; <span className="text-slate-400">· from {s.source}</span></p>
                ))}
              </div>
            )}
            {it.sentences.length === 0 && (
              <p className="mt-2 text-xs text-slate-400 font-body">No personalization on this draft (the skeleton floor; nothing grounded or the tier has no slot).</p>
            )}
            {it.dropped.length > 0 && (
              <p className="mt-1 text-[11px] text-slate-400 font-body">{it.dropped.length} proposed sentence(s) refused by the fences (recorded in provenance).</p>
            )}

            {errors[it.touchId] && <p className="mt-2 text-xs font-semibold text-red-600">{errors[it.touchId]}</p>}

            {canDecide && !done && (
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={busy === it.touchId || it.status === 'held'}
                  title={it.status === 'held' ? `Held: ${it.heldReason ?? ''}` : 'Approve and send'}
                  onClick={() => post(it.touchId, `/api/portal/admin/gates/renewal/touches/${it.touchId}/approve`, {}, 'Approved · sent')}
                  className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {busy === it.touchId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Approve &amp; send
                </button>
                <button
                  type="button"
                  disabled={busy === it.touchId}
                  onClick={() => { setEditing(editing === it.touchId ? null : it.touchId); setEditBody(it.body) }}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
                <button
                  type="button"
                  disabled={busy === it.touchId}
                  onClick={() => { setSkipping(skipping === it.touchId ? null : it.touchId); setSkipReason('') }}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
                >
                  <SkipForward className="h-3 w-3" /> Skip
                </button>
              </div>
            )}

            {editing === it.touchId && (
              <div className="mt-2">
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value.slice(0, 8000))}
                  rows={10}
                  className="w-full rounded-md border border-slate-300 p-2 text-sm font-body"
                />
                <button
                  type="button"
                  disabled={busy === it.touchId || editBody.trim().length < 20}
                  onClick={() => post(it.touchId, `/api/portal/admin/gates/renewal/touches/${it.touchId}/edit`, { body: editBody }, 'Edit saved')}
                  className="mt-1 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  Save edit (becomes the draft)
                </button>
              </div>
            )}

            {skipping === it.touchId && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  value={skipReason}
                  onChange={(e) => setSkipReason(e.target.value.slice(0, 200))}
                  placeholder="Why skip this touch?"
                  className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs font-body"
                />
                <button
                  type="button"
                  disabled={busy === it.touchId || skipReason.trim().length < 3}
                  onClick={() => post(it.touchId, `/api/portal/admin/gates/renewal/touches/${it.touchId}/skip`, { reason: skipReason.trim() }, 'Skipped')}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
                >
                  Confirm skip
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
