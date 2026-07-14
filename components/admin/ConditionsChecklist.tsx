'use client'

// The commitment-conditions checklist (Phase B2) — the deal room's centerpiece.
// Two surfaces on one component:
//   1. The approval BANNER: conditions extracted from a commitment upload sit
//      pending until Michael approves the list (or edits-then-approves one).
//      Admin-only; nothing here is the checklist until the list gate fires.
//   2. The approved CHECKLIST: a progress line, grouped General-first then
//      per-borrower, one derived pill per row (decision status + document
//      presence), one-tap Verify on rows the machine collected, and waive with
//      a reason. Admin-only controls; everyone sees the state.
//
// The lime/`decision` token is attention currency: it renders ONLY on the
// needs_input pill and the Verify affordance — the two places a human action
// is queued. On mount the room recomputes presence (fire-and-forget) so the
// stored presence the server rendered is fresh.

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { GATES_TOKEN_HEADER, useGatesToken } from '@/lib/gates-token'
import type { DealConditionRow, PendingCommitmentCondition } from '@/lib/underwriting'
import { canVerify, conditionStatusPill, isCollected, type PillTone } from '@/lib/conditions-status'
import CommitmentUploader from './CommitmentUploader'

const OWNER_OPTIONS = ['borrower', 'solicitor', 'broker', 'lender', 'system'] as const
const DOC_KIND_OPTIONS = [
  'letter_of_employment', 'pay_stub', 't4_noa', 'void_cheque', 'fire_insurance_binder',
  'gift_letter', 'aps', 'appraisal', 'id', 'signed_commitment', 'disclosure',
  'sale_confirmation', 'other',
] as const

const label = (s: string) => s.replace(/_/g, ' ')
const ARM_WINDOW_MS = 4000

function fmtShort(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`)
  if (isNaN(d.getTime())) return ymd
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric' })
}

const PILL_CLASS: Record<PillTone, string> = {
  green: 'bg-green-100 text-green-700',
  amber: 'bg-amber-100 text-amber-800',
  gray: 'bg-gray-100 text-gray-600',
  // Attention currency (the new lime): a human action is queued on this row.
  lime: 'bg-decision text-decision-ink',
}

function Pill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  return (
    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${PILL_CLASS[tone]}`}>
      {children}
    </span>
  )
}

