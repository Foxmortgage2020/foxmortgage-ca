// One file card — the LIME ZONE, and the only place lime renders on this board.
//
// TAKEN FROM THE DESIGN EXPORT'S "Needs you" BLOCK, structure and values both:
// a quiet monospace identity line, the borrower and amount as the headline, the
// property beneath, a footer carrying closing state and days in stage, and one
// line naming what the file is waiting on. Every size, weight, colour and inset
// below was read out of that block rather than chosen here.
//
// THE LEFT BAR CARRIES EXACTLY TWO VALUES. Lime means this file needs work
// today. Navy means it is under control. Nothing else on the page is lime, so a
// person can answer "what am I working on" from the bars alone without reading
// a word. That only works because the lime is rationed this hard, which is why
// `cardBar` keys on the same urgency the countdown computes: the sixteen files
// the summary strip counts and the sixteen lime bars are the same sixteen by
// construction rather than by two rules happening to agree.
//
// THE ZONE RULE, enforced by this file existing. Two greens carry two meanings:
//
//     needs-you lime (this file)  ->  cards only
//     projection green            ->  footers and the strips, in
//                                     ProjectionFigure.tsx, never here
//
// This module must NEVER import PROJECTION_GREEN or ProjectionFigure, and
// ProjectionFigure must never import the decision token. tests/shell.test.ts
// and tests/phase-model.test.ts assert both halves against the source.
//
// RED SURVIVES INSIDE A CARD ON THE CLOSING COUNTDOWN ONLY, which is the one
// place it means "this should have closed and did not".
//
// A MISSING VALUE IS ITALIC, DOTTED AND MUTED, all three at once, because a gap
// in a column of monospaced figures has to be legible as a gap.
//
// Still a SERVER COMPONENT with no handler and no state. The Remove control is
// a CLIENT component passed in as `remove` and rendered as a SIBLING of the
// link, never inside it: a button nested in an anchor is invalid HTML.

import Link from 'next/link'
import {
  BLOCKED_BY_LABELS,
  DAYS_UNKNOWN_COPY,
  blockedByChip,
  borrowersFor,
  daysInStage,
  fmtAmount,
  isActionableChip,
  purposeLabel,
  type DealClientLike,
  type DealLike,
  type StageEventLike,
} from '@/lib/phase-model'
import { cardBar, closingCountdown } from '@/lib/board-layout'
import {
  MISSING_VALUE,
  RADIUS,
  ROLE,
  STROKE,
  SURFACE,
  TEXT,
  TYPE,
  navyAlpha,
  radius,
  typeStyle,
} from '@/lib/design-tokens'

/** The waiting-on line. `blocked_by` is the only recorded answer to "what is
 *  this file waiting on", so it is what the line says. A file with none says so
 *  plainly rather than the row being dropped, because an absent blocker and an
 *  unrecorded one are different facts and the card keeps its shape either way. */
function chaseLine(deal: DealLike): { text: string; known: boolean } {
  const chip = blockedByChip(deal.blocked_by)
  if (!chip) return { text: 'Nothing recorded as outstanding', known: false }
  return {
    text: isActionableChip(chip)
      ? 'Waiting on you'
      : `Waiting on the ${BLOCKED_BY_LABELS[chip].toLowerCase()}`,
    known: true,
  }
}

