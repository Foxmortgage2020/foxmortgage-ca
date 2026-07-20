// Shared chrome for the Today bands. A Band is the standard white card with a
// heading and an optional right-side link; RelativeChip renders a relative-date
// pill with urgency tint. NO lime/decision token here (date urgency and status
// are never a queued decision — the audit walks this file).

import Link from 'next/link'
import StatusChip from '@/components/admin/ds/StatusChip'
import { relativeDay } from '@/lib/dates'
import { relativeChipTone } from '@/lib/today'

export function Band({
  title,
  sub,
  action,
  children,
}: {
  title: string
  sub?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-[10px] bg-white border border-hairline shadow-card p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="font-heading text-ink font-bold text-base leading-tight">{title}</h2>
          {sub ? <p className="mt-0.5 font-ui text-xs text-muted">{sub}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  )
}

export function BandLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="font-ui text-xs font-semibold text-ink hover:text-ink-navy underline decoration-hairline underline-offset-4 hover:decoration-ink-navy"
    >
      {children}
    </Link>
  )
}

export function EmptyBand({ children }: { children: React.ReactNode }) {
  return <p className="font-ui text-sm text-muted leading-relaxed">{children}</p>
}

// A relative-date chip ("due today", "5 days overdue", "in 3 days"), tinted by
// urgency. `verb` picks the framing: 'due' (deadlines) or 'plain' (events).
export function RelativeChip({
  targetYMD,
  todayYMD,
  verb = 'plain',
  soonDays,
}: {
  targetYMD: string
  todayYMD: string
  verb?: 'due' | 'plain'
  soonDays?: number
}) {
  const rel = relativeDay(targetYMD, todayYMD, soonDays)
  return (
    <StatusChip tone={relativeChipTone(rel.tone)}>
      {verb === 'due' ? rel.dueLabel : rel.label}
    </StatusChip>
  )
}
