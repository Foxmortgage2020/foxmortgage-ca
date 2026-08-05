// The file page's tab row (handoff 42).
//
// EIGHT TABS ON EVERY FILE, ALWAYS, IN THE ORDER lib/beta-file.ts declares.
// The row reads left to right as the file's life — Overview, Client, Documents,
// Qualification, Submission, Commitment, Conditions, Compliance — so the row
// itself teaches the process to a broker who has never run a deal. A tab is
// never hidden for having no data behind it: a missing tab teaches nothing, and
// a row that changes shape from file to file is its own confusion.
//
// A SERVER COMPONENT. Selection rides `?tab=` through links, the same mechanism
// the board already uses for phase, view, collapse and preview, so the file page
// costs no client JavaScript to navigate.

// BADGES. A queued decision must be visible without opening the tab it lives
// on, so the count rides the tab itself. Amber, matching the deal room's
// pending banner off the same upload — lime is not spent here.

import Link from 'next/link'
import { FILE_TABS, type TabBadges, type TabKey } from '@/lib/beta-file'
import { phaseAccent } from '@/lib/phase-palette'

export default function FileTabs({
  active,
  hrefFor,
  phaseCode,
  badges = {},
}: {
  active: TabKey
  hrefFor: (tab: TabKey) => string
  phaseCode: string | null
  badges?: TabBadges
}) {
  const accent = phaseCode ? phaseAccent(phaseCode) : undefined
  return (
    <nav
      aria-label="File sections"
      data-testid="beta-file-tabs"
      className="-mx-4 overflow-x-auto border-b border-cool-200 px-4 sm:mx-0 sm:px-0"
    >
      <ul className="flex min-w-max gap-1">
        {FILE_TABS.map(t => {
          const on = t.key === active
          const badge = badges[t.key]
          return (
            <li key={t.key}>
              <Link
                href={hrefFor(t.key)}
                scroll={false}
                aria-current={on ? 'page' : undefined}
                data-testid={`beta-file-tab-${t.key}`}
                className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-ui transition-colors ${
                  on
                    ? 'font-semibold text-navy'
                    : 'border-transparent text-cool-600 hover:border-cool-300 hover:text-navy'
                }`}
                style={on ? { borderBottomColor: accent ?? '#032133' } : undefined}
              >
                {t.label}
                {badge && (
                  <span
                    data-testid={`beta-file-badge-${t.key}`}
                    aria-label={badge.label}
                    title={badge.label}
                    className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold tabular-nums text-amber-800"
                  >
                    {badge.count}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
