// The exceptions block — the one at-risk region. Danger-tinted when anything
// red is present, caution otherwise. The healthy-sync success line renders
// quietly at the bottom of the Waiting-on-you region when nothing is stalled.
// No lime here: at-risk is not a queued decision.

import Link from 'next/link'
import type { Exceptions as ExceptionsData } from '@/lib/today'

const FRAME: Record<'danger' | 'caution', string> = {
  danger: 'border-red-200 bg-red-50',
  caution: 'border-amber-200 bg-amber-50',
}
const DOT: Record<'danger' | 'caution', string> = {
  danger: 'bg-red-500',
  caution: 'bg-amber-500',
}
const LINE_TEXT: Record<'danger' | 'caution', string> = {
  danger: 'text-red-800',
  caution: 'text-amber-900',
}

export default function Exceptions({
  exceptions,
  syncHealthy,
}: {
  exceptions: ExceptionsData | null
  syncHealthy: { hoursAgo: number } | null
}) {
  if (!exceptions && !syncHealthy) return null
  return (
    <div className="space-y-2">
      {exceptions ? (
        <div className={`rounded-[10px] border px-4 py-3 ${FRAME[exceptions.tone]}`}>
          <p className="font-ui text-[10px] font-bold uppercase tracking-[1.6px] text-ink/50">
            Needs a look
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {exceptions.lines.map(line => (
              <li key={line.key} className="flex items-start gap-2">
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${DOT[line.tone]}`} />
                <Link
                  href={line.href}
                  className={`font-ui text-[13.5px] leading-snug ${LINE_TEXT[line.tone]} hover:underline underline-offset-2`}
                >
                  {line.text}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {syncHealthy ? (
        <p className="flex items-center gap-2 font-ui text-[12px] text-green-700">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          Workbench sync healthy, last intake {Math.round(syncHealthy.hoursAgo)}h ago.
        </p>
      ) : null}
    </div>
  )
}
