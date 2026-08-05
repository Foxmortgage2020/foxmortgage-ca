// One deal card — the LIME ZONE, and the only place the decision token is
// allowed to render on this board.
//
// THE ZONE RULE, enforced by this file existing. Two greens carry two meanings
// here:
//
//     needs-you lime (this file)  →  cards only
//     projection green            →  column footers and the insights strip,
//                                    in ProjectionFigure.tsx, never here
//
// This module must NEVER import PROJECTION_GREEN or ProjectionFigure, and
// ProjectionFigure must never import the decision token. tests/shell.test.ts
// (the exhaustive lime audit, keyed by file path) and tests/phase-model.test.ts
// assert both halves, so the two greens cannot end up beside each other without
// the suite failing.
//
// THE CARD OPENS THE FILE (handoff 50). It used to select the deal for a
// right-hand preview panel by putting its file ref in the URL. Michael's actual
// behaviour was to open the panel and immediately click through to the full
// file, every time, so the panel was a step between him and the thing he
// wanted. The card now routes straight to the file page. The preview component
// is still in the repo, unreferenced, so restoring the old behaviour is one
// line rather than a rebuild.
//
// `selected` survives the change and now means "the card you came back from":
// the file page's back link still carries ?deal=<ref>, so returning to the
// board rings the card you left. It costs nothing and no longer opens anything.
//
// THE CARD ITSELF IS STILL A SERVER COMPONENT with no handler and no state. The
// Remove control is a CLIENT component passed in as `remove` and rendered as a
// SIBLING of the link, never inside it: a button nested in an anchor is invalid
// HTML, and a press meant for the control would navigate instead.

import Link from 'next/link'
import {
  BLOCKED_BY_LABELS,
  DAYS_UNKNOWN_COPY,
  blockedByChip,
  borrowersFor,
  daysInStage,
  fmtAmount,
  isActionableChip,
  milestonesForDeal,
  purposeLabel,
  tagsForDeal,
  type CardTagLike,
  type DealClientLike,
  type DealLike,
  type DealMilestoneLike,
  type MilestoneTypeLike,
  type StageEventLike,
} from '@/lib/phase-model'
import { typeSkin } from '@/lib/phase-palette'

export default function DealCard({
  deal,
  events,
  clients,
  tags,
  milestoneTypes,
  milestones,
  nowISO,
  href,
  selected,
  remove,
}: {
  deal: DealLike
  events: StageEventLike[]
  clients: DealClientLike[]
  tags: CardTagLike[]
  milestoneTypes: MilestoneTypeLike[]
  milestones: DealMilestoneLike[]
  nowISO: string
  href: string
  selected: boolean
  /** The Remove control, a client component rendered OUTSIDE the link. Absent
   *  when the viewer cannot withdraw, so a control nobody can use never takes
   *  up a row on a card. */
  remove?: React.ReactNode
}) {
  const borrowers = borrowersFor(deal, clients)
  const days = daysInStage(deal, events, nowISO)
  const chip = blockedByChip(deal.blocked_by)
  const amount = fmtAmount(deal.mortgage_amount)
  const type = purposeLabel(deal.deal_type)
  const t = typeSkin(deal.deal_type)
  const activeTags = tagsForDeal(tags, deal)
  const marks = milestonesForDeal(deal, milestones, milestoneTypes)

  return (
    <div
      className={`overflow-hidden rounded-[7px] border bg-white shadow-[0_1px_2px_rgba(10,27,46,.05)] motion-safe:transition-shadow hover:shadow-card ${
        selected ? 'border-navy ring-1 ring-navy' : 'border-cool-200'
      }`}
      data-testid={`beta-deal-${deal.file_ref ?? deal.id}`}
    >
      <Link
        href={href}
        aria-current={selected ? 'true' : undefined}
        className="block p-3"
        data-testid={`beta-deal-open-${deal.file_ref ?? deal.id}`}
      >
        <div className="flex items-start gap-2">
          <span className="font-heading text-[11px] tabular-nums text-cool-600">
            {deal.file_ref ?? 'no file ref'}
          </span>
          {/* Deal type is a real distinction and gets meaning-carrying colour.
              OUTLINED, because phases own filled tints — a different channel. */}
          {type && t && (
            <span
              className="ml-auto shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
              style={{ color: t.fg, borderColor: t.border, background: t.bg }}
            >
              {type}
            </span>
          )}
        </div>

        {borrowers.length > 0 ? (
          <div className="mt-1.5">
            {borrowers.map(b => (
              <p key={`${b.name}-${b.role}`} className="text-sm leading-snug text-navy">
                {b.name}
                <span className="ml-1.5 text-[10px] uppercase tracking-wide text-cool-500">
                  {b.role}
                </span>
              </p>
            ))}
          </div>
        ) : (
          <p className="mt-1.5 text-sm text-cool-500">no borrower recorded</p>
        )}

        {amount && (
          <p className="mt-1.5 font-heading text-base font-semibold text-navy tabular-nums">
            {amount}
          </p>
        )}

        {/* Card tags, from rules the record layer owns. Only ACTIVE verdicts
            render; a rule that cannot be evaluated produces nothing here and is
            named once above the board instead. */}
        {activeTags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {activeTags.map(tag => (
              <span
                key={tag.code}
                title={tag.description ?? undefined}
                className="rounded-sm border border-caution/40 bg-caution-bg px-1.5 py-0.5 text-[10px] font-semibold text-caution"
                data-testid={`beta-tag-${tag.code}`}
              >
                {tag.label}
              </span>
            ))}
          </div>
        )}

        {/* Milestones: small dated markers, not stages. */}
        {marks.length > 0 && (
          <div className="mt-2 space-y-0.5">
            {marks.map(m => (
              <p key={m.code} className="text-[10px] text-cool-600 tabular-nums">
                <span className="mr-1 text-cool-400">◆</span>
                {m.label}
                {m.occurred_at && <span className="ml-1">{m.occurred_at.slice(0, 10)}</span>}
              </p>
            ))}
          </div>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {/* Lime has exactly one meaning anywhere in the Command Centre: this
              needs Michael. Only the You chip carries it; Client, Lender and
              Lawyer are information and stay quiet, which is the only reason You
              means anything. Nothing renders at all when blocked_by is null. */}
          {chip && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                isActionableChip(chip) ? 'bg-decision text-decision-ink' : 'bg-cool-100 text-cool-700'
              }`}
            >
              {BLOCKED_BY_LABELS[chip]}
            </span>
          )}
          {days.known ? (
            <span
              className="ml-auto text-[10px] tabular-nums text-cool-600"
              title={`Entered this stage on ${days.since}`}
            >
              {days.days}d in stage
            </span>
          ) : (
            <span className="ml-auto text-[10px] italic text-cool-500">
              {DAYS_UNKNOWN_COPY[days.reason]}
            </span>
          )}
        </div>
      </Link>

      {/* Outside the link, on purpose. A button inside an anchor is invalid
          HTML and every press meant for it would navigate instead. */}
      {remove && <div className="border-t border-cool-100">{remove}</div>}
    </div>
  )
}
