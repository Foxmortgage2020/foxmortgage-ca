// Design system (B3): the tab bar — hairline track, navy active state,
// Poppins labels. Tabs are links carrying the `tab` query param so state is
// shareable and redirected old paths land on the right tab. Server
// component; an optional count badge stays calm cool (a tab count is
// information, never a queued decision).

import Link from 'next/link'

export interface TabDef {
  key: string
  label: string
  href: string
  badge?: number
}

export default function TabBar({ tabs, active }: { tabs: TabDef[]; active: string }) {
  return (
    <div className="mb-5 flex flex-wrap gap-x-5 border-b border-cool-200" role="tablist">
      {tabs.map(t => (
        <Link
          key={t.key}
          href={t.href}
          role="tab"
          aria-selected={active === t.key}
          className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-0.5 pb-2 pt-1 font-heading text-[13px] motion-safe:transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-navy ${
            active === t.key
              ? 'border-navy font-semibold text-navy'
              : 'border-transparent font-medium text-cool-600 hover:text-navy'
          }`}
        >
          {t.label}
          {typeof t.badge === 'number' && t.badge > 0 && (
            <span className="rounded-full bg-cool-100 px-1.5 py-0.5 text-[10px] font-semibold text-cool-700 tabular-nums">
              {t.badge}
            </span>
          )}
        </Link>
      ))}
    </div>
  )
}
