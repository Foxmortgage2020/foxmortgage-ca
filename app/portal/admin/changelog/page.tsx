// Changelog — what changed, assembled from data the portal already reads:
// rate sheet approvals (new sheets in force), recent lender intel, and
// platform notes from config/changelog.ts (each build session appends
// one). Grouped by week, newest first. Offers render as a current-state
// strip because the knowledge base stores expiries, not start dates, so
// they cannot be honestly dated into weeks.

import Link from 'next/link'
import { requirePermission } from '@/lib/authz'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { PLATFORM_NOTES } from '@/config/changelog'
import {
  getAgentIdByEmail,
  getIntelItems,
  getSheetReviewEvents,
  type UwResult,
} from '@/lib/underwriting'
import PromoCountdowns from '@/components/admin/PromoCountdowns'
import { fmtDateTime, fmtShortDate } from '@/lib/dates'

export const dynamic = 'force-dynamic'

function val<T>(r: UwResult<T> | null): T | null {
  return r && r.configured && r.ok ? r.data : null
}

interface ChangeEvent {
  dateISO: string
  kind: 'sheet' | 'intel' | 'platform'
  title: string
  detail: string | null
  href: string | null
}

// Monday of the event's Toronto week, as YYYY-MM-DD.
function torontoWeekKey(dateISO: string): string {
  const d = new Date(dateISO)
  if (isNaN(d.getTime())) return 'undated'
  const ymd = d.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })
  const probe = new Date(`${ymd}T12:00:00Z`)
  const dow = probe.getUTCDay()
  const back = (dow + 6) % 7
  probe.setUTCDate(probe.getUTCDate() - back)
  return probe.toISOString().slice(0, 10)
}

export default async function ChangelogPage() {
  await requirePermission('knowledge.view')

  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  const agentId = agentRes.configured && agentRes.ok ? agentRes.data : null

  const [sheetsR, intelR] = agentId
    ? await Promise.all([getSheetReviewEvents(agentId, 100), getIntelItems(agentId)])
    : [null, null]
  const sheets = val(sheetsR) ?? []
  const intel = val(intelR) ?? []

  const events: ChangeEvent[] = [
    ...sheets.map(s => ({
      dateISO: s.decidedAt,
      kind: 'sheet' as const,
      title: `Rate sheet ${s.decision}: ${s.lenderSlugGuess ?? 'lender'} (${s.quotesTotal} quotes)`,
      detail: s.fileName,
      href: '/portal/admin/rates',
    })),
    ...intel.slice(0, 50).map(i => ({
      dateISO: i.receivedAt,
      kind: 'intel' as const,
      title: `Intel received: ${i.lenderSlugGuess ?? 'unidentified lender'} (${i.itemKind})`,
      detail: i.fileName,
      href: '/portal/admin/intel',
    })),
    ...PLATFORM_NOTES.map(n => ({
      dateISO: `${n.date}T12:00:00-04:00`,
      kind: 'platform' as const,
      title: n.title,
      detail: n.detail,
      href: null,
    })),
  ].sort((a, b) => b.dateISO.localeCompare(a.dateISO))

  const byWeek = new Map<string, ChangeEvent[]>()
  for (const e of events) {
    const key = torontoWeekKey(e.dateISO)
    if (!byWeek.has(key)) byWeek.set(key, [])
    byWeek.get(key)!.push(e)
  }
  const weeks = Array.from(byWeek.entries()).sort((a, b) => b[0].localeCompare(a[0]))

  const KIND_STYLE: Record<ChangeEvent['kind'], string> = {
    sheet: 'bg-green-100 text-green-700',
    intel: 'bg-gray-100 text-gray-600',
    platform: 'bg-navy/10 text-navy',
  }
  const KIND_LABEL: Record<ChangeEvent['kind'], string> = {
    sheet: 'rates',
    intel: 'intel',
    platform: 'platform',
  }

  return (
    <div className="max-w-4xl">
      <div>
        <h1 className="font-heading text-navy text-2xl font-bold">Changelog</h1>
        <p className="text-gray-500 font-body text-sm mt-1">
          What changed: sheets in force, intel arrivals, and platform releases, grouped by week.
        </p>
      </div>

      {!agentId && (
        <div className="mt-4 bg-white border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-sm text-gray-500 font-body">
            Workbench not available, so only platform notes render below.
          </p>
        </div>
      )}

      {/* Offers are current-state, not dated events */}
      <div className="mt-5 bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-heading text-navy font-bold text-base mb-3">Active offers right now</h2>
        <PromoCountdowns />
        <p className="text-[11px] text-gray-400 font-body mt-2">
          The knowledge base stores offer expiries, not start dates, so offers render as current
          state instead of week-dated events.
        </p>
      </div>

      <div className="mt-6 space-y-6">
        {weeks.map(([week, list]) => (
          <div key={week}>
            <h2 className="font-heading text-navy font-bold text-sm uppercase tracking-wide">
              Week of {fmtShortDate(week)}
            </h2>
            <div className="mt-2 bg-white border border-gray-200 rounded-xl divide-y divide-gray-50">
              {list.map((e, i) => (
                <div key={i} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${KIND_STYLE[e.kind]}`}>
                      {KIND_LABEL[e.kind]}
                    </span>
                    {e.href ? (
                      <Link href={e.href} className="text-sm font-body font-semibold text-navy hover:text-lime">
                        {e.title}
                      </Link>
                    ) : (
                      <span className="text-sm font-body font-semibold text-navy">{e.title}</span>
                    )}
                    <span className="text-[11px] text-gray-400 ml-auto">{fmtDateTime(e.dateISO)}</span>
                  </div>
                  {e.detail && <p className="text-xs font-body text-gray-500 mt-0.5">{e.detail}</p>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
