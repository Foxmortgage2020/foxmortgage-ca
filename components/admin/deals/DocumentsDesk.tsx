'use client'

// The documents desk (B6.2): the reading room, keyed on the REQUEST. Finmo owns
// collection; this surface reads the request list and reports — what is waiting
// on the client, what has arrived and needs a look (AI-flagged first), and what
// is done. Borrower-sectioned per Finmo's own categorisation, with a progress
// line and status-filter pills. Each request expands to its detail and, where a
// commitment condition bridges it to an analysed document, the reparented
// evidence and verdict. Never lime — an AI flag is amber; reviewing is work, not
// a queued platform decision.

import { useMemo, useState } from 'react'
import StatusChip from '@/components/admin/ds/StatusChip'
import { fmtShortDate, fmtDateTime } from '@/lib/dates'
import type { RequestsDesk, RequestCard, RequestState } from '@/lib/documents-desk'
import type { DealStatementDoc } from '@/lib/underwriting'

type Filter = 'all' | 'waiting' | 'look' | 'done'

const humanize = (s: string) => s.replace(/_/g, ' ')

// The status chip for a card's lifecycle state. navy-outline is the
// received-awaiting-review treatment (not a filled tone); the rest map to ds
// StatusChip tones. Green states carry a quiet check.
function StateChip({ card }: { card: RequestCard }) {
  const s = card.state
  if (s === 'waiting') return <StatusChip tone="gray">Waiting on the client</StatusChip>
  if (s === 'received')
    return (
      <span className="inline-block rounded-full border border-navy px-2 py-0.5 text-[11px] font-semibold text-navy">
        Ready for your look
      </span>
    )
  if (s === 'ai_passed') return <StatusChip tone="green">✓ Looks right</StatusChip>
  if (s === 'ai_flagged') return <StatusChip tone="amber">Flagged</StatusChip>
  // reviewed: an approval always names its source. Finmo's status token reflects
  // Michael's accepts inside Finmo, so it reads "Approved in Finmo" — never a bare
  // "Approved" and never "by you" (the desk cannot know which human clicked in
  // Finmo). A bridging condition Michael verified reads "Confirmed".
  return (
    <StatusChip tone="green">
      ✓ {card.reviewedKind === 'confirmed' ? 'Confirmed' : 'Approved in Finmo'}
    </StatusChip>
  )
}

const STATE_HINT: Record<RequestState, string> = {
  waiting: 'Waiting on the client',
  received: 'Ready for your look',
  ai_passed: 'Looks right, ready for your look',
  ai_flagged: 'Needs your look',
  reviewed: 'Done',
}

function receivedLine(card: RequestCard): string | null {
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

function RequestCardView({
  card,
  evidenceByDocId,
}: {
  card: RequestCard
  evidenceByDocId: Record<string, DealStatementDoc>
}) {
  const evidence = card.documentId ? evidenceByDocId[card.documentId] : undefined
  const flagged = card.state === 'ai_flagged'
  return (
    <details className={`group rounded-[9px] border bg-white ${flagged || card.stale ? 'border-amber-300' : 'border-cool-200'}`}>
      <summary className="cursor-pointer list-none p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-heading text-[13px] font-semibold capitalize text-navy">{humanize(card.name)}</p>
            <p className="mt-0.5 truncate font-ui text-[11px] text-cool-500">
              {card.origin === 'commitment' && <span className="text-cool-400">From the commitment · </span>}
              {receivedLine(card)}
            </p>
          </div>
          <div className="shrink-0">
            <StateChip card={card} />
          </div>
        </div>
        {flagged && card.analysis?.reason && (
          <p className="mt-2 font-ui text-[11px] font-semibold text-amber-800">Flagged: {card.analysis.reason}</p>
        )}
        {/* A freshness advisory renders BESIDE the approval chip, never replacing
            it — a stale document that is approved in Finmo shows both truths. */}
        {card.stale && (
          <p className="mt-2 font-ui text-[11px] font-semibold text-amber-800">
            May be stale (uploaded {card.stale.days} days ago)
          </p>
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

        {card.analysis && (
          <div className={`mt-2 rounded-md border px-2.5 py-1.5 text-[12px] ${
            card.analysis.tone === 'green'
              ? 'border-green-200 bg-green-50 text-green-800'
              : card.analysis.tone === 'amber'
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-red-200 bg-red-50 text-red-800'
          }`}>
            <span className="font-semibold">Analysis (draft)</span> · {card.analysis.verdictLabel}
            {card.analysis.reason && <span className="opacity-90">: {card.analysis.reason}</span>}
            {card.analysis.asOf && <span className="opacity-75"> · as of {card.analysis.asOf}</span>}
          </div>
        )}

        {evidence && <EvidenceBlock doc={evidence} />}

        {!card.analysis && !evidence && (
          <p className="mt-2 text-[11px] text-cool-500">
            {card.received ? STATE_HINT[card.state] : 'Nothing received yet.'}
          </p>
        )}
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

export default function DocumentsDesk({
  desk,
  evidenceByDocId = {},
  unlinkedEvidence = [],
}: {
  desk: RequestsDesk
  evidenceByDocId?: Record<string, DealStatementDoc>
  unlinkedEvidence?: DealStatementDoc[]
}) {
  const [filter, setFilter] = useState<Filter>('all')

  const sections = useMemo(
    () =>
      desk.sections
        .map(s => ({ ...s, cards: filter === 'all' ? s.cards : s.cards.filter(c => c.filter === filter) }))
        .filter(s => s.cards.length > 0),
    [desk.sections, filter],
  )

  if (desk.isEmpty && unlinkedEvidence.length === 0) {
    return <p className="font-ui text-sm text-cool-500">No document requests on this file yet.</p>
  }

  const p = desk.progress
  const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0

  return (
    <div className="space-y-4">
      {/* Overall progress + filter pills. */}
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
        <div className="flex flex-wrap gap-1.5">
          <Pill label="All" count={desk.filterCounts.all} active={filter === 'all'} onClick={() => setFilter('all')} />
          <Pill label="Waiting" count={desk.filterCounts.waiting} active={filter === 'waiting'} onClick={() => setFilter('waiting')} />
          <Pill label="Needs your look" count={desk.filterCounts.look} active={filter === 'look'} onClick={() => setFilter('look')} />
          <Pill label="Done" count={desk.filterCounts.done} active={filter === 'done'} onClick={() => setFilter('done')} />
        </div>
      </div>

      {sections.length === 0 ? (
        <p className="font-ui text-sm text-cool-500">Nothing in this view.</p>
      ) : (
        sections.map(s => (
          <section key={s.key}>
            <div className="mb-2 flex items-baseline gap-2">
              <h4 className="font-heading text-[12.5px] font-semibold tracking-[0.03em] text-navy">{s.label}</h4>
              <span className="font-ui text-[11px] text-cool-500 tabular-nums">
                {s.done} of {s.total}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {s.cards.map(card => (
                <RequestCardView key={card.key} card={card} evidenceByDocId={evidenceByDocId} />
              ))}
            </div>
          </section>
        ))
      )}

      {unlinkedEvidence.length > 0 && (
        <section>
          <div className="mb-2 flex items-baseline gap-2">
            <h4 className="font-heading text-[12.5px] font-semibold tracking-[0.03em] text-navy">Statement evidence</h4>
            <span className="font-ui text-[11px] text-cool-500">not linked to a request</span>
          </div>
          <div className="space-y-2">
            {unlinkedEvidence.map(doc => (
              <EvidenceBlock key={doc.documentId} doc={doc} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
