// The Deals list (B2b, Direction 2) — the daily driver. Server component:
// rows arrive pre-built, pre-sorted, single-lime pre-assigned by
// lib/deals-surface.ts. Poppins carries the phase spine numerals and column
// headers; Montserrat carries the rows; money, refs, and dates render with
// tabular numerals so the columns scan vertically.
//
// THE LIME LAW: exactly one lime button on this list (rows[i].lime, set
// mechanically upstream, tested). Every other routed action is the outline
// button; a manual action with no route is the `manual` chip plus quiet
// text — never a decorative button.

import Link from 'next/link'
import type { DealRow } from '@/lib/deals-surface'
import { actionHref, phaseCounts } from '@/lib/deals-surface'
import { fmtMoneyCompact, fmtShortDate } from '@/lib/dates'
import SummaryStrip from '@/components/admin/ds/SummaryStrip'
import {
  CELL_DATE,
  CELL_MONEY,
  CELL_REF,
  TABLE_CARD,
  TABLE_HEADER_ROW,
  TABLE_ROW,
} from '@/components/admin/ds/table'

function closesSub(days: number | null): string | null {
  if (days === null) return null
  if (days === 0) return 'today'
  if (days > 0) return `in ${days} ${days === 1 ? 'day' : 'days'}`
  return `${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} ago`
}

function ManualChip() {
  return (
    <span className="shrink-0 rounded bg-cool-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.05em] text-cool-600">
      manual
    </span>
  )
}

function ActionCell({ row }: { row: DealRow }) {
  if (row.funded) {
    return (
      <Link
        href="/portal/admin/beyond?tab=renewals"
        className="font-ui text-[13px] text-cool-500 underline decoration-cool-300 underline-offset-4 hover:text-navy"
      >
        Moves to renewals
      </Link>
    )
  }
  const a = row.action
  if (!a) return <span className="font-ui text-[13px] text-cool-500">Open the file</span>
  const href = actionHref(row.roomId, a)
  if (!href) {
    // By-hand work with no route yet: chip plus quiet text, the note on
    // hover and beneath at phone width — never a decorative button.
    return (
      <span className="inline-flex flex-wrap items-center justify-end gap-2" title={a.note}>
        <ManualChip />
        <span className="font-ui text-[13px] text-cool-600">{a.label}</span>
      </span>
    )
  }
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
      {a.manual && <ManualChip />}
      <Link
        href={href}
        title={a.note}
        className={
          row.lime
            ? 'rounded-md border border-decision bg-decision px-3 py-1.5 font-ui text-[13px] font-bold text-decision-ink hover:opacity-90 whitespace-nowrap'
            : 'rounded-md border border-cool-300 bg-white px-3 py-1.5 font-ui text-[13px] font-semibold text-navy hover:border-navy whitespace-nowrap'
        }
      >
        {a.label}
      </Link>
    </span>
  )
}

// The phase spine is the design system's summary strip (extracted in B3).
function PhaseStrip({ rows }: { rows: DealRow[] }) {
  return (
    <SummaryStrip
      tiles={phaseCounts(rows).map(t => ({ key: t.key, label: t.label, value: String(t.count) }))}
    />
  )
}

const GRID = 'grid grid-cols-[170px_115px_1fr_110px_95px_255px] items-center gap-x-3'

