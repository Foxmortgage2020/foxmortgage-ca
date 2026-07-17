// The Deals board (B2b, Direction 2) — four phase columns with navy header
// bars, the same rows the list reads (one B2a position source; this session
// moves nothing). Server component, presentation only.
//
// The two planned placeholders (Application chase, Pre-approved and
// shopping) render as dashed quiet cards at the bottom of Intake, each with
// its one-line what-it-waits-on note straight from config/lifecycle.ts —
// missing CAPABILITY, gray, never lime, never a fake card.

import Link from 'next/link'
import type { DealRow } from '@/lib/deals-surface'
import { boardPhaseColumns } from '@/lib/deals-surface'
import { PHASE_STEPS } from '@/config/lifecycle'
import { DAYS_IDLE_AMBER } from '@/lib/underwriting-bridge'
import { fmtMoneyCompact, fmtShortDate } from '@/lib/dates'
import NavyBar from '@/components/admin/ds/NavyBar'

function closesLine(row: DealRow): string {
  if (!row.closing) return 'no close date'
  const d = row.closeDays
  if (d === null) return `closes ${fmtShortDate(row.closing)}`
  if (d === 0) return 'closes today'
  if (d > 0) return `closes ${fmtShortDate(row.closing)} · in ${d} ${d === 1 ? 'day' : 'days'}`
  return `closed ${Math.abs(d)} ${Math.abs(d) === 1 ? 'day' : 'days'} ago`
}

// The two planned capability placeholders, notes sourced from the one
// lifecycle definition (never restated copy).
function plannedPlaceholders(): { label: string; note: string }[] {
  const chase = PHASE_STEPS.intake.unknown.find(s => s.key === 'application_chase')
  const shopping = PHASE_STEPS.underwriting.purchase.find(s => s.key === 'shopping')
  return [chase, shopping]
    .filter((s): s is NonNullable<typeof s> => Boolean(s))
    .map(s => ({ label: s.label, note: s.note ?? '' }))
}

export default function DealsBoard({ rows }: { rows: DealRow[] }) {
  const columns = boardPhaseColumns(rows)
  const unmapped = rows.filter(r => r.unmapped)
  const placeholders = plannedPlaceholders()

  return (
    <div>
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {columns.map(col => (
          <div key={col.key} className="flex min-w-0 flex-col">
            {/* The design system's navy section header (extracted in B3). */}
            <NavyBar rounded="top" label={col.label} right={col.rows.length} />
            <div className="flex flex-col gap-2.5 rounded-b-lg border border-t-0 border-cool-200 bg-cool-50 p-3">
              {col.rows.length === 0 && placeholders.length === 0 && (
                <p className="px-1 py-1 font-ui text-xs text-cool-500">Empty.</p>
              )}
              {col.rows.map(r => (
                <Link
                  key={r.roomId}
                  href={`/portal/admin/deals/${r.roomId}`}
                  className={`block rounded-lg border border-cool-200 bg-white p-3.5 shadow-[0_1px_2px_rgba(3,33,51,0.04)] hover:border-navy/30 motion-safe:transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-navy ${
                    r.funded ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate font-ui text-[14px] font-semibold text-navy">
                      {r.client}
                    </span>
                    <span className="shrink-0 font-ui text-[13px] font-semibold text-navy tabular-nums">
                      {r.amount !== null ? fmtMoneyCompact(r.amount) : '—'}
                    </span>
                  </div>
                  <p className="mt-0.5 font-ui text-[10.5px] tracking-[0.04em] text-cool-500 tabular-nums">
                    {r.fileRef}
                  </p>
                  <span className="mt-2.5 inline-block rounded-[5px] bg-cool-100 px-2 py-1 font-ui text-xs font-medium text-cool-800">
                    {r.where}
                  </span>
                  {r.conditionsLine && (
                    <p className="mt-1.5 font-ui text-[11px] text-cool-600 tabular-nums">{r.conditionsLine}</p>
                  )}
                  <p
                    className={`mt-2.5 font-ui text-xs tabular-nums ${
                      !r.funded && r.closingAmber ? 'font-semibold text-caution' : 'text-cool-600'
                    }`}
                  >
                    {closesLine(r)}
                    {r.idleDays >= DAYS_IDLE_AMBER && (
                      <span
                        className="ml-1.5 text-caution"
                        title="Days since last movement on the room (no per-state history exists yet)"
                      >
                        · {r.idleDays}d idle
                      </span>
                    )}
                  </p>
                  {r.positionFromRoom && (
                    <p
                      className="mt-1.5 font-ui text-[10px] text-cool-500"
                      title="No linked Zoho stage could be read, so this card sits where the workbench room's own stage puts it."
                    >
                      position from the room, not Zoho
                    </p>
                  )}
                </Link>
              ))}
              {col.key === 'intake' &&
                placeholders.map(p => (
                  <div key={p.label} className="rounded-lg border border-dashed border-cool-300 px-3.5 py-3">
                    <p className="font-ui text-xs font-semibold text-cool-700">{p.label} is coming</p>
                    <p className="mt-1 font-ui text-[11.5px] leading-relaxed text-cool-500">{p.note}</p>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
      {unmapped.length > 0 && (
        <div className="mt-4 rounded-lg border border-caution/40 bg-caution-bg px-3.5 py-2.5">
          <p className="font-ui text-xs font-semibold text-caution">
            {unmapped.length} {unmapped.length === 1 ? 'file maps' : 'files map'} to no phase
          </p>
          <ul className="mt-1 space-y-0.5">
            {unmapped.map(r => (
              <li key={r.roomId} className="font-ui text-xs text-caution">
                <Link href={`/portal/admin/deals/${r.roomId}`} className="underline">
                  {r.fileRef}
                </Link>{' '}
                · stage &quot;{r.rawStage ?? 'none'}&quot;
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
