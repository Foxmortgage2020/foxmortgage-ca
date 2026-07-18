// The documents desk (B6): the received-documents table becomes a desk of
// compact per-document cards, grouped by state so Michael sees requested vs
// received vs reviewed in one glance. Server component — pure presentation over
// the model in lib/documents-desk.ts; the collection ACTIONS (the uploaders)
// stay above this in the page, unchanged. Design language is the ds: StatusChip
// tones, cool hairlines, Poppins headers, brand navy for emphasis. Never lime —
// reviewing a document is work, not a queued platform decision.

import StatusChip from '@/components/admin/ds/StatusChip'
import { fmtShortDate } from '@/lib/dates'
import type { DocumentCard, DocumentsDesk as Desk, StateTone } from '@/lib/documents-desk'

const humanize = (s: string) => s.replace(/_/g, ' ')

// The state chip. Four tones delegate to StatusChip; the received-pending
// "In review" state is a navy OUTLINE (the brief's treatment) rendered inline.
function StateChipView({ tone, label }: { tone: StateTone; label: string }) {
  if (tone === 'navy-outline') {
    return (
      <span className="inline-block rounded-full border border-navy px-2 py-0.5 text-[11px] font-semibold text-navy">
        {label}
      </span>
    )
  }
  const glyph = tone === 'green' ? '✓ ' : ''
  return (
    <StatusChip tone={tone}>
      {glyph}
      {label}
    </StatusChip>
  )
}

function GroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="mb-2 flex items-baseline gap-2">
      <h4 className="font-heading text-[12.5px] font-semibold tracking-[0.03em] text-navy">{label}</h4>
      <span className="font-ui text-[11px] text-cool-500 tabular-nums">{count}</span>
    </div>
  )
}

function DocCard({ card, borrowerName }: { card: DocumentCard; borrowerName: string }) {
  const meta = [borrowerName, card.source ? humanize(card.source) : null].filter(Boolean).join(' · ')
  const dateLine =
    card.date == null
      ? null
      : card.date.kind === 'received'
        ? `Received ${card.date.value ? fmtShortDate(card.date.value) : 'date not recorded'}`
        : card.date.kind === 'due'
          ? `Due ${card.date.value ? fmtShortDate(card.date.value) : ''}`.trim()
          : 'Requested'

  return (
    <div
      className={`rounded-[9px] border bg-white p-3 ${
        card.synthetic ? 'border-red-300 bg-red-50/50' : 'border-cool-200'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-heading text-[13px] font-semibold capitalize text-navy">{humanize(card.name)}</p>
          {meta && <p className="mt-0.5 truncate font-ui text-[11px] text-cool-500">{meta}</p>}
        </div>
        <div className="shrink-0">
          <StateChipView tone={card.state.tone} label={card.state.label} />
        </div>
      </div>

      {card.synthetic && (
        <p className="mt-2 font-ui text-[11px] font-semibold text-red-700">
          Stand-in, not a lender document. It cannot be approved and does not feed the checklist.
        </p>
      )}

      {card.analysis && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <StatusChip tone={card.analysis.tone}>{card.analysis.label}</StatusChip>
          <span className="font-ui text-[10.5px] text-cool-500">
            {card.analysis.source}
            {card.analysis.asOf ? ` · as of ${card.analysis.asOf}` : ''}
          </span>
        </div>
      )}

      {dateLine && <p className="mt-2 font-ui text-[11px] tabular-nums text-cool-500">{dateLine}</p>}
    </div>
  )
}

function Group({
  label,
  cards,
  borrowerNameById,
}: {
  label: string
  cards: DocumentCard[]
  borrowerNameById: Map<string, string>
}) {
  if (cards.length === 0) return null
  return (
    <section>
      <GroupHeader label={label} count={cards.length} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(card => (
          <DocCard
            key={card.key}
            card={card}
            borrowerName={card.borrowerId ? (borrowerNameById.get(card.borrowerId) ?? 'unknown') : 'General'}
          />
        ))}
      </div>
    </section>
  )
}

export default function DocumentsDesk({
  desk,
  borrowerNameById,
}: {
  desk: Desk
  borrowerNameById: Map<string, string>
}) {
  if (desk.isEmpty) {
    return <p className="font-ui text-sm text-cool-500">No documents recorded on this file yet.</p>
  }
  return (
    <div className="space-y-5">
      <Group label="Needs your eyes" cards={desk.needsEyes} borrowerNameById={borrowerNameById} />
      <Group label="Waiting on the client" cards={desk.waiting} borrowerNameById={borrowerNameById} />
      <Group label="Done" cards={desk.done} borrowerNameById={borrowerNameById} />
    </div>
  )
}
