'use client'

// Sticky section nav for the deal room (Phase B2). Anchor links to the five
// spine sections, with the in-view section highlighted via IntersectionObserver.
// Presentation only — no data, no decisions; the calm-machine navy is the
// active token (lime stays reserved for queued human actions elsewhere).

import { useEffect, useState } from 'react'

export interface RoomSection {
  id: string
  label: string
}

export default function RoomSectionNav({ sections }: { sections: RoomSection[] }) {
  const [active, setActive] = useState<string>(sections[0]?.id ?? '')

  useEffect(() => {
    const els = sections
      .map(s => document.getElementById(s.id))
      .filter((e): e is HTMLElement => e !== null)
    if (els.length === 0) return
    const observer = new IntersectionObserver(
      entries => {
        // The topmost section currently intersecting wins.
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-96px 0px -55% 0px', threshold: 0 },
    )
    for (const el of els) observer.observe(el)
    return () => observer.disconnect()
  }, [sections])

  return (
    <nav
      aria-label="Deal room sections"
      className="sticky top-2 z-10 -mx-1 mb-4 flex flex-wrap gap-1 rounded-xl border border-hairline bg-white/90 px-1.5 py-1.5 shadow-card backdrop-blur"
    >
      {sections.map(s => {
        const isActive = active === s.id
        return (
          <a
            key={s.id}
            href={`#${s.id}`}
            onClick={() => setActive(s.id)}
            aria-current={isActive ? 'true' : undefined}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold font-ui transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-navy ${
              isActive ? 'bg-ink-navy text-white' : 'text-muted hover:bg-fog hover:text-ink'
            }`}
          >
            {s.label}
          </a>
        )
      })}
    </nav>
  )
}
