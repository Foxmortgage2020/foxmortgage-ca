'use client'

// A collapsible phase section for the deal room (B2b). Native <details> so
// the room works without JavaScript; a small effect opens the section when
// the URL hash targets it or an anchor inside it (the list's next-action
// deep links land on #documents / #notes / #conditions / #closeout), and
// keeps working on hash changes after mount.
//
// Presentation only: children arrive server-rendered; nothing here reads or
// writes data. The "now" pill is ink navy — a phase marker, never lime.

import { useEffect, useRef } from 'react'

export default function PhaseSection({
  id,
  label,
  state,
  summary,
  defaultOpen,
  anchors,
  children,
}: {
  id: string
  label: string
  state: 'done' | 'current' | 'upcoming'
  // One honest line shown on the collapsed row.
  summary: string
  defaultOpen: boolean
  // Element ids inside this section (deep-link targets).
  anchors: string[]
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    const openForHash = () => {
      const h = window.location.hash.replace('#', '')
      if (!h) return
      if (h === id || anchors.includes(h)) {
        if (ref.current) ref.current.open = true
        // The browser's default jump ran against the collapsed layout; jump
        // again once the section is open.
        requestAnimationFrame(() => document.getElementById(h)?.scrollIntoView({ block: 'start' }))
      }
    }
    openForHash()
    window.addEventListener('hashchange', openForHash)
    return () => window.removeEventListener('hashchange', openForHash)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, anchors.join('|')])

  return (
    <details
      ref={ref}
      id={id}
      open={defaultOpen}
      className="group scroll-mt-24 rounded-[9px] border border-cool-200 bg-white"
    >
      <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-3 px-5 py-3.5 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            className={`font-heading text-[14px] font-semibold ${
              state === 'upcoming' ? 'text-cool-500' : state === 'current' ? 'text-navy' : 'text-cool-800'
            }`}
          >
            {state === 'done' && <span aria-hidden>✓ </span>}
            {label}
          </span>
          {state === 'current' && (
            <span className="rounded bg-navy px-1.5 py-0.5 text-[10px] font-bold tracking-[0.05em] text-white">
              now
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-2.5 font-ui text-[12.5px] text-cool-500">
          <span className="hidden sm:inline">{summary}</span>
          <span
            aria-hidden
            className="text-base leading-none text-cool-400 motion-safe:transition-transform group-open:rotate-90"
          >
            ›
          </span>
        </span>
      </summary>
      <div className="border-t border-cool-100 px-5 py-4">{children}</div>
    </details>
  )
}