export default function DealCard({
  deal,
  events,
  clients,
  nowISO,
  todayYMD,
  stageCategory,
  stageName,
  address,
  href,
  selected,
  remove,
}: {
  deal: DealLike
  events: StageEventLike[]
  clients: DealClientLike[]
  nowISO: string
  /** Today in Toronto, resolved once on the page so every countdown on the
   *  screen agrees about what day it is. */
  todayYMD: string
  /** The sub-stage's own category. A passed closing on a terminal sub-stage is
   *  the normal outcome rather than an alarm, so the countdown needs to know. */
  stageCategory: string | null
  /** The sub-stage's label, for the card's identity line. */
  stageName: string
  /** The subject property's address, resolved on the page. */
  address: string | null
  href: string
  selected: boolean
  remove?: React.ReactNode
}) {
  const borrowers = borrowersFor(deal, clients)
  const days = daysInStage(deal, events, nowISO)
  const amount = fmtAmount(deal.mortgage_amount)
  const type = purposeLabel(deal.deal_type)
  const closingDate = typeof deal.closing_date === 'string' ? deal.closing_date : null
  const countdown = closingCountdown({ closingDate, todayYMD, stageCategory })
  const bar = cardBar(countdown)
  const chase = chaseLine(deal)

  const inset = { marginLeft: '-10px', marginRight: '-10px', padding: '7px 10px' }

  return (
    <div
      // shrink-0 is load bearing: the card is a flex item inside the column's
      // scroll box, and a flex child shrinks by default. Without it, sixty-six
      // cards in the funded column compress to sixty-six empty bars.
      className="flex shrink-0 flex-col overflow-hidden"
      style={{
        background: SURFACE.panel,
        border: `${STROKE.hairline}px solid ${navyAlpha(0.11)}`,
        // THE BAR. Two values, and the whole reason the board can be scanned.
        borderLeft: `${STROKE.cardBar}px solid ${bar === 'needs' ? ROLE.lime : TEXT.navy}`,
        borderRadius: radius(RADIUS.card),
        padding: '9px 10px 0',
      }}
      data-testid={`beta-deal-${deal.file_ref ?? deal.id}`}
      data-bar={bar}
    >
      <Link href={href} className="block" data-testid={`beta-deal-open-${deal.file_ref ?? deal.id}`}>
        {/* IDENTITY. Quiet monospace: reference, sub-stage, and the deal type
            on the right. Nothing here competes with the headline. */}
        <div className="flex items-center gap-1.5" style={{ ...typeStyle(TYPE.cardMeta), color: TEXT.metaMono }}>
          <span>{deal.file_ref ?? 'No reference'}</span>
          <span className="min-w-0 truncate">· {stageName}</span>
          {type && <span className="ml-auto shrink-0">{type}</span>}
        </div>

        {/* HEADLINE. Who, then how much. */}
        <div style={{ ...typeStyle(TYPE.cardWho), color: TEXT.navy, margin: '6px 0 3px' }}>
          {borrowers.length > 0 ? (
            borrowers.map(b => b.name).join(', ')
          ) : (
            <span style={MISSING_VALUE}>No borrower recorded</span>
          )}
        </div>
        <div
          style={{
            ...typeStyle(TYPE.cardAmount),
            margin: '0 0 4px',
            ...(amount ? { color: TEXT.navy } : MISSING_VALUE),
          }}
        >
          {amount ?? 'No amount'}
        </div>

        {/* The property. One line, clipped, so a long address cannot push the
            card taller than its neighbours in the same column. */}
        <div
          className="overflow-hidden"
          style={{
            ...typeStyle(TYPE.cardAddress),
            height: '15px',
            ...(address ? { color: TEXT.dim } : MISSING_VALUE),
          }}
        >
          {address ?? 'No address recorded'}
        </div>

        {/* FOOTER. Closing state on the left, time in this sub-stage on the
            right. Red appears here and nowhere else on the board. */}
        <div
          className="mt-2 flex items-center gap-2"
          style={{ ...inset, marginTop: '8px', borderTop: `${STROKE.hairline}px solid ${SURFACE.hairline}` }}
        >
          <span
            style={{
              ...typeStyle(TYPE.cardDue),
              ...(countdown.state === 'no_date'
                ? MISSING_VALUE
                : { color: countdown.urgent ? ROLE.red : TEXT.dim }),
            }}
            data-countdown={countdown.state}
          >
            {countdown.label}
          </span>
          <span
            className="ml-auto shrink-0"
            style={{ ...typeStyle(TYPE.cardInStage), color: TEXT.metaMono }}
            title={days.known ? `Entered this sub-stage on ${days.since}` : undefined}
          >
            {days.known ? `${days.days}d here` : DAYS_UNKNOWN_COPY[days.reason]}
          </span>
        </div>

        {/* WHAT IT IS WAITING ON. The last row, on its own quiet ground. The
            square takes the bar's colour, so the card states its own status
            twice in two places that cannot disagree. */}
        <div
          className="flex items-center gap-1.5"
          style={{
            ...inset,
            borderTop: `${STROKE.hairline}px solid ${SURFACE.hairline}`,
            background: SURFACE.chaseBg,
          }}
        >
          <span
            aria-hidden="true"
            className="shrink-0"
            style={{
              width: '5px',
              height: '5px',
              borderRadius: radius(RADIUS.dot),
              background: bar === 'needs' ? ROLE.lime : TEXT.navy,
            }}
          />
          <span
            className="truncate"
            style={{ ...typeStyle(TYPE.cardChase), ...(chase.known ? { color: TEXT.body } : MISSING_VALUE) }}
          >
            {chase.text}
          </span>
        </div>
      </Link>

      {/* Outside the link, on purpose. A button inside an anchor is invalid
          HTML and every press meant for it would navigate instead. */}
      {remove && (
        <div style={{ ...inset, borderTop: `${STROKE.hairline}px solid ${SURFACE.hairline}` }}>{remove}</div>
      )}
    </div>
  )
}