export default function ConditionsChecklist({
  dealId,
  pending,
  approved,
  borrowers,
  canDecide,
  canWaive,
  canRecompute,
  canUpload,
  hasRealCommitment,
  todayYMD,
}: {
  dealId: string
  pending: PendingCommitmentCondition[]
  approved: DealConditionRow[]
  borrowers: { id: string; fullName: string }[]
  // canDecide gates the list gate + edit-then-approve + Verify
  // (approvals.conditions.decide). canWaive gates Waive, whose server proxy
  // requires conditions.decide — so its UI control uses the SAME key.
  canDecide: boolean
  canWaive: boolean
  canRecompute: boolean
  // canUpload gates the commitment/amendment dropzone (commitment.upload).
  // hasRealCommitment is computed on document provenance — a retired
  // synthetic/rejected commitment must NEVER count, so the dropzone is never
  // suppressed by a stand-in (guardrail 20).
  canUpload: boolean
  hasRealCommitment: boolean
  todayYMD: string
}) {
  const router = useRouter()
  const mintGatesToken = useGatesToken()
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [toast, setToast] = useState<{ tone: 'green' | 'amber'; text: string } | null>(null)
  const [armed, setArmed] = useState<{ key: string; at: number } | null>(null)
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recomputeRan = useRef(false)

  // Recompute presence on room open — fire-and-forget, then a soft refresh so
  // the server-rendered checklist reflects fresh presence. Ignore failure and
  // never block render. Runs at most once per mount.
  useEffect(() => {
    if (!canRecompute || recomputeRan.current) return
    recomputeRan.current = true
    let cancelled = false
    ;(async () => {
      try {
        const token = await mintGatesToken()
        const res = await fetch(`/api/portal/admin/gates/deals/${dealId}/recompute-presence`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { [GATES_TOKEN_HEADER]: token } : {}) },
          body: '{}',
        })
        const json = await res.json().catch(() => null)
        if (!cancelled && json?.ok) router.refresh()
      } catch {
        // presence stays as last stored; never a visible failure on open
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId, canRecompute])

  useEffect(
    () => () => {
      if (armTimer.current) clearTimeout(armTimer.current)
      if (toastTimer.current) clearTimeout(toastTimer.current)
    },
    [],
  )

  const arm = useCallback((key: string) => {
    setArmed({ key, at: Date.now() })
    if (armTimer.current) clearTimeout(armTimer.current)
    armTimer.current = setTimeout(() => setArmed(null), ARM_WINDOW_MS)
  }, [])

  const showToast = useCallback((tone: 'green' | 'amber', text: string) => {
    setToast({ tone, text })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 6000)
  }, [])

  const post = useCallback(
    async (busyKey: string, errKey: string, path: string, body: Record<string, unknown>, okMsg: string) => {
      setArmed(null)
      setBusy(b => ({ ...b, [busyKey]: true }))
      setErrors(e => ({ ...e, [errKey]: '' }))
      try {
        const token = await mintGatesToken()
        const res = await fetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { [GATES_TOKEN_HEADER]: token } : {}) },
          body: JSON.stringify(body),
        })
        const json = await res.json().catch(() => null)
        if (json?.ok) {
          showToast('green', okMsg)
          router.refresh()
          return true
        }
        if (json?.kind === 'conflict') {
          showToast('amber', 'Already decided. Refreshing the file.')
          router.refresh()
          return false
        }
        setErrors(e => ({ ...e, [errKey]: json?.message ?? `Unexpected response (HTTP ${res.status}).` }))
        return false
      } catch {
        setErrors(e => ({ ...e, [errKey]: 'Could not reach the server. Check your connection and retry.' }))
        return false
      } finally {
        setBusy(b => ({ ...b, [busyKey]: false }))
      }
    },
    [mintGatesToken, router, showToast],
  )

  return (
    <div>
      {toast && (
        <div
          className={`mb-3 rounded-lg px-3 py-2 text-sm font-body border ${
            toast.tone === 'green'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          {toast.text}
        </div>
      )}

      {pending.length > 0 && (
        <PendingBanner
          dealId={dealId}
          pending={pending}
          borrowers={borrowers}
          canDecide={canDecide}
          busy={busy}
          errors={errors}
          armed={armed}
          arm={arm}
          post={post}
        />
      )}

      <ApprovedChecklist
        approved={approved}
        borrowers={borrowers}
        canDecide={canDecide}
        canWaive={canWaive}
        todayYMD={todayYMD}
        busy={busy}
        errors={errors}
        armed={armed}
        arm={arm}
        setErrors={setErrors}
        post={post}
      />

      {/* Every empty state that instructs an action carries the control inline.
          No REAL commitment on file -> the bare commitment dropzone lives right
          under the "upload the commitment" empty state. A real commitment on
          file -> no second bare dropzone, but an amendment control. A retired
          synthetic/rejected doc never counts as a commitment (guardrail 20). */}
      {canUpload && (
        hasRealCommitment ? (
          <div className="mt-5 border-t border-gray-100 pt-4">
            <CommitmentUploader
              dealId={dealId}
              kind="amendment"
              title="Upload an amendment"
              hint="If the lender revised the commitment, drop the amendment here — it supersedes the current condition set on approval."
              compact
            />
          </div>
        ) : (
          <div className="mt-4">
            <CommitmentUploader
              dealId={dealId}
              kind="commitment"
              title="Upload the commitment"
              hint="Drop the lender's commitment PDF to draft the checklist."
            />
          </div>
        )
      )}
    </div>
  )
}

// ─── The approval banner (pending commitment conditions) ─────────────────────

type PostFn = (
  busyKey: string,
  errKey: string,
  path: string,
  body: Record<string, unknown>,
  okMsg: string,
) => Promise<boolean>

function PendingBanner({
  dealId,
  pending,
  borrowers,
  canDecide,
  busy,
  errors,
  armed,
  arm,
  post,
}: {
  dealId: string
  pending: PendingCommitmentCondition[]
  borrowers: { id: string; fullName: string }[]
  canDecide: boolean
  busy: Record<string, boolean>
  errors: Record<string, string>
  armed: { key: string; at: number } | null
  arm: (key: string) => void
  post: PostFn
}) {
  // Group by source document — the list gate is per document.
  const byDoc = new Map<string, PendingCommitmentCondition[]>()
  for (const p of pending) {
    const k = p.documentId ?? 'unknown'
    if (!byDoc.has(k)) byDoc.set(k, [])
    byDoc.get(k)!.push(p)
  }

  const fire = (key: string, run: () => void) =>
    armed?.key === key && armed && Date.now() - armed.at <= ARM_WINDOW_MS ? run() : arm(key)

  return (
    <div className="mb-4 space-y-3">
      {Array.from(byDoc.entries()).map(([docId, rows]) => {
        const listBusy = Boolean(busy[`list:${docId}`])
        return (
          <div key={docId} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-body font-semibold text-amber-900">
              {rows.length} {rows.length === 1 ? 'condition' : 'conditions'} extracted from the commitment — review
              before they become the checklist
            </p>
            {canDecide && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  disabled={listBusy}
                  onClick={() =>
                    fire(`approve:${docId}`, () =>
                      void post(
                        `list:${docId}`,
                        `list:${docId}`,
                        `/api/portal/admin/gates/commitment-conditions/${docId}/decision`,
                        { action: 'approve' },
                        'Commitment conditions approved — they are the checklist now.',
                      ),
                    )
                  }
                  className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold font-body transition-colors disabled:opacity-50 ${
                    armed?.key === `approve:${docId}` ? 'bg-navy text-white' : 'bg-navy text-white hover:opacity-90'
                  }`}
                >
                  {listBusy ? 'Working…' : armed?.key === `approve:${docId}` ? 'Tap again to approve the list' : 'Approve list'}
                </button>
                <button
                  disabled={listBusy}
                  onClick={() =>
                    fire(`reject:${docId}`, () =>
                      void post(
                        `list:${docId}`,
                        `list:${docId}`,
                        `/api/portal/admin/gates/commitment-conditions/${docId}/decision`,
                        { action: 'reject' },
                        'Commitment conditions rejected.',
                      ),
                    )
                  }
                  className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold font-body transition-colors disabled:opacity-50 ${
                    armed?.key === `reject:${docId}`
                      ? 'bg-navy text-white'
                      : 'bg-white border border-gray-300 text-navy hover:bg-gray-50'
                  }`}
                >
                  {listBusy ? 'Working…' : armed?.key === `reject:${docId}` ? 'Tap again to reject the list' : 'Reject list'}
                </button>
              </div>
            )}
            {errors[`list:${docId}`] && (
              <p className="mt-2 text-xs text-red-700 font-body">{errors[`list:${docId}`]}</p>
            )}
            <ul className="mt-2 divide-y divide-amber-200/70">
              {rows.map(p => (
                <PendingRow
                  key={p.id}
                  cond={p}
                  borrowers={borrowers}
                  canDecide={canDecide}
                  busy={busy}
                  errors={errors}
                  armed={armed}
                  arm={arm}
                  post={post}
                />
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

function PendingRow({
  cond,
  borrowers,
  canDecide,
  busy,
  errors,
  armed,
  arm,
  post,
}: {
  cond: PendingCommitmentCondition
  borrowers: { id: string; fullName: string }[]
  canDecide: boolean
  busy: Record<string, boolean>
  errors: Record<string, string>
  armed: { key: string; at: number } | null
  arm: (key: string) => void
  post: PostFn
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(cond.text)
  const [owner, setOwner] = useState(cond.owner)
  const [docKind, setDocKind] = useState(cond.docKind ?? '')
  const [borrowerId, setBorrowerId] = useState(cond.borrowerId ?? '')
  const rowBusy = Boolean(busy[`cond:${cond.id}`])
  const armKey = `approve-one:${cond.id}`

  const submit = () => {
    const body: Record<string, unknown> = {}
    if (text.trim() && text.trim() !== cond.text) body.edited_text = text.trim()
    if (owner && owner !== cond.owner) body.edited_owner = owner
    if (docKind && docKind !== (cond.docKind ?? '')) body.edited_doc_kind = docKind
    if (borrowerId && borrowerId !== (cond.borrowerId ?? '')) body.edited_borrower_id = borrowerId
    void post(
      `cond:${cond.id}`,
      `cond:${cond.id}`,
      `/api/portal/admin/gates/conditions/${cond.id}/approve`,
      body,
      `Condition ${cond.condNumber ? cond.condNumber + ' ' : ''}approved.`,
    )
  }

  return (
    <li className="py-2">
      <p className="text-sm font-body text-gray-700">
        {cond.condNumber ? `${cond.condNumber}. ` : ''}
        {cond.text}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-body text-gray-500">
        <span className="capitalize">{cond.owner}</span>
        {cond.docKind && <span className="rounded-full bg-white/70 px-2 py-0.5 text-gray-600">{label(cond.docKind)}</span>}
        {cond.sourcePage !== null && <span className="text-gray-400">p{cond.sourcePage}</span>}
        {canDecide && (
          <button
            onClick={() => setEditing(v => !v)}
            className="text-navy font-semibold underline decoration-gray-300 hover:decoration-navy"
          >
            {editing ? 'Cancel edit' : 'Edit & approve'}
          </button>
        )}
      </div>
      {cond.sourceSnippet && (
        <p className="mt-0.5 text-[11px] text-gray-400 font-body break-words">
          &ldquo;{cond.sourceSnippet}&rdquo;
        </p>
      )}
      {canDecide && editing && (
        <div className="mt-2 space-y-2 rounded-lg border border-gray-200 bg-white p-2.5">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={2}
            maxLength={2000}
            className="w-full text-sm font-body border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-navy/50 resize-y"
          />
          <div className="flex flex-wrap gap-2">
            <label className="text-[11px] font-body text-gray-500">
              Owner
              <select
                value={owner}
                onChange={e => setOwner(e.target.value)}
                className="ml-1 text-xs font-body border border-gray-200 rounded px-1.5 py-1"
              >
                {OWNER_OPTIONS.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </label>
            <label className="text-[11px] font-body text-gray-500">
              Document
              <select
                value={docKind}
                onChange={e => setDocKind(e.target.value)}
                className="ml-1 text-xs font-body border border-gray-200 rounded px-1.5 py-1"
              >
                <option value="">none</option>
                {DOC_KIND_OPTIONS.map(k => (
                  <option key={k} value={k}>{label(k)}</option>
                ))}
              </select>
            </label>
            <label className="text-[11px] font-body text-gray-500">
              Borrower
              <select
                value={borrowerId}
                onChange={e => setBorrowerId(e.target.value)}
                className="ml-1 text-xs font-body border border-gray-200 rounded px-1.5 py-1"
              >
                <option value="">General</option>
                {borrowers.map(b => (
                  <option key={b.id} value={b.id}>{b.fullName}</option>
                ))}
              </select>
            </label>
          </div>
          <button
            disabled={rowBusy}
            onClick={() =>
              armed?.key === armKey && armed && Date.now() - armed.at <= ARM_WINDOW_MS ? submit() : arm(armKey)
            }
            className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold font-body transition-colors disabled:opacity-50 ${
              armed?.key === armKey ? 'bg-navy text-white' : 'bg-navy text-white hover:opacity-90'
            }`}
          >
            {rowBusy ? 'Working…' : armed?.key === armKey ? 'Tap again to approve this one' : 'Approve this one'}
          </button>
        </div>
      )}
      {errors[`cond:${cond.id}`] && <p className="mt-1 text-xs text-red-700 font-body">{errors[`cond:${cond.id}`]}</p>}
    </li>
  )
}

