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
// FOUR TIERS (handoff 57), separated by hairlines rather than by fills:
//
//     Identity   the file reference, and the needs-you chip when it applies
//     Headline   borrower names, then the amount
//     Context    deal type, property address, closing date
//     Footer     days in this stage on the left, the countdown on the right
//
// FIGURE-GROUND DOES THE SEPARATING, NOT THE BORDER. The card is white with a
// 2px stroke on the column's grey ground, so a stack of cards reads as a stack
// without any of them shouting.
//
// ONE FILLED CHIP PER CARD, MAXIMUM. Deal type is an outlined pill and
// needs-you is the filled one. If both were filled neither would mean anything.
//
// THE NEEDS-YOU CHIP STILL RENDERS THROUGH THE TAILWIND `decision` TOKENS
// rather than the approved #EDF3D9 / #4A5D0A. Two tests on this session's
// do-not-edit list pin that chip to those exact class names, and redefining the
// token globally would repaint six other surfaces the brief protects. The
// approved values sit in lib/design-tokens.ts ROLE, ready for the day the lime
// pass reaches the rest of the Command Centre. Michael ruled on the deviation.
//
// THE CARD OPENS THE FILE (handoff 50), and is still a SERVER COMPONENT with no
// handler and no state. The Remove control is a CLIENT component passed in as
// `remove` and rendered as a SIBLING of the link, never inside it: a button
// nested in an anchor is invalid HTML, and a press meant for it would navigate.

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
import { closingCountdown, fmtDate } from '@/lib/board-layout'
import { RADIUS, ROLE, STROKE, SURFACE, TEXT, TYPE, radius, typeStyle } from '@/lib/design-tokens'

