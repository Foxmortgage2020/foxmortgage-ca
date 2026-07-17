// The step list inside a phase section (B2b): the phase's steps in plain
// words, the current one carrying the ink "now" pill. Manual and planned
// steps stay gray with their one-sentence note (the dashboard doubles as
// the SOP). Server component, display only, never lime.

import type { JourneyStep } from '@/config/lifecycle'

export default function StepList({
  steps,
  amberKeys = [],
}: {
  steps: JourneyStep[]
  // Steps to render amber (the compliance loop states, Task 6).
  amberKeys?: string[]
}) {
  if (steps.length === 0) return null
  return (
    <div className="mb-4">
      {steps.map(s => {
        const amber = amberKeys.includes(s.key)
        const pending = s.state !== 'done' && s.status !== 'live'
        return (
          <div
            key={s.key}
            className="flex items-center gap-2.5 border-t border-cool-100 py-2 first:border-t-0"
          >
            <span
              aria-hidden
              className={`w-4 text-center font-ui text-xs ${
                s.state === 'done' ? 'text-navy' : amber ? 'text-caution' : 'text-cool-400'
              }`}
            >
              {s.state === 'done' ? '✓' : pending ? '◦' : '○'}
            </span>
            <span
              title={pending && s.note ? s.note : undefined}
              className={`font-ui text-[13.5px] ${
                amber
                  ? 'font-semibold text-caution'
                  : s.state === 'current'
                    ? 'font-semibold text-navy'
                    : s.state === 'done'
                      ? 'text-cool-700'
                      : `text-cool-500${pending && s.note ? ' cursor-help' : ''}`
              }`}
            >
              {s.label}
            </span>
            {s.state === 'current' && (
              <span className="rounded bg-navy px-1.5 py-0.5 text-[10px] font-bold tracking-[0.05em] text-white">
                now
              </span>
            )}
            {s.status === 'planned' && (
              <span className="rounded bg-cool-100 px-1.5 py-0.5 text-[10px] font-semibold text-cool-500">
                coming
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