// ─── The approved checklist ──────────────────────────────────────────────────

function ApprovedChecklist({
  approved,
  borrowers,
  canDecide,
  canWaive,
  todayYMD,
  busy,
  errors,
  armed,
  arm,
  setErrors,
  post,
}: {
  approved: DealConditionRow[]
  borrowers: { id: string; fullName: string }[]
  canDecide: boolean
  canWaive: boolean
  todayYMD: string
  busy: Record<string, boolean>
  errors: Record<string, string>
  armed: { key: string; at: number } | null
  arm: (key: string) => void
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>
  post: PostFn
}) {
  if (approved.length === 0) {
    return (
      <p className="text-sm text-gray-400 font-body">
        No approved conditions on this file yet. Upload the commitment to draft the checklist.
      </p>
    )
  }

  const collected = approved.filter(isCollected).length
  const nameById = new Map(borrowers.map(b => [b.id, b.fullName]))

  // General first (borrowerId null OR an id we cannot resolve), then each
  // borrower in the given order.
  const generalRows = approved.filter(c => !c.borrowerId || !nameById.has(c.borrowerId))
  const groups: { key: string; label: string; rows: DealConditionRow[] }[] = []
  if (generalRows.length > 0) groups.push({ key: 'general', label: 'General', rows: generalRows })
  for (const b of borrowers) {
    const rows = approved.filter(c => c.borrowerId === b.id)
    if (rows.length > 0) groups.push({ key: b.id, label: b.fullName, rows })
  }

  return (
    <div>
      <p className="text-xs font-body text-gray-500 mb-3 tabular-nums">
        <span className="font-semibold text-navy">{collected}</span> of{' '}
        <span className="font-semibold text-navy">{approved.length}</span> collected
      </p>
      <div className="space-y-4">
        {groups.map(g => (
          <div key={g.key}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">{g.label}</p>
            <div className="space-y-2">
              {g.rows.map(c => (
                <ChecklistRow
                  key={c.id}
                  cond={c}
                  canDecide={canDecide}
                  canWaive={canWaive}
                  todayYMD={todayYMD}
                  busy={busy}
                  errors={errors}
                  armed={armed}
                  arm={arm}
                  setErrors={setErrors}
                  post={post}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ChecklistRow({
  cond,
  canDecide,
  canWaive,
  todayYMD,
  busy,
  errors,
  armed,
  arm,
  setErrors,
  post,
}: {
  cond: DealConditionRow
  canDecide: boolean
  canWaive: boolean
  todayYMD: string
  busy: Record<string, boolean>
  errors: Record<string, string>
  armed: { key: string; at: number } | null
  arm: (key: string) => void
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>
  post: PostFn
}) {
  const [waiveOpen, setWaiveOpen] = useState(false)
  const [note, setNote] = useState('')
  const pill = conditionStatusPill(cond)
  const decided = cond.status === 'satisfied' || cond.status === 'waived'
  const overdue = cond.dueDate !== null && cond.dueDate < todayYMD && !decided
  const rowBusy = Boolean(busy[`cond:${cond.id}`])
  const matchedName =
    cond.presence === 'obtained' && cond.presenceDetail && typeof cond.presenceDetail.matched_finmo_name === 'string'
      ? (cond.presenceDetail.matched_finmo_name as string)
      : null
  const verifyKey = `verify:${cond.id}`
  const waiveKey = `waive:${cond.id}`

  const verify = () =>
    void post(
      `cond:${cond.id}`,
      `cond:${cond.id}`,
      `/api/portal/admin/gates/conditions/${cond.id}/verify`,
      {},
      `Condition ${cond.condNumber ? cond.condNumber + ' ' : ''}verified.`,
    )

  const waive = () => {
    if (note.trim().length < 5) {
      setErrors(e => ({
        ...e,
        [`cond:${cond.id}`]: 'Waive removes an obligation without evidence, so it needs a note of at least 5 characters.',
      }))
      return
    }
    void post(
      `cond:${cond.id}`,
      `cond:${cond.id}`,
      `/api/portal/admin/gates/conditions/${cond.id}/decision`,
      { action: 'waived', note: note.trim() },
      `Condition ${cond.condNumber ? cond.condNumber + ' ' : ''}waived.`,
    )
  }

  return (
    <div className={`border rounded-lg p-3 ${overdue ? 'border-red-200 bg-red-50' : 'border-gray-100'}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-sm font-body text-gray-700 min-w-0 flex-1">
          {cond.condNumber ? `${cond.condNumber}. ` : ''}
          {cond.text}
        </p>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-body text-gray-500">
        <Pill tone={pill.tone}>{pill.label}</Pill>
        {cond.docKind && (
          <span className="rounded-full bg-gray-50 px-2 py-0.5 text-gray-600">{label(cond.docKind)}</span>
        )}
        <span className="capitalize">{cond.owner}</span>
        <span className={overdue ? 'text-red-700 font-semibold' : ''}>
          {cond.dueDate ? `due ${fmtShort(cond.dueDate)}${overdue ? ' (overdue)' : ''}` : 'no due date'}
        </span>
        {matchedName && <span className="text-gray-400">matched: {matchedName}</span>}
      </div>
      {(canDecide || canWaive) && !decided && (
        <div className="mt-2 flex flex-wrap items-start gap-2">
          {canDecide && canVerify(cond) && (
            <button
              disabled={rowBusy}
              onClick={() =>
                armed?.key === verifyKey && armed && Date.now() - armed.at <= ARM_WINDOW_MS ? verify() : arm(verifyKey)
              }
              className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold font-body transition-colors disabled:opacity-50 ${
                armed?.key === verifyKey
                  ? 'bg-navy text-white'
                  : 'bg-decision text-decision-ink hover:bg-decision/80'
              }`}
            >
              {rowBusy ? 'Working…' : armed?.key === verifyKey ? 'Tap again to verify' : 'Verify'}
            </button>
          )}
          {canWaive && !waiveOpen ? (
            <button
              disabled={rowBusy}
              onClick={() => setWaiveOpen(true)}
              className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold font-body bg-white border border-gray-300 text-navy hover:bg-gray-50 disabled:opacity-50"
            >
              Waive…
            </button>
          ) : canWaive ? (
            <div className="flex-1 min-w-[220px]">
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={1}
                maxLength={2000}
                placeholder="Reason (required, 5+ characters)"
                className="w-full text-sm font-body border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-navy/50 resize-y"
              />
              <div className="mt-1.5 flex gap-2">
                <button
                  disabled={rowBusy}
                  onClick={() =>
                    armed?.key === waiveKey && armed && Date.now() - armed.at <= ARM_WINDOW_MS ? waive() : arm(waiveKey)
                  }
                  className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold font-body transition-colors disabled:opacity-50 ${
                    armed?.key === waiveKey ? 'bg-navy text-white' : 'bg-navy text-white hover:opacity-90'
                  }`}
                >
                  {rowBusy ? 'Working…' : armed?.key === waiveKey ? 'Tap again to waive' : 'Waive'}
                </button>
                <button
                  disabled={rowBusy}
                  onClick={() => {
                    setWaiveOpen(false)
                    setNote('')
                  }}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold font-body bg-white border border-gray-300 text-navy hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
      {errors[`cond:${cond.id}`] && <p className="mt-2 text-xs text-red-700 font-body">{errors[`cond:${cond.id}`]}</p>}
    </div>
  )
}
