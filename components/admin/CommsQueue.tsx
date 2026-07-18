'use client'

// The client-comms approval queue (B7-P Task 2), living in the Approvals area.
// It follows the renewal drip desk pattern exactly: each pending touch shows
// the client, the touch, and the FULL rendered message exactly as the client
// would receive it; Approve sends (human-only, triple-gated + dark by default
// on the workbench); Edit saves a superseding draft; Reject (skip) clears one
// touch with a reason. Held touches show their reason and cannot be approved.
//
// Grouped by deal and touch kind. The first live queue holds the catch-up crop
// (stage updates for transitions weeks ago beside current drafts), so a slipped
// send date is flagged amber for fast, unambiguous rejection of stale history.
//
// Navy controls, never the decision token — the same choice the renewal desk
// makes (an outbound client message is not the lime queued-decision signal).

import { useState } from 'react'
import { Check, Loader2, Pencil, SkipForward, PauseCircle, Clock } from 'lucide-react'
import { GATES_TOKEN_HEADER, useGatesToken } from '@/lib/gates-token'
import type { CommsQueueItem } from '@/lib/underwriting'
import { COMMS_KIND_LABEL, commsTouchLabel, groupCommsByDeal, isCatchUpTouch, daysSinceYMD } from '@/lib/comms'

export default function CommsQueue({
  items,
  canDecide,
  onChanged,
  todayYMD,
}: {
  items: CommsQueueItem[]
  canDecide: boolean
  onChanged: () => void
  todayYMD: string
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
        setEditing(null)
        setSkipping(null)
        // Reconcile against workbench truth: the approved/skipped touch drops
        // out and an edited touch shows its new body.
        onChanged()
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
    return (
      <p className="text-sm text-cool-500 font-ui">
        No client messages waiting. Stage updates, chases, and review requests land here as they come due.
      </p>
    )
  }

  const groups = groupCommsByDeal(
    items.map((it) => ({
      zohoDealId: it.zohoDealId,
      clientName: it.clientName,
      firstName: it.firstName,
      fileRef: null,
      touchKind: it.touchKind,
      skeletonId: it.skeletonId,
      scheduledFor: it.scheduledFor,
      raw: it,
    })),
  )

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.zohoDealId}>
          <p className="mb-2 font-heading text-sm font-semibold text-navy">{group.clientName}</p>
          <div className="space-y-3">
            {group.touches.map(({ raw: it }) => {
              const done = gone[it.touchId]
              const catchUp = isCatchUpTouch(it.scheduledFor, todayYMD)
              const daysOld = daysSinceYMD(it.scheduledFor, todayYMD)
              return (
                <div key={it.touchId} className="rounded-lg border border-cool-200 bg-white p-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="rounded-full bg-cool-100 px-2 py-0.5 text-xs font-semibold text-cool-600">
                      {COMMS_KIND_LABEL[it.touchKind]}
                    </span>
                    <span className="text-xs text-cool-500">{commsTouchLabel(it.skeletonId)}</span>
                    {it.scheduledFor && <span className="text-xs text-cool-400">for {it.scheduledFor}</span>}
                    {catchUp && daysOld !== null && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        <Clock className="h-3 w-3" /> queued {daysOld} days ago
                      </span>
                    )}
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

                  <p className="mt-2 text-xs text-cool-500 font-ui">
                    Subject: <span className="font-semibold text-cool-700">{it.subject}</span>
                  </p>
                  <pre className="mt-2 whitespace-pre-wrap rounded-md bg-cool-50 border border-cool-100 p-3 text-sm text-cool-800 font-ui">{it.body}</pre>

                  {it.mergeFields.length > 0 && (
                    <p className="mt-2 text-[11px] text-cool-400 font-ui">
                      Personalized from: {it.mergeFields.join(', ')}
                    </p>
                  )}

                  {errors[it.touchId] && <p className="mt-2 text-xs font-semibold text-red-600">{errors[it.touchId]}</p>}

                  {canDecide && !done && (
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        disabled={busy === it.touchId || it.status === 'held'}
                        title={it.status === 'held' ? `Held: ${it.heldReason ?? ''}` : 'Approve and send'}
                        onClick={() => post(it.touchId, `/api/portal/admin/gates/comms/touches/${it.touchId}/approve`, {}, 'Approved · sent')}
                        className="inline-flex items-center gap-1 rounded-md bg-cool-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                      >
                        {busy === it.touchId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Approve &amp; send
                      </button>
                      <button
                        type="button"
                        disabled={busy === it.touchId}
                        aria-expanded={editing === it.touchId}
                        onClick={() => { setEditing(editing === it.touchId ? null : it.touchId); setEditBody(it.body); setSkipping(null) }}
                        className="inline-flex items-center gap-1 rounded-md border border-cool-300 px-3 py-1.5 text-xs font-semibold text-cool-700"
                      >
                        <Pencil className="h-3 w-3" /> Edit
                      </button>
                      <button
                        type="button"
                        disabled={busy === it.touchId}
                        aria-expanded={skipping === it.touchId}
                        onClick={() => { setSkipping(skipping === it.touchId ? null : it.touchId); setSkipReason(catchUp ? 'no longer current' : ''); setEditing(null) }}
                        className="inline-flex items-center gap-1 rounded-md border border-cool-300 px-3 py-1.5 text-xs font-semibold text-cool-700"
                      >
                        <SkipForward className="h-3 w-3" /> Reject
                      </button>
                    </div>
                  )}

                  {editing === it.touchId && (
                    <div className="mt-2">
                      <textarea
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value.slice(0, 8000))}
                        rows={10}
                        className="w-full rounded-md border border-cool-300 p-2 text-sm font-ui"
                      />
                      <button
                        type="button"
                        disabled={busy === it.touchId || editBody.trim().length < 20}
                        onClick={() => post(it.touchId, `/api/portal/admin/gates/comms/touches/${it.touchId}/edit`, { body: editBody }, 'Edit saved')}
                        className="mt-1 rounded-md bg-cool-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                      >
                        Save edit (becomes the draft)
                      </button>
                    </div>
                  )}

                  {skipping === it.touchId && (
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <input
                        value={skipReason}
                        onChange={(e) => setSkipReason(e.target.value.slice(0, 300))}
                        placeholder="Why reject this message?"
                        className="min-w-0 flex-1 rounded-md border border-cool-300 px-2 py-1.5 text-xs font-ui"
                      />
                      <button
                        type="button"
                        disabled={busy === it.touchId || skipReason.trim().length < 3}
                        onClick={() => post(it.touchId, `/api/portal/admin/gates/comms/touches/${it.touchId}/skip`, { reason: skipReason.trim() }, 'Rejected')}
                        className="rounded-md border border-cool-300 px-3 py-1.5 text-xs font-semibold text-cool-700 disabled:opacity-40"
                      >
                        Confirm reject
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
