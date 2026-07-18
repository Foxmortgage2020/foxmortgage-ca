'use client'

// The documents desk (B6.4): the last mile of the document pipeline on one card —
// request, arrival, AI verdict, Michael's look, his decision. Finmo owns
// collection; this surface reads the request list and the workbench's judgment and
// reports what is waiting, what has arrived and needs a look (flagged first,
// questions in their own quiet pill), and what is done. Each request expands to its
// detail, its cited verdict, and the two human actions (approve / send back). A
// decision renders ALONGSIDE the Finmo chip and the AI verdict, never replacing
// them. Never lime — an AI flag is amber; the decision controls mirror the renewal
// approval desk (navy), not the queued-decision token.

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, RefreshCw, Send, Undo2 } from 'lucide-react'
import StatusChip from '@/components/admin/ds/StatusChip'
import { GATES_TOKEN_HEADER, useGatesToken } from '@/lib/gates-token'
import { fmtShortDate, fmtDateTime } from '@/lib/dates'
import type { RequestsDesk, RequestCard, RequestState, WithdrawnCard, ResidualDoc } from '@/lib/documents-desk'
import type { DealStatementDoc } from '@/lib/underwriting'

type Filter = 'all' | 'waiting' | 'look' | 'questions' | 'done'

const humanize = (s: string) => s.replace(/_/g, ' ')

