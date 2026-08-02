// A projected figure — the GREEN ZONE, and the only place projection green is
// allowed to render.
//
// THE ZONE RULE, enforced by this file existing. Two greens now carry two
// meanings on the Deals (Beta) board:
//
//     projection green (here)  →  column footers and the insights strip
//     needs-you lime           →  cards only, in DealCard.tsx
//
// Separating them into two modules is what makes the rule structural rather
// than remembered: this file imports PROJECTION_GREEN and never the decision
// token, DealCard.tsx imports the decision token and never PROJECTION_GREEN,
// and tests assert both halves against the source. A footer cannot acquire a
// lime and a card cannot acquire a projection green without a test failing.
//
// COLOUR NEVER CARRIES THE MEANING ALONE. Every figure rendered here is
// accompanied by the word `weighted` or `projected` at its call site, because a
// reader who does not know the convention still has to be able to read the page.

import { PROJECTION_GREEN } from '@/lib/phase-palette'

/**
 * A weighted or otherwise projected money figure.
 *
 * Solid fill, not a hatch. The hatch was tried and failed: the number sits
 * INSIDE this fill, so a texture runs through the digits. On the
 * practice-history chart the number sits outside the bar, which is why the
 * hatch works there and not here.
 */
export default function ProjectionFigure({
  children,
  size = 'sm',
  testId,
}: {
  children: React.ReactNode
  size?: 'sm' | 'lg'
  testId?: string
}) {
  return (
    <span
      className={`inline-block rounded-[4px] border px-1.5 font-heading tabular-nums ${
        size === 'lg' ? 'text-xl leading-tight' : 'text-sm font-semibold leading-tight'
      }`}
      style={{
        color: PROJECTION_GREEN.ink,
        background: PROJECTION_GREEN.fill,
        borderColor: PROJECTION_GREEN.border,
      }}
      data-projection="true"
      data-testid={testId}
      title="A projection, not a recorded figure"
    >
      {children}
    </span>
  )
}

/** The small word that rides with every projected figure. Colour must not
 * carry the meaning by itself, so this is never optional at a call site. */
export function ProjectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-[10px] uppercase tracking-wide tabular-nums"
      style={{ color: PROJECTION_GREEN.ink }}
    >
      {children}
    </span>
  )
}
