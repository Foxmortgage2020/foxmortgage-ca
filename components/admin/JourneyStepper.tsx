// The journey stepper (Brief B1, Task 4) — the five lifecycle phases as one
// compact row, with the current phase's steps in plain words underneath.
// Display only, server rendered, zero reads: everything comes from the pure
// journey model in config/lifecycle.ts over props the page already holds.
//
// Tone rules (Phase A): past phases carry a muted check, the current phase
// is ink-navy emphasis, future phases are gray. NEVER lime — the stepper
// states where a file is, it never queues a decision. Manual and planned
// steps render gray with a small marker; the title carries the one-sentence
// note (manual = the SOP line, planned = what is coming and what it waits
// on). An unmapped stage renders the loud amber state, never a guess.

import Link from 'next/link'
import { journeyForStage, type StepShape } from '@/config/lifecycle'

export default function JourneyStepper({
  stage,
  shape,
  space,
}: {
  stage: string | null
  shape: StepShape
  // The stage vocabulary the caller speaks: a workbench room passes 'room',
  // a Zoho-read surface passes 'display' (the two collide on 'submitted').
  space: 'display' | 'room'
}) {
  const journey = journeyForStage({ stage, shape, space })

  if (!journey.mapped) {
    return (
      <div
        className="rounded bg-caution-bg border border-caution/40 px-2.5 py-1.5"
        data-testid="journey-unmapped"
      >
        <p className="font-ui text-xs text-caution">
          Stage {journey.rawStage ? `"${journey.rawStage}"` : '(none)'} maps to no lifecycle
          phase yet.
        </p>
      </div>
    )
  }

  return (
    <div className="font-ui" data-testid="journey-stepper">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {journey.phases.map((p, i) => (
          <li key={p.key} className="flex items-center gap-x-2">
            {i > 0 && <span aria-hidden className="hidden sm:block h-px w-3 bg-hairline" />}
            <span
              title={p.description}
              className={
                p.state === 'current'
                  ? 'text-xs font-semibold text-ink-navy'
                  : 'text-xs text-muted-2'
              }
            >
              {p.state === 'done' && <span aria-hidden>✓ </span>}
              {p.state === 'current' && (
                <span
                  aria-hidden
                  className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-ink-navy align-middle"
                />
              )}
              {p.label}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-[11px]">
        {journey.steps.map(s => {
          const pending = s.state !== 'done' && s.status !== 'live'
          return (
            <span
              key={s.key}
              title={pending ? s.note : undefined}
              className={
                s.state === 'current'
                  ? 'font-medium text-ink'
                  : `text-muted-2${pending && s.note ? ' cursor-help' : ''}`
              }
            >
              {s.state === 'done' && <span aria-hidden>✓ </span>}
              {pending && <span aria-hidden>◦ </span>}
              {s.label}
            </span>
          )
        })}
        {journey.currentPhase === 'beyond_funding' && (
          <Link
            href="/portal/admin/renewals"
            className="font-semibold text-ink underline decoration-hairline decoration-2 underline-offset-4 hover:decoration-ink-navy"
          >
            Open renewals
          </Link>
        )}
      </p>
    </div>
  )
}
