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
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { GATES_TOKEN_HEADER, useGatesToken } from '@/lib/gates-token'
import type { DealConditionRow, PendingCommitmentCondition } from '@/lib/underwriting'
import { canVerify, conditionStatusPill, isBrokerCondition, isCollected, type PillTone } from '@/lib/conditions-status'
import CommitmentUploader from './CommitmentUploader'

// The valid condition owner classes (fox-underwriting conditions_owner_check /
// the manual-control gate schema). Broker leads Michael's view; the rest are
// grouped behind a disclosure.
const OWNER_OPTIONS = ['broker', 'solicitor', 'borrower', 'underwriting', 'product_mechanics'] as const
// The non-broker owners, in the order their collapsed groups appear, with the
// plural noun for the disclosure label.
const NON_BROKER_GROUPS: { owner: string; noun: string }[] = [
  { owner: 'solicitor', noun: 'solicitor conditions' },
  { owner: 'borrower', noun: 'borrower conditions' },
  { owner: 'underwriting', noun: 'underwriting constraints' },
  { owner: 'product_mechanics', noun: 'product-mechanics conditions' },
]
const DOC_KIND_OPTIONS = [
  'letter_of_employment', 'pay_stub', 't4_noa', 'void_cheque', 'fire_insurance_binder',
  'gift_letter', 'aps', 'appraisal', 'id', 'signed_commitment', 'disclosure',
  'sale_confirmation', 'mortgage_statement', 'property_tax', 'payout_statement', 'ccb',
  'product_assessment_form', 'term_portion_amendment', 'other',
] as const

const label = (s: string) => s.replace(/_/g, ' ')
const ARM_WINDOW_MS = 4000

// The document kinds that carry a numeric requirement the analysis checks
// against (income / appraised value / CCB) — a target field only shows for
// these, and the workbench rejects a target on any other kind.
const REQUIREMENT_DOC_KINDS = new Set(['pay_stub', 't4_noa', 'appraisal', 'ccb'])

/** Parse a positive dollar amount from a text field; null when blank/invalid. */
function parseAmount(s: string): number | null {
  const t = s.replace(/[,$\s]/g, '')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n > 0 ? n : null
}

