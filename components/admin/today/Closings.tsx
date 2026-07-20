// Closings in the next 30 days — the runway. Each card: a relative date chip,
// the client and a deal link, the amount, and a readiness chip computed from
// the file's conditions. Soonest first. A file inside 7 days with overdue
// conditions is ALSO the top line of the exceptions block (the loudest thing
// on the page); here it reads as a danger readiness chip.

import Link from 'next/link'
import { Band, BandLink, RelativeChip } from '@/components/admin/today/ui'
import StatusChip from '@/components/admin/ds/StatusChip'
import { fmtMoneyCompact } from '@/lib/dates'
import type { ClosingRow, ReadinessTone } from '@/lib/today'

const READINESS_TONE: Record<ReadinessTone, 'green' | 'amber' | 'red' | 'gray'> = {
  success: 'green',
  warning: 'amber',
  danger: 'red',
  neutral: 'gray',
}

export default function Closings({
  rows,
  todayYMD,
  windowDays,
}: {
  rows: ClosingRow[]
  todayYMD: string
  windowDays: number
}) {
  return (
    <Band
      title={`Closings in the next ${windowDays} days`}
      action={<BandLink href="/portal/admin/underwriting">All deals</BandLink>}
    >
      {rows.length === 0 ? (
        <p className="font-ui text-sm text-muted leading-relaxed">
          No closings are scheduled in the next {windowDays} days. Dated files show here as they get
          close dates.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map(c => (
            <Link
              key={c.id}
              href={c.roomHref}
              className="rounded-[9px] border border-hairline px-3 py-2.5 hover:border-ink-navy/30 motion-safe:transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <RelativeChip targetYMD={c.closingDate} todayYMD={todayYMD} />
                <span className="font-ui text-[13px] text-ink tabular-nums">
                  {fmtMoneyCompact(c.amount)}
                </span>
              </div>
              <p className="mt-1.5 font-ui text-sm font-semibold text-ink truncate">{c.dealName}</p>
              {c.dealRef ? (
                <p className="font-ui text-[10.5px] tracking-[0.04em] text-muted-2 tabular-nums">
                  {c.dealRef}
                </p>
              ) : null}
              <div className="mt-1.5">
                <StatusChip tone={READINESS_TONE[c.readiness.tone]}>{c.readiness.label}</StatusChip>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Band>
  )
}
