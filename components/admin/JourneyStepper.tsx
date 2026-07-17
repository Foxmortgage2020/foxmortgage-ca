// The journey stepper (B1, restyled by B2b Direction 2) — the five
// lifecycle phases as connected nodes: past phases checked, the current
// phase a navy-filled numbered node with the step caption beneath, future
// phases numbered outline. Display only, server rendered, zero reads:
// everything comes from the pure journey model in config/lifecycle.ts over
// props the page already holds.
//
// Tone rules (Phase A): NEVER lime — the stepper states where a file is, it
// never queues a decision. An unmapped stage renders the loud amber state,
// never a guess. The current phase's STEP LIST now lives in the room's
// phase sections (B2b), not here.

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

  const last = journey.phases.length - 1

  return (
    <div className="overflow-x-auto" data-testid="journey-stepper">
      <ol className="flex min-w-[560px] font-ui">
        {journey.phases.map((p, i) => {
          const node =
            p.state === 'done'
              ? 'border border-navy bg-white text-navy'
              : p.state === 'current'
                ? 'bg-navy text-white'
                : 'border border-cool-300 bg-white text-cool-500'
          return (
            <li key={p.key} className="flex flex-1 flex-col items-center">
              <div className="flex w-full items-center">
                <div className={`h-0.5 flex-1 ${i === 0 ? 'bg-transparent' : 'bg-cool-250'}`} />
                <div
                  title={p.description}
                  className={`mx-1.5 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md text-xs font-semibold tabular-nums ${node}`}
                >
                  {p.state === 'done' ? '✓' : i + 1}
                </div>
                <div className={`h-0.5 flex-1 ${i === last ? 'bg-transparent' : 'bg-cool-250'}`} />
              </div>
              <p
                className={`mt-2 text-center font-heading text-[12px] leading-tight ${
                  p.state === 'current'
                    ? 'font-semibold text-navy'
                    : p.state === 'done'
                      ? 'font-medium text-cool-700'
                      : 'text-cool-500'
                }`}
              >
                {p.label}
              </p>
              {p.state === 'current' && journey.caption && (
                <p className="mt-0.5 px-1 text-center text-[11px] leading-tight text-cool-600">
                  {journey.caption}
                </p>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