export default function DealCard({
  deal,
  events,
  clients,
  tags,
  milestoneTypes,
  milestones,
  nowISO,
  todayYMD,
  stageCategory,
  address,
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
  /** Today in Toronto, for the countdown. Resolved once on the page so every
   *  card on the screen agrees about what day it is. */
  todayYMD: string
  /** The stage's own category. A passed closing on a terminal stage is the
   *  normal outcome rather than an alarm, so the countdown needs to know. */
  stageCategory: string | null
  /** The subject property's address, resolved on the page. Null renders as an
   *  absent value rather than being skipped, so the row keeps its shape. */
  address: string | null
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
  const closingDate = typeof deal.closing_date === 'string' ? deal.closing_date : null
  const countdown = closingCountdown({ closingDate, todayYMD, stageCategory })

  const tier = { borderTop: `1px solid ${SURFACE.cardHairline}` }

  return (
    <div
      className="overflow-hidden motion-safe:transition-shadow hover:shadow-card"
      style={{
        background: SURFACE.card,
        border: `${STROKE.card}px solid ${selected ? TEXT.navy : SURFACE.cardBorder}`,
        borderRadius: radius(RADIUS.card),
      }}
      data-testid={`beta-deal-${deal.file_ref ?? deal.id}`}
    >
      <Link
        href={href}
        aria-current={selected ? 'true' : undefined}
        className="block"
        data-testid={`beta-deal-open-${deal.file_ref ?? deal.id}`}
      >
        {/* IDENTITY. The coloured file reference is the repeating anchor that
            lets the eye count cards down a column without reading them. */}
        <div className="flex items-center gap-2 px-3 py-2">
          <span
            className="tabular-nums"
            style={{ ...typeStyle(TYPE.fileRef), color: TEXT.fileRef }}
          >
            {deal.file_ref ?? 'No file reference'}
          </span>
          {/* The one filled chip. Nothing renders at all when blocked_by is
              null, and the other three blockers stay quiet, which is the only
              reason this one means anything. */}
          {chip && (
            <span
              style={typeStyle(TYPE.meta)}
              className={`ml-auto shrink-0 rounded-full px-2 py-0.5 ${
                isActionableChip(chip) ? 'bg-decision text-decision-ink' : 'bg-cool-100 text-cool-700'
              }`}
            >
              {BLOCKED_BY_LABELS[chip]}
            </span>
          )}
        </div>

        {/* HEADLINE. Who, then how much. */}
        <div className="px-3 py-2" style={tier}>
          {borrowers.length > 0 ? (
            borrowers.map(b => (
              <p
                key={`${b.name}-${b.role}`}
                className="leading-snug"
                style={{ ...typeStyle(TYPE.body), color: TEXT.primary }}
              >
                {b.name}
                <span className="ml-1.5" style={{ ...typeStyle(TYPE.meta), color: TEXT.muted }}>
                  {b.role}
                </span>
              </p>
            ))
          ) : (
            <p style={{ ...typeStyle(TYPE.body), color: TEXT.absent }}>No borrower recorded</p>
          )}
          {/* An absent amount says so in the absent-value grey. Never a zero:
              nobody writes a mortgage for nothing, so $0 would read as a fact. */}
          <p
            className="mt-1 tabular-nums"
            style={{
              ...typeStyle(TYPE.cardAmount),
              color: amount ? TEXT.primary : TEXT.absent,
            }}
          >
            {amount ?? 'No amount'}
          </p>
        </div>

        {/* CONTEXT. */}
        <div
          className="px-3 py-2"
          style={{ ...tier, ...typeStyle(TYPE.context), color: TEXT.secondary }}
        >
          <p>
            {type && t ? (
              <span
                className="mr-2 inline-block rounded-full border px-2 py-0.5"
                style={{ color: t.fg, borderColor: t.border, background: t.bg }}
              >
                {type}
              </span>
            ) : (
              <span className="mr-2" style={{ color: TEXT.absent }}>
                Type not specified
              </span>
            )}
          </p>
          <p style={{ color: address ? TEXT.secondary : TEXT.absent }}>
            {address ?? 'No address recorded'}
          </p>
          <p style={{ color: closingDate ? TEXT.secondary : TEXT.absent }}>
            {closingDate ? `Closing ${fmtDate(closingDate)}` : 'No closing date'}
          </p>

          {/* Card tags, from rules the record layer owns. Only ACTIVE verdicts
              render; a rule that cannot be evaluated produces nothing here and
              is named once above the board instead. Outlined, because the card
              already spends its one filled chip on needs-you. */}
          {activeTags.length > 0 && (
            <span className="mt-1 flex flex-wrap gap-1">
              {activeTags.map(tag => (
                <span
                  key={tag.code}
                  title={tag.description ?? undefined}
                  className="inline-block rounded-full border px-2 py-0.5"
                  style={{ borderColor: SURFACE.cardBorder, color: TEXT.secondary }}
                  data-testid={`beta-tag-${tag.code}`}
                >
                  {tag.label}
                </span>
              ))}
            </span>
          )}

          {/* Milestones: small dated markers, not stages. */}
          {marks.map(m => (
            <p key={m.code} className="tabular-nums" style={{ color: TEXT.muted }}>
              {m.label}
              {m.occurred_at && <span className="ml-1">{m.occurred_at.slice(0, 10)}</span>}
            </p>
          ))}
        </div>

        {/* FOOTER. Time in this stage on the left, time to closing on the right. */}
        <div className="flex items-center gap-2 px-3 py-2" style={tier}>
          {days.known ? (
            <span
              className="tabular-nums"
              style={{ ...typeStyle(TYPE.meta), color: TEXT.secondary }}
              title={`Entered this stage on ${days.since}`}
            >
              {days.days} days in this stage
            </span>
          ) : (
            <span style={{ ...typeStyle(TYPE.meta), color: TEXT.absent }}>
              {DAYS_UNKNOWN_COPY[days.reason]}
            </span>
          )}
          <span
            className="ml-auto shrink-0 tabular-nums"
            style={{
              ...typeStyle(countdown.urgent ? TYPE.urgentMeta : TYPE.meta),
              color: countdown.urgent
                ? ROLE.urgent
                : countdown.state === 'no_date'
                  ? TEXT.absent
                  : TEXT.countdown,
            }}
            data-countdown={countdown.state}
          >
            {countdown.label}
          </span>
        </div>
      </Link>

      {/* Outside the link, on purpose. A button inside an anchor is invalid
          HTML and every press meant for it would navigate instead. */}
      {remove && <div style={tier}>{remove}</div>}
    </div>
  )
}
