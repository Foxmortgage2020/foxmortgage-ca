// The flag strip (handoff 42).
//
// A flag exists to INTERRUPT, so it sits under the header and is visible from
// every tab. It is deliberately NOT a tab: a tab would hide the interruption
// behind a click, from the seven places it matters.
//
// THERE IS NO FLAG TABLE IN THE REC SCHEMA TODAY. Verified live rather than
// assumed — rec carries deals, deal_clients, deal_stages, phases, conditions,
// card_tags, milestone_types, deal_milestones, phase_returns, attract_sources,
// consents, clients, mortgages, properties, deal_properties and lenders, and
// nothing flag-shaped. So this strip is built and renders nothing, rather than
// being omitted: the day a mechanism lands, there is already a place for it,
// and until then the page does not pretend the concept is missing.
//
// It renders NOTHING when there are no flags — an empty amber bar on every
// file would train the eye to ignore the one colour that must never be ignored.

import type { FlagLike } from '@/lib/beta-file'

export default function FileFlagStrip({ flags }: { flags: FlagLike[] }) {
  if (flags.length === 0) return null
  return (
    <div data-testid="beta-file-flags" className="mt-3 space-y-2">
      {flags.map(f => (
        <div
          key={f.id}
          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-ui text-amber-900"
        >
          {f.severity && (
            <span className="mr-2 rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
              {f.severity}
            </span>
          )}
          {f.label}
        </div>
      ))}
    </div>
  )
}