export default function DealsList({ rows }: { rows: DealRow[] }) {
  return (
    <div>
      <PhaseStrip rows={rows} />

      {/* Desktop table */}
      <div className={TABLE_CARD}>
        <div className={`${GRID} ${TABLE_HEADER_ROW}`}>
          <div>Client</div>
          <div>Phase</div>
          <div>Where it is</div>
          <div>Closes</div>
          <div className="text-right">Amount</div>
          <div className="text-right">Next action</div>
        </div>
        {rows.length === 0 && (
          <p className="border-t border-cool-100 px-5 py-4 font-ui text-sm text-cool-600">
            No live files right now.
          </p>
        )}
        {rows.map(r => (
          <div
            key={r.roomId}
            className={`${GRID} ${TABLE_ROW} ${r.funded ? 'opacity-60' : ''}`}
            data-testid={`deal-row-${r.fileRef}`}
          >
            <div className="min-w-0">
              <Link
                href={`/portal/admin/deals/${r.roomId}`}
                className="block truncate font-ui text-[14.5px] font-semibold text-navy hover:underline"
              >
                {r.client}
              </Link>
              <p className={`mt-0.5 ${CELL_REF}`}>
                <Link href={`/portal/admin/deals/${r.roomId}`} className="hover:text-navy hover:underline">
                  {r.fileRef}
                </Link>
                {r.positionFromRoom && (
                  <span
                    className="ml-1.5 text-cool-500"
                    title="No linked Zoho stage could be read, so this row sits where the workbench room's own stage puts it."
                  >
                    · from the room
                  </span>
                )}
              </p>
            </div>
            <div>
              {r.unmapped ? (
                <span className="rounded bg-caution-bg px-1.5 py-0.5 font-ui text-[11px] font-semibold text-caution">
                  Phase not mapped
                </span>
              ) : (
                <span className="font-ui text-[13px] font-semibold text-navy">{r.phaseLabel}</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate font-ui text-[14px] font-medium text-cool-800">
                {r.unmapped ? `Stage "${r.rawStage ?? 'none'}" is unmapped` : r.where}
              </p>
              {r.conditionsLine && (
                <p className="mt-0.5 font-ui text-[11px] text-cool-600 tabular-nums">{r.conditionsLine}</p>
              )}
            </div>
            <div>
              <p
                className={`${CELL_DATE} ${
                  !r.funded && r.closingAmber ? 'font-semibold text-caution' : 'text-cool-800'
                }`}
              >
                {r.closing ? fmtShortDate(r.closing) : 'none set'}
              </p>
              {closesSub(r.closeDays) && (
                <p
                  className={`mt-0.5 font-ui text-[11px] tabular-nums ${
                    !r.funded && r.closingAmber ? 'text-caution' : 'text-cool-500'
                  }`}
                >
                  {closesSub(r.closeDays)}
                </p>
              )}
            </div>
            <div className={`text-right ${CELL_MONEY}`}>
              {r.amount !== null ? fmtMoneyCompact(r.amount) : '—'}
            </div>
            <div className="flex justify-end">
              <ActionCell row={r} />
            </div>
          </div>
        ))}
      </div>

      {/* Phone: rows become cards (the direction's phone pass). */}
      <div className="space-y-2.5 md:hidden">
        {rows.length === 0 && (
          <p className="rounded-[10px] border border-cool-200 bg-white px-4 py-3 font-ui text-sm text-cool-600">
            No live files right now.
          </p>
        )}
        {rows.map(r => {
          const a = !r.funded ? r.action : null
          const href = a ? actionHref(r.roomId, a) : null
          return (
            <div
              key={r.roomId}
              className={`rounded-[10px] border border-cool-200 bg-white p-3.5 ${r.funded ? 'opacity-60' : ''}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <Link
                  href={`/portal/admin/deals/${r.roomId}`}
                  className="min-w-0 truncate font-ui text-[15px] font-semibold text-navy"
                >
                  {r.client}
                </Link>
                <span className={`shrink-0 ${CELL_MONEY}`}>
                  {r.amount !== null ? fmtMoneyCompact(r.amount) : '—'}
                </span>
              </div>
              <p className="mt-0.5 font-ui text-[10px] tracking-[0.04em] text-cool-500 tabular-nums">
                <Link href={`/portal/admin/deals/${r.roomId}`} className="hover:text-navy hover:underline">
                  {r.fileRef}
                </Link>
              </p>
              <p className="mt-2.5 font-ui text-[14px] font-medium text-cool-800">
                {r.unmapped ? `Stage "${r.rawStage ?? 'none'}" is unmapped` : r.where}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-ui text-xs font-semibold text-cool-700">{r.phaseLabel}</span>
                <span
                  className={`ml-auto font-ui text-[11.5px] tabular-nums ${
                    !r.funded && r.closingAmber ? 'font-semibold text-caution' : 'text-cool-600'
                  }`}
                >
                  {r.closing ? `closes ${fmtShortDate(r.closing)}` : 'no close date'}
                </span>
              </div>
              {r.funded ? (
                <Link
                  href="/portal/admin/beyond?tab=renewals"
                  className="mt-3 block font-ui text-[12.5px] text-cool-500 underline decoration-cool-300 underline-offset-4"
                >
                  Moves to renewals
                </Link>
              ) : a && href ? (
                <div className="mt-3 flex items-stretch gap-2">
                  <Link
                    href={href}
                    className={`flex min-h-[44px] flex-1 items-center justify-center rounded-lg px-3 py-2 text-center font-ui text-[14px] leading-tight ${
                      r.lime
                        ? 'border border-decision bg-decision font-bold text-decision-ink'
                        : 'border border-cool-300 bg-white font-semibold text-navy'
                    }`}
                  >
                    {a.label}
                  </Link>
                  {a.manual && (
                    <span className="flex items-center rounded-lg border border-dashed border-cool-300 px-2.5 text-[10px] font-semibold tracking-[0.05em] text-cool-600">
                      manual
                    </span>
                  )}
                </div>
              ) : a ? (
                <div className="mt-3">
                  <span className="inline-flex items-center gap-2">
                    <ManualChip />
                    <span className="font-ui text-[12.5px] text-cool-600">{a.label}</span>
                  </span>
                  {a.note && <p className="mt-1 font-ui text-[11px] text-cool-500">{a.note}</p>}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
