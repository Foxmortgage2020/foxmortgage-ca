'use client'

// The Deals page header + List/Board toggle (B2b). The toggle persists per
// user in localStorage keyed by the Clerk user id — demo-safe by
// construction (no store, no fetch, nothing real read or written). Both
// views arrive server-rendered as props; this component only chooses which
// one shows. List is the default and the SSR shape, so first paint always
// matches the server.

import { useEffect, useState } from 'react'

type ViewKey = 'list' | 'board'

export default function DealsView({
  userKey,
  title,
  countLine,
  list,
  board,
}: {
  userKey: string
  title: string
  countLine: string
  list: React.ReactNode
  board: React.ReactNode
}) {
  const storageKey = `fox_deals_view_v1:${userKey}`
  const [view, setView] = useState<ViewKey>('list')

  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey) === 'board') setView('board')
    } catch {}
  }, [storageKey])

  const choose = (v: ViewKey) => {
    setView(v)
    try {
      localStorage.setItem(storageKey, v)
    } catch {}
  }

  const toggleBtn = (v: ViewKey, label: string) => (
    <button
      type="button"
      onClick={() => choose(v)}
      aria-pressed={view === v}
      className={`px-4 py-1.5 text-[13px] font-heading font-semibold motion-safe:transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-navy ${
        view === v ? 'bg-navy text-white' : 'bg-white text-cool-700 hover:text-navy'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-navy text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1 font-ui text-[13px] text-cool-700 tabular-nums">{countLine}</p>
        </div>
        <div className="flex overflow-hidden rounded-[7px] border border-cool-250" role="group" aria-label="View">
          {toggleBtn('list', 'List')}
          {toggleBtn('board', 'Board')}
        </div>
      </div>
      {view === 'list' ? list : board}
    </div>
  )
}