// A plain "N ago" relative label; falls back to the caller's absolute date.
function timeAgo(iso: string | null | undefined, nowMs: number): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  const s = Math.max(0, Math.floor((nowMs - t) / 1000))
  if (s < 90) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.floor(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

// The document's own internal date, honestly typed.
function contentDateLine(card: RequestCard): string | null {
  if (!card.contentDate) return null
  const cd = card.contentDates ?? {}
  if (typeof cd.pay_date === 'string') return `contains a pay date of ${fmtShortDate(cd.pay_date)}`
  if (typeof cd.issued === 'string') return `issued ${fmtShortDate(cd.issued)}`
  return `dated ${fmtShortDate(card.contentDate)}`
}

// The flagged reason (condition analysis or the review's first reason).
const flagReason = (card: RequestCard): string | null =>
  card.analysis?.reason ?? card.review?.reasons[0]?.message ?? null
// The soft annual-cycle line, verbatim from the review.
const staleCycleLine = (card: RequestCard): string | null => card.review?.reasons[0]?.message ?? null

// The primary lifecycle/verdict chip for a card's state.
function StateChip({ card }: { card: RequestCard }) {
  const s = card.state
  if (s === 'waiting') return <StatusChip tone="gray">Waiting on the client</StatusChip>
  if (s === 'received')
    return <span className="inline-block rounded-full border border-navy px-2 py-0.5 text-[11px] font-semibold text-navy">Ready for your look</span>
  if (s === 'ai_passed') return <StatusChip tone="green">✓ Looks right</StatusChip>
  if (s === 'ai_flagged') return <StatusChip tone="amber">Flagged</StatusChip>
  if (s === 'ai_questions') return <StatusChip tone="gray">Worth a glance</StatusChip>
  if (s === 'ai_stale_cycle')
    return <span className="inline-block rounded-full border border-navy px-2 py-0.5 text-[11px] font-semibold text-navy">On file</span>
  // reviewed: an approval always names its source (Finmo's status reflects an
  // accept inside Finmo; a bridging condition Michael verified reads "Confirmed").
  return <StatusChip tone="green">✓ {card.reviewedKind === 'confirmed' ? 'Confirmed' : 'Approved in Finmo'}</StatusChip>
}

const STATE_HINT: Record<RequestState, string> = {
  waiting: 'Waiting on the client',
  received: 'Ready for your look',
  ai_passed: 'Looks right, ready for your look',
  ai_flagged: 'Needs your look',
  ai_questions: 'Worth a glance',
  ai_stale_cycle: 'On file',
  reviewed: 'Done',
}

function receivedLine(card: RequestCard): string {
  if (!card.received) {
    return card.requestedAt ? `Requested ${fmtShortDate(card.requestedAt)}` : 'Requested'
  }
  const r = card.received
  const n = r.count > 1 ? `${r.count} files` : '1 file'
  const when = r.updatedAt ? ` · uploaded ${fmtShortDate(r.updatedAt)}` : ''
  return `${n}${when}`
}

function EvidenceBlock({ doc }: { doc: DealStatementDoc }) {
  return (
    <div className="mt-2 rounded-md border border-cool-100 bg-cool-50/60 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-heading text-[11px] font-semibold capitalize text-navy">{humanize(doc.docClass)}</span>
        {doc.review ? (
          <StatusChip tone={doc.review.decision === 'approved' ? 'green' : 'red'}>
            {doc.review.decision} by {doc.review.decidedBy} {fmtDateTime(doc.review.decidedAt)}
          </StatusChip>
        ) : doc.fields.some(f => f.status === 'extracted') ? (
          <StatusChip tone="amber">review pending</StatusChip>
        ) : null}
      </div>
      <div className="mt-1.5 divide-y divide-cool-100">
        {doc.fields.map(f => (
          <div key={f.id} className="py-1.5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[13px] font-ui tabular-nums">
              <span className="text-cool-700">{humanize(f.fieldName)}</span>
              <span className="font-semibold text-navy">
                {f.valueNumeric !== null ? f.valueNumeric : f.valueText}
                {f.unit ? ` ${f.unit}` : ''}
              </span>
              <StatusChip
                tone={f.status === 'approved' ? 'green' : f.status === 'rejected' ? 'red' : f.status === 'extracted' ? 'amber' : 'gray'}
              >
                {f.status}
              </StatusChip>
              {f.heldReason && <StatusChip tone="amber">{f.heldReason}</StatusChip>}
            </div>
            <p className="mt-0.5 break-words font-ui text-[11px] text-cool-600">
              p{f.sourcePage}: &ldquo;{f.sourceSnippet}&rdquo; (conf {f.confidence})
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

// The cited reasons for a request-review verdict (Task 1 expansion detail).
function ReviewReasons({ card }: { card: RequestCard }) {
  if (!card.review || card.review.reasons.length === 0) return null
  const tone =
    card.verdict === 'flagged'
      ? 'border-red-200 bg-red-50 text-red-800'
      : card.verdict === 'stale_cycle'
        ? 'border-cool-200 bg-cool-50 text-cool-700'
        : 'border-cool-200 bg-cool-50 text-cool-700'
  return (
    <div className={`mt-2 rounded-md border px-2.5 py-1.5 text-[12px] ${tone}`}>
      <span className="font-semibold">What the review found</span>
      <div className="mt-0.5 space-y-1">
        {card.review.reasons.map((r, i) => (
          <div key={i}>
            <span>{r.message}</span>
            {r.citation && (r.citation.page !== null || r.citation.snippet) && (
              <p className="mt-0.5 break-words text-[11px] opacity-80">
                {r.citation.page !== null ? `p${r.citation.page}: ` : ''}
                {r.citation.snippet ? `“${r.citation.snippet}”` : ''}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// Michael's recorded decision, shown alongside the other truths.
function DecisionBadge({ card }: { card: RequestCard }) {
  const d = card.decision
  if (!d) return null
  const when = d.decidedAt ? ` · ${fmtShortDate(d.decidedAt)}` : ''
  if (d.verdict === 'approved') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-navy px-2 py-0.5 text-[11px] font-semibold text-white">
        <Check className="h-3 w-3" /> Approved by you{when}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
      <Undo2 className="h-3 w-3" /> Sent back{when}
    </span>
  )
}

function RequestCardView({
  card,
  evidenceByDocId,
  dealId,
  canDecide,
  demo,
}: {
  card: RequestCard
  evidenceByDocId: Record<string, DealStatementDoc>
  dealId: string
  canDecide: boolean
  demo: boolean
}) {
  const router = useRouter()
  const mint = useGatesToken()
  const [busy, setBusy] = useState<'approve' | 'send_back' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [sendingBack, setSendingBack] = useState(false)
  const [reason, setReason] = useState('')

  const evidence = card.documentId ? evidenceByDocId[card.documentId] : undefined
  const flagged = card.state === 'ai_flagged'
  const cdLine = contentDateLine(card)

  const decide = async (action: 'approve' | 'send_back') => {
    if (demo) {
      setError('Demo mode: decisions are disabled.')
      return
    }
    setBusy(action)
    setError(null)
    try {
      const token = await mint()
      const res = await fetch(`/api/portal/admin/gates/document-requests/${encodeURIComponent(card.key.replace(/^req:/, ''))}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { [GATES_TOKEN_HEADER]: token } : {}) },
        body: JSON.stringify(action === 'send_back' ? { action, note: reason.trim() } : { action }),
      })
      const j = await res.json().catch(() => null)
      if (res.ok && j?.ok !== false) {
        setDone(action === 'approve' ? 'Approved · recorded' : 'Sent back · recorded')
        setSendingBack(false)
        router.refresh()
      } else {
        setError(j?.message ?? `Failed (HTTP ${res.status})`)
      }
    } catch {
      setError('Network error; retry.')
    } finally {
      setBusy(null)
    }
  }

  // The approve / send-back actions only make sense on a real Finmo REQUEST (the
  // decision gate keys on the finmo_request_id) once a document has arrived. A
  // commitment-derived card carries no finmo_request_id, so it is never decidable
  // here (its condition is decided on the conditions checklist).
  const canAct = canDecide && card.origin === 'finmo' && card.received !== null && !done

  return (
    <details className={`group rounded-[9px] border bg-white ${flagged || card.stale ? 'border-amber-300' : 'border-cool-200'}`}>
      <summary className="cursor-pointer list-none p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-heading text-[13px] font-semibold capitalize text-navy">{humanize(card.name)}</p>
            <p className="mt-0.5 truncate font-ui text-[11px] text-cool-500">
              {card.origin === 'commitment' && <span className="text-cool-400">From the commitment · </span>}
              {receivedLine(card)}
              {cdLine && <span className="text-cool-400"> · {cdLine}</span>}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <StateChip card={card} />
            {/* A Finmo approval sits alongside a still-loud verdict (both truths). */}
            {card.finmoApproved && card.state !== 'reviewed' && <StatusChip tone="green">✓ Approved in Finmo</StatusChip>}
            <DecisionBadge card={card} />
          </div>
        </div>
        {/* flagged: the plain reason, the only amber. */}
        {card.verdict === 'flagged' && flagReason(card) && (
          <p className="mt-2 font-ui text-[11px] font-semibold text-amber-800">Flagged: {flagReason(card)}</p>
        )}
        {/* questions: quiet, generic on the face; the reason lives in the expansion. */}
        {card.verdict === 'questions' && (
          <p className="mt-2 font-ui text-[11px] text-cool-500">Couldn&rsquo;t read everything, worth a glance.</p>
        )}
        {/* stale_cycle: the soft line verbatim, never amber. */}
        {card.verdict === 'stale_cycle' && staleCycleLine(card) && (
          <p className="mt-2 font-ui text-[11px] text-cool-600">{staleCycleLine(card)}</p>
        )}
        {/* The B6.3 day-window advisory (only when the workbench produced no
            verdict). Renders BESIDE any approval chip, never replacing it. */}
        {card.stale && (
          <p className="mt-2 font-ui text-[11px] font-semibold text-amber-800">
            May be stale (uploaded {card.stale.days} days ago)
          </p>
        )}
        {/* A send-back is honest on the face: it still needs to resolve. */}
        {card.decision?.verdict === 'sent_back' && card.decision.note && (
          <p className="mt-2 font-ui text-[11px] text-amber-800">Sent back: {card.decision.note}</p>
        )}
      </summary>

      <div className="border-t border-cool-100 px-3 pb-3 pt-2 font-ui text-[12px] text-cool-600">
        <div className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
          {card.finmoStatus && (
            <span>
              Finmo status <span className="font-semibold capitalize text-navy">{humanize(card.finmoStatus)}</span>
            </span>
          )}
          <span>
            Requested{' '}
            <span className="font-semibold text-navy">{card.requestedAt ? fmtShortDate(card.requestedAt) : 'not recorded'}</span>
          </span>
          {card.received?.filename && (
            <span>
              Latest file <span className="font-semibold text-navy">{card.received.filename}</span>
            </span>
          )}
          {card.reviewedAt && (
            <span>
              {card.reviewedKind === 'confirmed' ? 'Confirmed' : 'Approved in Finmo'}{' '}
              <span className="font-semibold text-navy">{fmtShortDate(card.reviewedAt)}</span>
            </span>
          )}
        </div>

        {/* Condition-analysis verdict (the "Analysis (draft)" block). */}
        {card.analysis && (
          <div
            className={`mt-2 rounded-md border px-2.5 py-1.5 text-[12px] ${
              card.analysis.tone === 'green'
                ? 'border-green-200 bg-green-50 text-green-800'
                : card.analysis.tone === 'amber'
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            <span className="font-semibold">Analysis (draft)</span> · {card.analysis.verdictLabel}
            {card.analysis.reason && <span className="opacity-90">: {card.analysis.reason}</span>}
            {card.analysis.asOf && <span className="opacity-75"> · as of {card.analysis.asOf}</span>}
          </div>
        )}

        {/* Request-review verdict reasons (cited). */}
        <ReviewReasons card={card} />

        {evidence && <EvidenceBlock doc={evidence} />}

        {!card.analysis && !card.review && !evidence && (
          <p className="mt-2 text-[11px] text-cool-500">
            {card.received ? STATE_HINT[card.state] : 'Nothing received yet.'}
          </p>
        )}

        {/* Michael's decision, recorded. */}
        {card.decision && (
          <p className="mt-2 text-[11px] text-cool-500">
            {card.decision.verdict === 'approved' ? 'Approved by you' : 'Sent back'}
            {card.decision.decidedByEmail ? ` (${card.decision.decidedByEmail})` : ''}
            {card.decision.decidedAt ? ` on ${fmtShortDate(card.decision.decidedAt)}` : ''}
            {card.decision.verdict === 'sent_back' && card.decision.note ? `: ${card.decision.note}` : ''}. This is the
            platform&rsquo;s record of your review; Finmo&rsquo;s own status still changes only inside Finmo.
          </p>
        )}

        {/* The two human actions (approve / send back), once a document has arrived. */}
        {canAct && (
          <div className="mt-2.5 border-t border-cool-100 pt-2.5">
            {error && <p className="mb-1.5 text-[11px] font-semibold text-red-600">{error}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => decide('approve')}
                className="inline-flex items-center gap-1 rounded-md bg-navy px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
                data-testid={`request-approve-${card.key}`}
              >
                {busy === 'approve' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Approve
              </button>
              <button
                type="button"
                disabled={busy !== null}
                aria-expanded={sendingBack}
                onClick={() => setSendingBack(v => !v)}
                className="inline-flex items-center gap-1 rounded-md border border-cool-300 px-3 py-1.5 text-[11px] font-semibold text-cool-700 disabled:opacity-40"
              >
                <Send className="h-3 w-3" /> Send back
              </button>
            </div>
            {sendingBack && (
              <div className="mt-2">
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value.slice(0, 500))}
                  rows={2}
                  placeholder="Why is this going back to the client? (they will see this reason)"
                  className="w-full rounded-md border border-cool-300 p-2 text-[12px] font-ui"
                />
                <button
                  type="button"
                  disabled={busy !== null || reason.trim().length < 5}
                  onClick={() => decide('send_back')}
                  className="mt-1 inline-flex items-center gap-1 rounded-md border border-amber-300 px-3 py-1.5 text-[11px] font-semibold text-amber-800 disabled:opacity-40"
                >
                  {busy === 'send_back' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />} Confirm send back
                </button>
              </div>
            )}
          </div>
        )}
        {done && <p className="mt-2 text-[11px] font-semibold text-green-700">{done}</p>}
      </div>
    </details>
  )
}

function Pill({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1 font-ui text-[12px] font-semibold tabular-nums transition-colors ${
        active ? 'bg-navy text-white' : 'border border-cool-200 bg-white text-cool-600 hover:border-navy hover:text-navy'
      }`}
    >
      {label} <span className={active ? 'text-white/70' : 'text-cool-400'}>{count}</span>
    </button>
  )
}

// The per-section "Withdrawn (N)" expandable — retained ghosts, muted.
function WithdrawnRow({ items }: { items: WithdrawnCard[] }) {
  if (items.length === 0) return null
  return (
    <details className="mt-2.5">
      <summary className="cursor-pointer list-none font-ui text-[11px] font-semibold text-cool-400 hover:text-cool-600">
        Withdrawn ({items.length})
      </summary>
      <div className="mt-1.5 space-y-1">
        {items.map(w => (
          <p key={w.key} className="font-ui text-[11px] text-cool-400">
            <span className="capitalize line-through">{humanize(w.name)}</span>
            {w.withdrawnAt ? <span className="ml-1.5">withdrawn {fmtShortDate(w.withdrawnAt)}</span> : null}
          </p>
        ))}
      </div>
    </details>
  )
}

function CheckFinmoButton({ dealId, lastCheckedAt, demo }: { dealId: string; lastCheckedAt: string | null; demo: boolean }) {
  const router = useRouter()
  const mint = useGatesToken()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rel, setRel] = useState<string | null>(null)

  useEffect(() => {
    setRel(timeAgo(lastCheckedAt, Date.now()))
  }, [lastCheckedAt])

  const check = async () => {
    if (demo) {
      setError('Demo mode: the Finmo check is disabled.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const token = await mint()
      const res = await fetch(`/api/portal/admin/gates/deals/${dealId}/check-finmo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { [GATES_TOKEN_HEADER]: token } : {}) },
      })
      const j = await res.json().catch(() => null)
      if (res.ok && j?.ok !== false) {
        router.refresh()
      } else {
        setError(j?.message ?? `Failed (HTTP ${res.status})`)
      }
    } catch {
      setError('Network error; retry.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={check}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-md border border-cool-300 px-2.5 py-1 font-ui text-[11px] font-semibold text-cool-700 hover:border-navy hover:text-navy disabled:opacity-40"
        data-testid="check-finmo-now"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Check Finmo now
      </button>
      {error ? (
        <span className="font-ui text-[10px] text-red-600">{error}</span>
      ) : lastCheckedAt ? (
        <span className="font-ui text-[10px] text-cool-400">Last checked {rel ?? fmtShortDate(lastCheckedAt)}</span>
      ) : (
        <span className="font-ui text-[10px] text-cool-400">Not pulled yet</span>
      )}
    </div>
  )
}

export default function DocumentsDesk({
  desk,
  evidenceByDocId = {},
  residual = [],
  dealId,
  canDecide = false,
  lastCheckedAt = null,
  demo = false,
}: {
  desk: RequestsDesk
  evidenceByDocId?: Record<string, DealStatementDoc>
  residual?: ResidualDoc[]
  dealId: string
  canDecide?: boolean
  lastCheckedAt?: string | null
  demo?: boolean
}) {
  const [filter, setFilter] = useState<Filter>('all')

  const sections = useMemo(
    () =>
      desk.sections
        .map(s => ({ ...s, cards: filter === 'all' ? s.cards : s.cards.filter(c => c.filter === filter) }))
        // A section stays visible when it has matching cards, OR (in the 'all'
        // view) when it holds only withdrawn ghosts.
        .filter(s => s.cards.length > 0 || (filter === 'all' && s.withdrawn.length > 0)),
    [desk.sections, filter],
  )

  if (desk.isEmpty && residual.length === 0) {
    return (
      <div className="flex items-start justify-between gap-3">
        <p className="font-ui text-sm text-cool-500">No document requests on this file yet.</p>
        <CheckFinmoButton dealId={dealId} lastCheckedAt={lastCheckedAt} demo={demo} />
      </div>
    )
  }

  const p = desk.progress
  const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0

  return (
    <div className="space-y-4">
      {/* Overall progress + Check-Finmo + filter pills. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-ui text-[13px] text-cool-600">
          <span className="font-heading font-semibold tabular-nums text-navy">
            {p.done} of {p.total}
          </span>{' '}
          complete
          <span className="ml-2 inline-block h-1.5 w-24 overflow-hidden rounded-full bg-cool-100 align-middle">
            <span className="block h-full rounded-full bg-navy" style={{ width: `${pct}%` }} />
          </span>
        </div>
        <CheckFinmoButton dealId={dealId} lastCheckedAt={lastCheckedAt} demo={demo} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Pill label="All" count={desk.filterCounts.all} active={filter === 'all'} onClick={() => setFilter('all')} />
        <Pill label="Waiting" count={desk.filterCounts.waiting} active={filter === 'waiting'} onClick={() => setFilter('waiting')} />
        <Pill label="Needs your look" count={desk.filterCounts.look} active={filter === 'look'} onClick={() => setFilter('look')} />
        <Pill label="Questions" count={desk.filterCounts.questions} active={filter === 'questions'} onClick={() => setFilter('questions')} />
        <Pill label="Done" count={desk.filterCounts.done} active={filter === 'done'} onClick={() => setFilter('done')} />
      </div>

      {sections.length === 0 ? (
        <p className="font-ui text-sm text-cool-500">Nothing in this view.</p>
      ) : (
        sections.map(s => (
          <section key={s.key}>
            <div className="mb-2 flex items-baseline gap-2">
              <h4 className="font-heading text-[12.5px] font-semibold tracking-[0.03em] text-navy">{s.label}</h4>
              {s.total > 0 ? (
                <span className="font-ui text-[11px] text-cool-500 tabular-nums">
                  {s.done} of {s.total}
                </span>
              ) : (
                <span className="font-ui text-[11px] text-cool-400">withdrawn only</span>
              )}
            </div>
            {s.cards.length > 0 && (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {s.cards.map(card => (
                  <RequestCardView
                    key={card.key}
                    card={card}
                    evidenceByDocId={evidenceByDocId}
                    dealId={dealId}
                    canDecide={canDecide}
                    demo={demo}
                  />
                ))}
              </div>
            )}
            {filter === 'all' && <WithdrawnRow items={s.withdrawn} />}
          </section>
        ))
      )}

      {/* Task 3: documents collected but not tied to any request — nothing
          collected becomes invisible. */}
      {residual.length > 0 && (
        <section>
          <div className="mb-2 flex items-baseline gap-2">
            <h4 className="font-heading text-[12.5px] font-semibold tracking-[0.03em] text-navy">Not tied to a request</h4>
            <span className="font-ui text-[11px] text-cool-500 tabular-nums">{residual.length}</span>
          </div>
          <div className="space-y-1.5">
            {residual.map(d => {
              const ev = evidenceByDocId[d.documentId]
              return (
                <div key={d.key} className="rounded-md border border-cool-100 bg-cool-50/40 px-3 py-2">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-ui text-[12px]">
                    <span className="font-semibold capitalize text-navy">{humanize(d.kind)}</span>
                    <span className="text-cool-500">via {humanize(d.source)}</span>
                    {d.date && <span className="text-cool-400 tabular-nums">{fmtShortDate(d.date)}</span>}
                  </div>
                  {ev && <EvidenceBlock doc={ev} />}
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
