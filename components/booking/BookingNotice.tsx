// One card for every edge the booking flow can land on.
//
// WHY A COMPONENT AND NOT SIX COPIES. Session two grew four near-identical
// centred cards across two files, and session three adds four more: no times,
// provider outage, already cancelled, already happened, not found, and the two
// success states. Eight hand-rolled cards drift — one keeps a stale phone
// number, one loses the email, one styles its heading a size off. This is the
// single place the design system for those cards lives.
//
// IT IS A SERVER-SAFE COMPONENT: no state, no effects, no hooks. The public
// page renders it directly, and both client flows render it too.
//
// ACCESSIBILITY. `as` picks the heading level so a card standing alone on a page
// is an h1 and a card inside a flow that already has one is an h2, which keeps
// the outline legal. Outcome cards pass `live` so a screen reader announces the
// result when the flow swaps to it, instead of the change happening silently.
//
// COPY GATE. Nothing here writes copy. Every word is passed in by the caller and
// gated there, which is the only way a shared component can stay honest about
// tone across a client-facing surface.

import type { ReactNode } from 'react'

export type NoticeTone = 'neutral' | 'good'

export interface BookingNoticeProps {
  title: string
  /** The heading level. h1 when this card is the whole page. */
  as?: 'h1' | 'h2'
  tone?: NoticeTone
  children?: ReactNode
  /** Announce the card when it appears. For outcomes, not for static pages. */
  live?: boolean
  callHref?: string | null
  callLabel?: string | null
  emailHref?: string | null
  emailLabel?: string | null
}

// The public site's neutral family is Tailwind's own gray. The cool-* scale is
// the Deals-surface palette and belongs to the admin shell, not out here.
const SHELL: Record<NoticeTone, string> = {
  neutral: 'border border-gray-200 bg-white',
  good: 'border border-lime/40 bg-lime/10',
}

// focus-visible, not focus: a mouse user clicking a link should not be given a
// ring, but a keyboard user must never be left guessing where they are.
const FOCUS =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2'

const PRIMARY = `inline-block bg-lime text-navy font-heading font-bold px-8 py-4 rounded-xl hover:bg-lime-dark transition-colors text-center ${FOCUS}`
const SECONDARY = `inline-block border-2 border-navy text-navy font-heading font-bold px-8 py-4 rounded-xl hover:bg-navy hover:text-white transition-colors text-center ${FOCUS}`

export default function BookingNotice({
  title,
  as = 'h2',
  tone = 'neutral',
  children,
  live = false,
  callHref,
  callLabel,
  emailHref,
  emailLabel,
}: BookingNoticeProps) {
  const Heading = as
  const hasActions = Boolean((callHref && callLabel) || (emailHref && emailLabel))

  return (
    <div
      className={`${SHELL[tone]} rounded-2xl p-8 sm:p-10 text-center`}
      {...(live ? { role: 'status', 'aria-live': 'polite' } : {})}
    >
      <Heading className="font-heading font-bold text-navy text-2xl mb-3">{title}</Heading>
      {/* gray-600 on white is 7.5 to 1. gray-400, which this file deliberately
          never uses, is 2.8 to 1 and fails at any size. */}
      {children ? <div className="font-body text-gray-600 text-sm sm:text-base">{children}</div> : null}
      {hasActions && (
        <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
          {callHref && callLabel && (
            <a href={callHref} className={PRIMARY}>
              {callLabel}
            </a>
          )}
          {emailHref && emailLabel && (
            <a href={emailHref} className={SECONDARY}>
              {emailLabel}
            </a>
          )}
        </div>
      )}
    </div>
  )
}
