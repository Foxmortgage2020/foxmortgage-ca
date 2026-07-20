// What's moving — the single lifecycle table, every active file grouped by
// phase (closing-date order within a group), with a plain-words next step, a
// relative close chip, the amount, and the stage. Every file links to its
// deal room. This replaces both the old compact-pipeline table and the
// duplicate pipeline-by-stage census.

import Link from 'next/link'
import { Band, BandLink, RelativeChip } from '@/components/admin/today/ui'
import { nextStepForStage } from '@/lib/desk'
import { parseDealRef } from '@/lib/today'
import { fmtMoneyCompact } from '@/lib/dates'
import type { SlimDeal } from '@/lib/zoho-admin'
import type { WorkbenchDeal } from '@/lib/underwriting'

type Group = { key: string; label: string; items: SlimDeal[] }

export default function WhatsMoving({
  groups,
  wbByZohoId,
  todayYMD,
  activeCount,
  activeVolume,
}: {
  groups: Group[]
  wbByZohoId: Map<string, WorkbenchDeal>
  todayYMD: string
  activeCount: number
  activeVolume: number
}) {
  const sub =
    activeCount > 0
      ? `${activeCount} active ${activeCount === 1 ? 'file' : 'files'} · ${fmtMoneyCompact(activeVolume)}`
      : undefined

  return (
    <Band
      title="What's moving"
      sub={sub}
      action={<BandLink href="/portal/admin/underwriting">All deals</BandLink>}
    >
      {groups.length === 0 ? (
        <p className="font-ui text-sm text-muted leading-relaxed">
          No active files are in the pipeline right now. New deals show here as they come in.
        </p>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm font-ui">
            <thead>
              <tr className="text-left text-[10px] text-muted uppercase tracking-wide">
                <th className="py-1.5 px-1 font-semibold">Client</th>
                <th className="py-1.5 px-1 font-semibold">Next step</th>
                <th className="py-1.5 px-1 font-semibold">Closes</th>
                <th className="py-1.5 px-1 font-semibold text-right">Amount</th>
                <th className="py-1.5 px-1 font-semibold">Stage</th>
              </tr>
            </thead>
            {groups.map(group => (
              <tbody key={group.key}>
                <tr>
                  <td colSpan={5} className="pt-3 pb-1 px-1">
                    <span
                      className={`font-ui text-[10px] font-bold uppercase tracking-[1.4px] ${
                        group.key === 'unmapped' ? 'text-caution' : 'text-ink-navy'
                      }`}
                    >
                      {group.label}
                    </span>
                  </td>
                </tr>
                {group.items.map(d => {
                  const wb = wbByZohoId.get(d.id) ?? null
                  const ref = wb?.fileRef ?? parseDealRef(d.dealName)
                  const room = wb
                    ? `/portal/admin/deals/${wb.id}`
                    : '/portal/admin/underwriting#not-yet-bridged'
                  return (
                    <tr key={d.id} className="border-t border-hairline hover:bg-fog">
                      <td className="py-2.5 px-1 max-w-[240px]">
                        <Link href={room} className="text-ink font-medium hover:text-ink-navy block truncate">
                          {d.dealName}
                        </Link>
                        {ref ? (
                          <span className="font-ui text-[10.5px] tracking-[0.04em] text-muted-2 tabular-nums">
                            {ref}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2.5 px-1 text-muted">{nextStepForStage(d.stage)}</td>
                      <td className="py-2.5 px-1">
                        {d.closingDate ? (
                          <RelativeChip targetYMD={d.closingDate} todayYMD={todayYMD} />
                        ) : (
                          <span className="text-muted-2 text-[12px]">not set</span>
                        )}
                      </td>
                      <td className="py-2.5 px-1 text-right text-ink tabular-nums">
                        {fmtMoneyCompact(d.amount)}
                      </td>
                      <td className="py-2.5 px-1">
                        <span className="inline-block rounded-full bg-fog px-2 py-0.5 text-[11px] font-semibold text-muted">
                          {d.stage}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </Band>
  )
}