function fmtShort(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`)
  if (isNaN(d.getTime())) return ymd
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric' })
}

// Tones mirror the ds StatusChip (green/amber/gray byte-identical); the pill
// keeps its own map because of the fourth tone below.
const PILL_CLASS: Record<PillTone, string> = {
  green: 'bg-green-100 text-green-700',
  amber: 'bg-amber-100 text-amber-800',
  gray: 'bg-cool-100 text-cool-700',
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
  userId,
  emptyState,
}: {
  dealId: string
  pending: PendingCommitmentCondition[]
  approved: DealConditionRow[]
  borrowers: { id: string; fullName: string }[]
  /** Replaces the default zero-conditions sentence when supplied (handoff 54).
   *  The default cannot tell a file with no commitment from one whose
   *  extraction FAILED, and on the second kind "upload the commitment" sends
   *  the reader toward a second document and a second extraction — the churn
   *  that left one file carrying 157 rows. The Deals (Beta) Conditions tab
   *  passes the two distinguished variants; the deal room passes nothing and
   *  keeps its own copy, because that copy is the room's to change. */
  emptyState?: ReactNode
  // The logged-in user's id — the key the "hide non-broker" view preference
  // persists under (per user, on their device; never a real write).
  userId: string
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

  // Open the document a condition's analysis cited, at its page. Mints a
  // 60-second signed URL per click (never stored); demo-blocked at the lib. The
  // tab is opened synchronously (before the await) so the click is not swallowed
  // by a popup blocker.
  const openDocument = useCallback(
    async (documentId: string, page: number | null) => {
      const tab = window.open('', '_blank', 'noopener')
      try {
        const token = await mintGatesToken()
        const res = await fetch(`/api/portal/admin/gates/documents/${encodeURIComponent(documentId)}/url`, {
          headers: token ? { [GATES_TOKEN_HEADER]: token } : undefined,
        })
        const json = await res.json().catch(() => null)
        if (json?.ok && typeof json.data?.url === 'string') {
          const href = page != null ? `${json.data.url}#page=${page}` : json.data.url
          if (tab) tab.location.href = href
          else window.open(href, '_blank', 'noopener')
        } else if (tab) {
          tab.close()
        }
      } catch {
        if (tab) tab.close() // demo-blocked or unreachable — never a visible error
      }
    },
    [mintGatesToken],
  )

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
          className={`mb-3 rounded-lg px-3 py-2 text-sm font-ui border ${
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
        dealId={dealId}
        userId={userId}
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
        openDocument={openDocument}
        emptyState={emptyState}
      />

      {/* Every empty state that instructs an action carries the control inline.
          No REAL commitment on file -> the bare commitment dropzone lives right
          under the "upload the commitment" empty state. A real commitment on
          file -> no second bare dropzone, but an amendment control. A retired
          synthetic/rejected doc never counts as a commitment (guardrail 20). */}
      {canUpload && (
        hasRealCommitment ? (
          <div className="mt-5 border-t border-cool-100 pt-4">
            <CommitmentUploader
              dealId={dealId}
              kind="amendment"
              title="Upload an amendment"
              hint="If the lender revised the commitment, drop the amendment here. It supersedes the current condition set on approval."
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
            <p className="text-sm font-ui font-semibold text-amber-900">
              {rows.length} {rows.length === 1 ? 'condition' : 'conditions'} extracted from the commitment. Review
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
                        'Commitment conditions approved. They are the checklist now.',
                      ),
                    )
                  }
                  className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold font-ui transition-colors disabled:opacity-50 ${
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
                  className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold font-ui transition-colors disabled:opacity-50 ${
                    armed?.key === `reject:${docId}`
                      ? 'bg-navy text-white'
                      : 'bg-white border border-cool-300 text-navy hover:bg-cool-50'
                  }`}
                >
                  {listBusy ? 'Working…' : armed?.key === `reject:${docId}` ? 'Tap again to reject the list' : 'Reject list'}
                </button>
              </div>
            )}
            {errors[`list:${docId}`] && (
              <p className="mt-2 text-xs text-red-700 font-ui">{errors[`list:${docId}`]}</p>
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
  const [reqAmount, setReqAmount] = useState('')
  const rowBusy = Boolean(busy[`cond:${cond.id}`])
  const armKey = `approve-one:${cond.id}`

  const submit = () => {
    const body: Record<string, unknown> = {}
    if (text.trim() && text.trim() !== cond.text) body.edited_text = text.trim()
    if (owner && owner !== cond.owner) body.edited_owner = owner
    if (docKind && docKind !== (cond.docKind ?? '')) body.edited_doc_kind = docKind
    if (borrowerId && borrowerId !== (cond.borrowerId ?? '')) body.edited_borrower_id = borrowerId
    const amt = parseAmount(reqAmount)
    if (amt != null && REQUIREMENT_DOC_KINDS.has(docKind)) body.edited_requirement_amount = amt
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
      <p className="text-sm font-ui text-cool-700">
        {cond.condNumber ? `${cond.condNumber}. ` : ''}
        {cond.text}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-ui text-cool-500">
        <span className="capitalize">{cond.owner}</span>
        {cond.docKind && <span className="rounded-full bg-white/70 px-2 py-0.5 text-cool-600">{label(cond.docKind)}</span>}
        {cond.loadBearing && <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">load-bearing</span>}
        {cond.sourcePage !== null && <span className="text-cool-500">p{cond.sourcePage}</span>}
        {canDecide && (
          <button
            onClick={() => setEditing(v => !v)}
            className="text-navy font-semibold underline decoration-cool-300 hover:decoration-navy"
          >
            {editing ? 'Cancel edit' : 'Edit & approve'}
          </button>
        )}
      </div>
      {cond.sourceSnippet && (
        <p className="mt-0.5 text-[11px] text-cool-500 font-ui break-words">
          &ldquo;{cond.sourceSnippet}&rdquo;
        </p>
      )}
      {canDecide && editing && (
        <div className="mt-2 space-y-2 rounded-lg border border-cool-200 bg-white p-2.5">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={2}
            maxLength={1000}
            className="w-full text-sm font-ui border border-cool-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-navy/50 resize-y"
          />
          <div className="flex flex-wrap gap-2">
            <label className="text-[11px] font-ui text-cool-500">
              Owner
              <select
                value={owner}
                onChange={e => setOwner(e.target.value)}
                className="ml-1 text-xs font-ui border border-cool-200 rounded px-1.5 py-1"
              >
                {OWNER_OPTIONS.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </label>
            <label className="text-[11px] font-ui text-cool-500">
              Document
              <select
                value={docKind}
                onChange={e => setDocKind(e.target.value)}
                className="ml-1 text-xs font-ui border border-cool-200 rounded px-1.5 py-1"
              >
                <option value="">none</option>
                {DOC_KIND_OPTIONS.map(k => (
                  <option key={k} value={k}>{label(k)}</option>
                ))}
              </select>
            </label>
            <label className="text-[11px] font-ui text-cool-500">
              Borrower
              <select
                value={borrowerId}
                onChange={e => setBorrowerId(e.target.value)}
                className="ml-1 text-xs font-ui border border-cool-200 rounded px-1.5 py-1"
              >
                <option value="">General</option>
                {borrowers.map(b => (
                  <option key={b.id} value={b.id}>{b.fullName}</option>
                ))}
              </select>
            </label>
            {REQUIREMENT_DOC_KINDS.has(docKind) && (
              <label className="text-[11px] font-ui text-cool-500">
                Requirement target ($)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={reqAmount}
                  onChange={e => setReqAmount(e.target.value)}
                  placeholder="e.g. 150000"
                  className="ml-1 w-24 text-xs font-ui border border-cool-200 rounded px-1.5 py-1 tabular-nums"
                />
              </label>
            )}
          </div>
          <button
            disabled={rowBusy}
            onClick={() =>
              armed?.key === armKey && armed && Date.now() - armed.at <= ARM_WINDOW_MS ? submit() : arm(armKey)
            }
            className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold font-ui transition-colors disabled:opacity-50 ${
              armed?.key === armKey ? 'bg-navy text-white' : 'bg-navy text-white hover:opacity-90'
            }`}
          >
            {rowBusy ? 'Working…' : armed?.key === armKey ? 'Tap again to approve this one' : 'Approve this one'}
          </button>
        </div>
      )}
      {errors[`cond:${cond.id}`] && <p className="mt-1 text-xs text-red-700 font-ui">{errors[`cond:${cond.id}`]}</p>}
    </li>
  )
}

// ─── The approved checklist (broker-first) ───────────────────────────────────

// Per-user "hide non-broker conditions" preference. Persisted in localStorage
// under the user's id — genuinely per user, on their device, and NEVER a real
// write (demo-safe by construction). Default is collapsed-not-hidden.
function useHideNonBroker(userId: string): [boolean, (v: boolean) => void] {
  const key = `fox_hide_nonbroker:${userId}`
  const [hide, setHide] = useState(false)
  useEffect(() => {
    try {
      setHide(window.localStorage.getItem(key) === '1')
    } catch {
      /* storage unavailable -> default not hidden */
    }
  }, [key])
  const set = useCallback(
    (v: boolean) => {
      setHide(v)
      try {
        window.localStorage.setItem(key, v ? '1' : '0')
      } catch {
        /* ignore */
      }
    },
    [key],
  )
  return [hide, set]
}

type RowProps = {
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
  openDocument: (documentId: string, page: number | null) => void
}

function groupByBorrower(
  rows: DealConditionRow[],
  borrowers: { id: string; fullName: string }[],
  nameById: Map<string, string>,
): { key: string; label: string; rows: DealConditionRow[] }[] {
  const generalRows = rows.filter(c => !c.borrowerId || !nameById.has(c.borrowerId))
  const groups: { key: string; label: string; rows: DealConditionRow[] }[] = []
  if (generalRows.length > 0) groups.push({ key: 'general', label: 'General', rows: generalRows })
  for (const b of borrowers) {
    const brows = rows.filter(c => c.borrowerId === b.id)
    if (brows.length > 0) groups.push({ key: b.id, label: b.fullName, rows: brows })
  }
  return groups
}

function ApprovedChecklist({
  dealId,
  userId,
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
  openDocument,
  emptyState,
}: {
  dealId: string
  userId: string
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
  openDocument: (documentId: string, page: number | null) => void
  emptyState?: ReactNode
}) {
  const [hideNonBroker, setHideNonBroker] = useHideNonBroker(userId)
  const [addOpen, setAddOpen] = useState(false)
  const nameById = new Map(borrowers.map(b => [b.id, b.fullName]))

  // Broker leads: it is the work Michael performs, so it heads the view and the
  // progress count is computed over it. Everything else is present but grouped.
  const brokerRows = approved.filter(c => isBrokerCondition(c.owner))
  const nonBrokerRows = approved.filter(c => !isBrokerCondition(c.owner))
  const brokerCollected = brokerRows.filter(isCollected).length
  const brokerGroups = groupByBorrower(brokerRows, borrowers, nameById)

  const knownNonBroker = new Set(NON_BROKER_GROUPS.map(g => g.owner))
  const nonBrokerGroups = NON_BROKER_GROUPS
    .map(g => ({ owner: g.owner, noun: g.noun, rows: nonBrokerRows.filter(c => (c.owner ?? '') === g.owner) }))
    .filter(g => g.rows.length > 0)
  const otherRows = nonBrokerRows.filter(c => !knownNonBroker.has(c.owner ?? ''))
  if (otherRows.length > 0) nonBrokerGroups.push({ owner: 'other', noun: 'other conditions', rows: otherRows })

  const rowProps: RowProps = { borrowers, canDecide, canWaive, todayYMD, busy, errors, armed, arm, setErrors, post, openDocument }

  return (
    <div>
      {/* Manual control is always available — regardless of extraction state. */}
      {canDecide && (
        <AddConditionBar
          dealId={dealId}
          borrowers={borrowers}
          open={addOpen}
          setOpen={setAddOpen}
          busy={busy}
          errors={errors}
          post={post}
        />
      )}

      {approved.length === 0 ? (
        emptyState ?? (
          <p className="text-sm text-cool-500 font-ui">
            No conditions on this file yet. Upload the commitment to draft the checklist, or add one by hand above.
          </p>
        )
      ) : (
        <>
          <p className="text-xs font-ui text-cool-500 mb-3 tabular-nums">
            <span className="font-semibold text-navy">{brokerCollected}</span> of{' '}
            <span className="font-semibold text-navy">{brokerRows.length}</span> broker{' '}
            {brokerRows.length === 1 ? 'condition' : 'conditions'} collected
          </p>

          {brokerRows.length === 0 ? (
            <p className="text-sm text-cool-500 font-ui">No broker conditions on this file.</p>
          ) : (
            <div className="space-y-4">
              {brokerGroups.map(g => (
                <div key={g.key}>
                  <p className="font-heading text-[11px] font-semibold uppercase tracking-[0.05em] text-cool-600 mb-1.5">{g.label}</p>
                  <div className="space-y-2">
                    {g.rows.map(c => <ChecklistRow key={c.id} cond={c} {...rowProps} />)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Non-broker conditions: present but collapsed, so Michael knows they
              exist when tracking whether the file closes. Nothing is deleted. */}
          {nonBrokerRows.length > 0 && (
            <div className="mt-5 border-t border-cool-100 pt-4">
              <div className="flex items-center justify-between mb-2 gap-2">
                <p className="text-[11px] font-ui text-cool-500">
                  {nonBrokerRows.length} non-broker {nonBrokerRows.length === 1 ? 'condition' : 'conditions'} on this file
                </p>
                <label className="flex items-center gap-1.5 text-[11px] font-ui text-cool-500 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hideNonBroker}
                    onChange={e => setHideNonBroker(e.target.checked)}
                    className="accent-navy"
                  />
                  Hide non-broker
                </label>
              </div>
              {!hideNonBroker && (
                <div className="space-y-2">
                  {nonBrokerGroups.map(g => (
                    <Disclosure key={g.owner} label={`${g.rows.length} ${g.noun}`}>
                      <div className="space-y-2 mt-2">
                        {g.rows.map(c => <ChecklistRow key={c.id} cond={c} {...rowProps} />)}
                      </div>
                    </Disclosure>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Disclosure({ label: labelText, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-cool-100">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-cool-50 rounded-lg"
      >
        <span className="text-xs font-ui font-semibold text-cool-600">{labelText}</span>
        <span className="text-cool-500 text-[11px] font-ui">{open ? 'hide' : 'show'}</span>
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}

// ─── Add a condition by hand ─────────────────────────────────────────────────

function AddConditionBar({
  dealId,
  borrowers,
  open,
  setOpen,
  busy,
  errors,
  post,
}: {
  dealId: string
  borrowers: { id: string; fullName: string }[]
  open: boolean
  setOpen: (v: boolean) => void
  busy: Record<string, boolean>
  errors: Record<string, string>
  post: PostFn
}) {
  const [text, setText] = useState('')
  const [owner, setOwner] = useState<(typeof OWNER_OPTIONS)[number]>('broker')
  const [docKind, setDocKind] = useState('')
  const [borrowerId, setBorrowerId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [loadBearing, setLoadBearing] = useState(false)
  const [reqAmount, setReqAmount] = useState('')
  const addBusy = Boolean(busy['add-condition'])
  // A requirement target only applies to a value-bearing document kind.
  const reqApplies = REQUIREMENT_DOC_KINDS.has(docKind)

  const submit = async () => {
    const body: Record<string, unknown> = { text: text.trim(), owner }
    if (docKind) body.doc_kind = docKind
    if (borrowerId) body.borrower_id = borrowerId
    if (dueDate) body.due_date = dueDate
    if (loadBearing) body.load_bearing = true
    const amt = parseAmount(reqAmount)
    if (reqApplies && amt != null) body.requirement_amount = amt
    const ok = await post('add-condition', 'add-condition', `/api/portal/admin/gates/deals/${dealId}/conditions`, body, 'Condition added to the checklist.')
    if (ok) {
      setText('')
      setDocKind('')
      setBorrowerId('')
      setDueDate('')
      setLoadBearing(false)
      setReqAmount('')
      setOpen(false)
    }
  }

  if (!open) {
    return (
      <div className="mb-4">
        <button
          onClick={() => setOpen(true)}
          className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold font-ui bg-white border border-cool-300 text-navy hover:bg-cool-50"
        >
          + Add condition
        </button>
      </div>
    )
  }

  return (
    <div className="mb-4 rounded-lg border border-cool-200 bg-white p-3 space-y-2">
      <p className="font-heading text-xs font-semibold text-navy">Add a condition by hand</p>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={2}
        maxLength={1000}
        placeholder="Condition text"
        className="w-full text-sm font-ui border border-cool-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-navy/50 resize-y"
      />
      <div className="flex flex-wrap gap-2 items-end">
        <SelectField label="Owner" value={owner} onChange={v => setOwner(v as (typeof OWNER_OPTIONS)[number])}>
          {OWNER_OPTIONS.map(o => <option key={o} value={o}>{label(o)}</option>)}
        </SelectField>
        <SelectField label="Document" value={docKind} onChange={setDocKind}>
          <option value="">none</option>
          {DOC_KIND_OPTIONS.map(k => <option key={k} value={k}>{label(k)}</option>)}
        </SelectField>
        <SelectField label="Borrower" value={borrowerId} onChange={setBorrowerId}>
          <option value="">General</option>
          {borrowers.map(b => <option key={b.id} value={b.id}>{b.fullName}</option>)}
        </SelectField>
        <label className="text-[11px] font-ui text-cool-500">
          Due date
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            className="ml-1 block text-xs font-ui border border-cool-200 rounded px-1.5 py-1"
          />
        </label>
        <label className="text-[11px] font-ui text-cool-500 flex items-center gap-1.5 pb-1">
          <input type="checkbox" checked={loadBearing} onChange={e => setLoadBearing(e.target.checked)} className="accent-navy" />
          load-bearing
        </label>
        {reqApplies && (
          <label className="text-[11px] font-ui text-cool-500">
            Requirement target ($)
            <input
              type="number"
              min="0"
              step="1"
              value={reqAmount}
              onChange={e => setReqAmount(e.target.value)}
              placeholder="e.g. 150000"
              className="ml-1 block w-28 text-xs font-ui border border-cool-200 rounded px-1.5 py-1 tabular-nums"
            />
          </label>
        )}
      </div>
      <div className="flex gap-2">
        <button
          disabled={addBusy || text.trim().length < 4}
          onClick={() => void submit()}
          className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold font-ui bg-navy text-white hover:opacity-90 disabled:opacity-50"
        >
          {addBusy ? 'Working…' : 'Add condition'}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold font-ui bg-white border border-cool-300 text-navy hover:bg-cool-50"
        >
          Cancel
        </button>
      </div>
      {errors['add-condition'] && <p className="text-xs text-red-700 font-ui">{errors['add-condition']}</p>}
    </div>
  )
}

function SelectField({
  label: labelText,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <label className="text-[11px] font-ui text-cool-500">
      {labelText}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="ml-1 block text-xs font-ui border border-cool-200 rounded px-1.5 py-1"
      >
        {children}
      </select>
    </label>
  )
}

// ─── The document-vs-requirement analysis (a cited draft) ───────────────────

// Everything the workbench pre-computed for the card — no arithmetic here, only
// display. The delta and the recency check are computed deterministically on
// the workbench (guardrail 1); this reads the stored numbers.
interface AnalysisData {
  verdict?: string
  reasoning?: string
  extracted?: number | null
  requirement?: number | null
  requirement_kind?: string | null
  requirement_source?: string | null
  delta?: number | null
  rule_note?: string | null
  recency?: { days?: number | null; doc_age_days?: number | null; ok?: boolean | null } | null
  value_citation?: { page?: number | null; snippet?: string | null } | null
  requirement_citation?: { page?: number | null; snippet?: string | null } | null
  document_id?: string | null
  as_of?: string | null
  confidence?: number | null
}

// An absent figure says so in words rather than as a dash: the copy gate
// forbids em dashes in anything rendered, and "not recorded" is what the rest
// of this build says when it has no value.
const fmtMoney = (n: number | null | undefined): string =>
  typeof n === 'number' && Number.isFinite(n) ? `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : 'not recorded'

const KIND_LABEL: Record<string, string> = {
  income_min: 'annual income',
  value_min: 'appraised value',
  ccb_min: 'child benefit',
}

// verdict -> the card's tone + a short human label. meets is green, a genuine
// gap (short/stale/rule breach) is red, and anything awaiting judgment
// (needs_review / kind mismatch) is amber. Never lime — the analysis is
// informational; lime is reserved for a queued human action (verify).
const VERDICT_TONE: Record<string, { box: string; label: string }> = {
  meets: { box: 'bg-green-50 border-green-200 text-green-800', label: 'Meets the requirement' },
  short: { box: 'bg-red-50 border-red-200 text-red-800', label: 'Short of the requirement' },
  stale: { box: 'bg-red-50 border-red-200 text-red-800', label: 'Document is stale' },
  rule_unmet: { box: 'bg-red-50 border-red-200 text-red-800', label: 'A document rule is unmet' },
  needs_review: { box: 'bg-amber-50 border-amber-200 text-amber-800', label: 'Needs review' },
  kind_mismatch: { box: 'bg-amber-50 border-amber-200 text-amber-800', label: 'Document does not match' },
}

function AnalysisBlock({
  analysis,
  openDocument,
}: {
  analysis: AnalysisData
  openDocument: (documentId: string, page: number | null) => void
}) {
  const tone = VERDICT_TONE[analysis.verdict ?? ''] ?? VERDICT_TONE.needs_review
  const kindLabel = KIND_LABEL[analysis.requirement_kind ?? ''] ?? 'figure'
  const hasFigures = typeof analysis.extracted === 'number' && typeof analysis.requirement === 'number'
  const isGap = analysis.verdict === 'short' || analysis.verdict === 'stale' || analysis.verdict === 'rule_unmet'
  const rec = analysis.recency
  const page = analysis.value_citation?.page ?? null

  return (
    <div className={`mt-1.5 text-xs font-ui rounded-md px-2.5 py-1.5 border ${tone.box}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold">Analysis (draft)</span>
        <span className="opacity-90">· {tone.label}</span>
        {isGap && (
          <span className="rounded-full bg-red-100 text-red-700 px-1.5 py-0.5 text-[10px] font-semibold">requirement gap</span>
        )}
      </div>

      {/* The figures line: read value vs requirement, with the pre-computed
          delta. Shown only when both numbers exist; otherwise the reasoning
          (below) explains why there is no comparison. */}
      {hasFigures && (
        <p className="mt-1">
          {kindLabel[0]!.toUpperCase() + kindLabel.slice(1)} read <span className="font-semibold tabular-nums">{fmtMoney(analysis.extracted)}</span>
          {' · requirement '}<span className="font-semibold tabular-nums">{fmtMoney(analysis.requirement)}</span>
          {analysis.verdict === 'meets' && ' · meets'}
          {analysis.verdict === 'short' && typeof analysis.delta === 'number' && (
            <> · <span className="font-semibold">short by {fmtMoney(Math.abs(analysis.delta))}</span></>
          )}
        </p>
      )}

      {/* The 60-day (or stated) recency check — shown whether it passes or not,
          so the check is visible, not just its failure. */}
      {rec && typeof rec.days === 'number' && (
        <p className="mt-0.5 opacity-90 tabular-nums">
          {analysis.as_of ? `Dated ${analysis.as_of}` : 'Date not read'}
          {typeof rec.doc_age_days === 'number' ? ` · ${rec.doc_age_days} days old` : ''}
          {' · '}
          {rec.ok === true
            ? `within ${rec.days} days ✓`
            : rec.ok === false
              ? `over the ${rec.days}-day limit ✗`
              : `${rec.days}-day recency not confirmed`}
        </p>
      )}

      {/* The rule note (2-year average, appraisal addressee, stale) in words. */}
      {analysis.rule_note && <p className="mt-0.5">{analysis.rule_note}</p>}

      {/* Requirement provenance: where the TARGET side came from — the matched
          text for a parsed target (workbench cleanup, 2026-07-16), or the
          human-set marker. Cited on both sides, not only the value. */}
      {analysis.requirement_source === 'manual' ? (
        <p className="mt-0.5 opacity-90">Requirement target set by hand</p>
      ) : analysis.requirement_citation?.snippet ? (
        <p className="mt-0.5 opacity-90">
          Requirement from{analysis.requirement_citation.page != null ? ` p${analysis.requirement_citation.page}` : ''}:{' '}
          <span className="italic">&ldquo;{analysis.requirement_citation.snippet}&rdquo;</span>
        </p>
      ) : null}

      {/* The reasoning fallback when there are no figures to line up. */}
      {!hasFigures && analysis.reasoning && <p className="mt-1">{analysis.reasoning}</p>}

      {/* Citation to the source it read, opening at the page. */}
      <div className="mt-1 flex items-center gap-2 text-[11px] opacity-90">
        {page != null && <span>p{page}</span>}
        {typeof analysis.confidence === 'number' && analysis.confidence < 70 && <span>· read at {analysis.confidence}% confidence</span>}
        {analysis.document_id && (
          <button
            type="button"
            onClick={() => openDocument(analysis.document_id!, page)}
            className="underline decoration-current/40 hover:decoration-current font-semibold"
          >
            open source
          </button>
        )}
        <span className="uppercase tracking-wide text-[10px] opacity-70">verify to confirm</span>
      </div>
    </div>
  )
}

// ─── One checklist row (verify / waive + manual edit / re-assign / remove) ───

function ChecklistRow({
  cond,
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
  openDocument,
}: { cond: DealConditionRow } & RowProps) {
  const [waiveOpen, setWaiveOpen] = useState(false)
  const [note, setNote] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [removeReason, setRemoveReason] = useState('')
  // Edit form state.
  const [eText, setEText] = useState(cond.text)
  const [eOwner, setEOwner] = useState(cond.owner)
  const [eDoc, setEDoc] = useState(cond.docKind ?? '')
  const [eBorrower, setEBorrower] = useState(cond.borrowerId ?? '')
  const [eDue, setEDue] = useState(cond.dueDate ?? '')
  const [eLoad, setELoad] = useState(cond.loadBearing)
  const [eReq, setEReq] = useState(typeof cond.requirement?.target === 'number' ? String(cond.requirement.target) : '')

  const pill = conditionStatusPill(cond)
  const decided = cond.status === 'satisfied' || cond.status === 'waived'
  const overdue = cond.dueDate !== null && cond.dueDate < todayYMD && !decided
  const rowBusy = Boolean(busy[`cond:${cond.id}`])
  const matchedName =
    cond.presence === 'obtained' && cond.presenceDetail && typeof cond.presenceDetail.matched_finmo_name === 'string'
      ? (cond.presenceDetail.matched_finmo_name as string)
      : null
  // The document-vs-requirement analysis (Task 3): a DRAFT for Michael. The
  // delta, the recency check, and the reasoning are pre-computed on the
  // workbench (no arithmetic in the render layer); this only displays them.
  const analysis =
    cond.presenceDetail && typeof cond.presenceDetail.analysis === 'object' && cond.presenceDetail.analysis
      ? (cond.presenceDetail.analysis as AnalysisData)
      : null
  const verifyKey = `verify:${cond.id}`
  const waiveKey = `waive:${cond.id}`
  const removeKey = `remove:${cond.id}`
  const busyKey = `cond:${cond.id}`
  const isManual = cond.source === 'manual'
  const isEdited = Array.isArray(cond.humanEditedFields) && cond.humanEditedFields.length > 0

  const verify = () =>
    void post(busyKey, busyKey, `/api/portal/admin/gates/conditions/${cond.id}/verify`, {}, `Condition ${cond.condNumber ? cond.condNumber + ' ' : ''}verified.`)

  const waive = () => {
    if (note.trim().length < 5) {
      setErrors(e => ({ ...e, [busyKey]: 'Waive removes an obligation without evidence, so it needs a note of at least 5 characters.' }))
      return
    }
    void post(busyKey, busyKey, `/api/portal/admin/gates/conditions/${cond.id}/decision`, { action: 'waived', note: note.trim() }, `Condition ${cond.condNumber ? cond.condNumber + ' ' : ''}waived.`)
  }

  const reassign = (owner: string) => {
    if (!owner || owner === cond.owner) return
    void post(busyKey, busyKey, `/api/portal/admin/gates/conditions/${cond.id}/reassign`, { owner }, `Owner changed to ${owner}.`)
  }

  const submitEdit = async () => {
    const body: Record<string, unknown> = {}
    if (eText.trim() && eText.trim() !== cond.text) body.text = eText.trim()
    if (eOwner !== cond.owner) body.owner = eOwner
    if ((eDoc || null) !== (cond.docKind ?? null)) body.doc_kind = eDoc || null
    if ((eBorrower || '') !== (cond.borrowerId ?? '')) body.borrower_id = eBorrower || null
    if ((eDue || '') !== (cond.dueDate ?? '')) body.due_date = eDue || null
    if (eLoad !== cond.loadBearing) body.load_bearing = eLoad
    // The requirement target (a value-bearing condition). A change from the
    // stored target is Michael's authoritative value.
    const reqAmt = parseAmount(eReq)
    const currentTarget = typeof cond.requirement?.target === 'number' ? cond.requirement.target : null
    if (reqAmt != null && reqAmt !== currentTarget) body.requirement_amount = reqAmt
    if (typeof body.text === 'string' && (body.text as string).length < 4) {
      setErrors(e => ({ ...e, [busyKey]: 'Condition text needs at least 4 characters.' }))
      return
    }
    if (Object.keys(body).length === 0) {
      setErrors(e => ({ ...e, [busyKey]: 'No changes to apply.' }))
      return
    }
    const ok = await post(busyKey, busyKey, `/api/portal/admin/gates/conditions/${cond.id}/edit`, body, `Condition ${cond.condNumber ? cond.condNumber + ' ' : ''}updated.`)
    if (ok) setEditOpen(false)
  }

  const remove = () => {
    if (removeReason.trim().length < 5) {
      setErrors(e => ({ ...e, [busyKey]: 'Removing a condition needs a reason of at least 5 characters (it is superseded, never deleted).' }))
      return
    }
    void post(busyKey, busyKey, `/api/portal/admin/gates/conditions/${cond.id}/remove`, { reason: removeReason.trim() }, `Condition ${cond.condNumber ? cond.condNumber + ' ' : ''}removed.`)
  }

  return (
    <div className={`border rounded-lg p-3 ${overdue ? 'border-red-200 bg-red-50' : 'border-cool-100'}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-sm font-ui text-cool-700 min-w-0 flex-1">
          {cond.condNumber ? `${cond.condNumber}. ` : ''}
          {cond.text}
        </p>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-ui text-cool-500">
        <Pill tone={pill.tone}>{pill.label}</Pill>
        {cond.docKind && <span className="rounded-full bg-cool-50 px-2 py-0.5 text-cool-600">{label(cond.docKind)}</span>}
        {typeof cond.requirement?.target === 'number' && (
          <span
            className="rounded-full bg-cool-50 px-2 py-0.5 text-cool-600 tabular-nums"
            title={cond.requirement.source === 'manual' ? 'requirement target set by hand' : 'requirement target parsed from the condition'}
          >
            target {fmtMoney(cond.requirement.target)}
          </span>
        )}
        {cond.loadBearing && <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">load-bearing</span>}
        {isManual && <span className="rounded-full bg-blue-50 px-2 py-0.5 font-semibold text-blue-700">added by hand</span>}
        {!isManual && isEdited && <span className="rounded-full bg-purple-50 px-2 py-0.5 font-semibold text-purple-700">edited</span>}
        <span className="capitalize">{cond.owner}</span>
        <span className={`tabular-nums ${overdue ? 'text-red-700 font-semibold' : ''}`}>
          {cond.dueDate ? `due ${fmtShort(cond.dueDate)}${overdue ? ' (overdue)' : ''}` : 'no due date'}
        </span>
        {matchedName && <span className="text-cool-500">matched: {matchedName}</span>}
      </div>

      {analysis && <AnalysisBlock analysis={analysis} openDocument={openDocument} />}

      {(canDecide || canWaive) && !decided && (
        <div className="mt-2 flex flex-wrap items-start gap-2">
          {canDecide && canVerify(cond) && (
            <button
              disabled={rowBusy}
              onClick={() => (armed?.key === verifyKey && armed && Date.now() - armed.at <= ARM_WINDOW_MS ? verify() : arm(verifyKey))}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold font-ui transition-colors disabled:opacity-50 ${
                armed?.key === verifyKey ? 'bg-navy text-white' : 'bg-decision text-decision-ink hover:bg-decision/80'
              }`}
            >
              {rowBusy ? 'Working…' : armed?.key === verifyKey ? 'Tap again to verify' : 'Verify'}
            </button>
          )}
          {canWaive && !waiveOpen ? (
            <button
              disabled={rowBusy}
              onClick={() => setWaiveOpen(true)}
              className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold font-ui bg-white border border-cool-300 text-navy hover:bg-cool-50 disabled:opacity-50"
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
                className="w-full text-sm font-ui border border-cool-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-navy/50 resize-y"
              />
              <div className="mt-1.5 flex gap-2">
                <button
                  disabled={rowBusy}
                  onClick={() => (armed?.key === waiveKey && armed && Date.now() - armed.at <= ARM_WINDOW_MS ? waive() : arm(waiveKey))}
                  className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold font-ui transition-colors disabled:opacity-50 ${
                    armed?.key === waiveKey ? 'bg-navy text-white' : 'bg-navy text-white hover:opacity-90'
                  }`}
                >
                  {rowBusy ? 'Working…' : armed?.key === waiveKey ? 'Tap again to waive' : 'Waive'}
                </button>
                <button
                  disabled={rowBusy}
                  onClick={() => { setWaiveOpen(false); setNote('') }}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold font-ui bg-white border border-cool-300 text-navy hover:bg-cool-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Manual control — available regardless of decision state, so Michael can
          fix the list by hand the instant the machine is wrong. */}
      {canDecide && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-ui text-cool-500">
          <button onClick={() => setEditOpen(v => !v)} className="text-navy font-semibold underline decoration-cool-300 hover:decoration-navy">
            {editOpen ? 'Cancel edit' : 'Edit'}
          </button>
          <label className="text-cool-500">
            Owner
            <select
              value=""
              disabled={rowBusy}
              onChange={e => { const o = e.target.value; if (o) reassign(o); e.currentTarget.selectedIndex = 0 }}
              className="ml-1 text-xs font-ui border border-cool-200 rounded px-1.5 py-1"
            >
              <option value="">move…</option>
              {OWNER_OPTIONS.filter(o => o !== cond.owner).map(o => <option key={o} value={o}>{label(o)}</option>)}
            </select>
          </label>
          <button onClick={() => setRemoveOpen(v => !v)} className="text-red-600 font-semibold underline decoration-red-200 hover:decoration-red-600">
            {removeOpen ? 'Cancel remove' : 'Remove'}
          </button>
        </div>
      )}

      {canDecide && editOpen && (
        <div className="mt-2 space-y-2 rounded-lg border border-cool-200 bg-white p-2.5">
          <textarea
            value={eText}
            onChange={e => setEText(e.target.value)}
            rows={2}
            maxLength={1000}
            className="w-full text-sm font-ui border border-cool-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-navy/50 resize-y"
          />
          <div className="flex flex-wrap gap-2 items-end">
            <SelectField label="Owner" value={eOwner} onChange={setEOwner}>
              {OWNER_OPTIONS.map(o => <option key={o} value={o}>{label(o)}</option>)}
            </SelectField>
            <SelectField label="Document" value={eDoc} onChange={setEDoc}>
              <option value="">none</option>
              {DOC_KIND_OPTIONS.map(k => <option key={k} value={k}>{label(k)}</option>)}
            </SelectField>
            <SelectField label="Borrower" value={eBorrower} onChange={setEBorrower}>
              <option value="">General</option>
              {borrowers.map(b => <option key={b.id} value={b.id}>{b.fullName}</option>)}
            </SelectField>
            <label className="text-[11px] font-ui text-cool-500">
              Due date
              <input type="date" value={eDue} onChange={e => setEDue(e.target.value)} className="ml-1 block text-xs font-ui border border-cool-200 rounded px-1.5 py-1" />
            </label>
            <label className="text-[11px] font-ui text-cool-500 flex items-center gap-1.5 pb-1">
              <input type="checkbox" checked={eLoad} onChange={e => setELoad(e.target.checked)} className="accent-navy" />
              load-bearing
            </label>
            {REQUIREMENT_DOC_KINDS.has(eDoc) && (
              <label className="text-[11px] font-ui text-cool-500">
                Requirement target ($)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={eReq}
                  onChange={e => setEReq(e.target.value)}
                  placeholder="e.g. 150000"
                  className="ml-1 block w-28 text-xs font-ui border border-cool-200 rounded px-1.5 py-1 tabular-nums"
                />
              </label>
            )}
          </div>
          <button
            disabled={rowBusy}
            onClick={() => void submitEdit()}
            className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold font-ui bg-navy text-white hover:opacity-90 disabled:opacity-50"
          >
            {rowBusy ? 'Working…' : 'Save changes'}
          </button>
        </div>
      )}

      {canDecide && removeOpen && (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2.5">
          <textarea
            value={removeReason}
            onChange={e => setRemoveReason(e.target.value)}
            rows={1}
            maxLength={2000}
            placeholder="Why remove it? (required, 5+ characters. It is superseded, never deleted)"
            className="w-full text-sm font-ui border border-red-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-red-400 resize-y"
          />
          <div className="mt-1.5 flex gap-2">
            <button
              disabled={rowBusy}
              onClick={() => (armed?.key === removeKey && armed && Date.now() - armed.at <= ARM_WINDOW_MS ? remove() : arm(removeKey))}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold font-ui transition-colors disabled:opacity-50 ${
                armed?.key === removeKey ? 'bg-red-700 text-white' : 'bg-red-600 text-white hover:opacity-90'
              }`}
            >
              {rowBusy ? 'Working…' : armed?.key === removeKey ? 'Tap again to remove' : 'Remove'}
            </button>
            <button
              onClick={() => { setRemoveOpen(false); setRemoveReason('') }}
              className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold font-ui bg-white border border-cool-300 text-navy hover:bg-cool-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {errors[busyKey] && <p className="mt-2 text-xs text-red-700 font-ui">{errors[busyKey]}</p>}
    </div>
  )
}
