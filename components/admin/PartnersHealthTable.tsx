'use client'

// Partners health table (Session 7). The server page computes every
// signal (referral stats, tiers, Clerk engagement) and passes plain rows
// already ranked for Monday attention; this component only filters and
// renders. Estimated revenue figures carry the est chip so a modeled
// dollar never reads as an actual.

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import type { PartnerTier } from '@/config/partner-tiers'
import StatusChip, { type ChipTone } from '@/components/admin/ds/StatusChip'

export interface PartnerHealthRowView {
  id: string
  name: string | null
  email: string | null
  partnerType: string | null
  documentCount: number
  tier: PartnerTier | null
  lastReferral: string | null
  referralsT12: number
  referralsTotal: number
  fundedCount: number
  fundedVolume: number
  conversionPct: number | null
  revenueActual: number
  revenueModeled: number
  // null = the Clerk read failed (say "not read"); hasAccount false =
  // read worked, no portal account exists.
  hasAccount: boolean | null
  lastSignInAt: number | null
}

type FilterKey = 'all' | 'referral' | 'investor'

const TIER_CHIP: Record<PartnerTier, { label: string; tone: ChipTone }> = {
  active: { label: 'Active', tone: 'green' },
  cooling: { label: 'Cooling', tone: 'amber' },
  dormant: { label: 'Dormant', tone: 'gray' },
}

function fmtCompact(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${Math.round(abs / 1_000)}K`
  return `$${Math.round(abs)}`
}

function fmtShort(ymd: string | null): string {
  if (!ymd) return 'never'
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return 'never'
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString(
    'en-CA',
    { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' },
  )
}

function fmtSignIn(row: PartnerHealthRowView): string {
  if (row.hasAccount === null) return 'not read'
  if (!row.hasAccount) return 'no account'
  if (row.lastSignInAt === null) return 'never signed in'
  return new Date(row.lastSignInAt).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function PartnersHealthTable({ rows }: { rows: PartnerHealthRowView[] }) {
  const router = useRouter()
  const [filter, setFilter] = useState<FilterKey>('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(
    () =>
      rows.filter(r => {
        if (filter === 'referral' && r.tier === null) return false
        if (filter === 'investor' && r.tier !== null) return false
        if (search) {
          const q = search.toLowerCase()
          if (!(r.name ?? '').toLowerCase().includes(q) && !(r.email ?? '').toLowerCase().includes(q)) {
            return false
          }
        }
        return true
      }),
    [rows, filter, search],
  )

  return (
    <div>
      <div className="bg-cool-50 border border-cool-200 rounded-[9px] p-4 mb-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {(
            [
              { key: 'all', label: 'All' },
              { key: 'referral', label: 'Referral partners' },
              { key: 'investor', label: 'Funding partners' },
            ] as { key: FilterKey; label: string }[]
          ).map(pill => (
            <button
              key={pill.key}
              onClick={() => setFilter(pill.key)}
              className={`px-3 py-1.5 rounded-full text-sm font-ui font-semibold transition-colors border ${
                filter === pill.key
                  ? 'bg-navy text-white border-navy'
                  : 'bg-white text-navy border-navy/30 hover:border-navy'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Search by name or email"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full sm:w-72 border border-cool-200 rounded-lg px-3 py-2 font-ui text-sm text-navy bg-white focus:outline-none focus:ring-2 focus:ring-navy/30"
        />
      </div>

      <div className="bg-white rounded-[9px] border border-cool-200 overflow-hidden">
        {filtered.length === 0 ? (
          <p className="font-ui text-cool-500 text-sm py-12 text-center">No partners match this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="font-heading text-[11px] font-semibold tracking-[0.05em] text-cool-600 text-left">
                  <th className="px-4 py-3">Partner</th>
                  <th className="px-4 py-3">Health</th>
                  <th className="px-4 py-3">Last referral</th>
                  <th className="px-4 py-3">Referrals 12mo</th>
                  <th className="px-4 py-3">Funded</th>
                  <th className="px-4 py-3">Volume</th>
                  <th className="px-4 py-3">Revenue attributed</th>
                  <th className="px-4 py-3">Portal sign-in</th>
                  <th className="px-4 py-3 w-16" />
                </tr>
              </thead>
              <tbody className="font-ui">
                {filtered.map(r => (
                  <tr
                    key={r.id}
                    onClick={() => router.push(`/portal/admin/partners/${r.id}`)}
                    className="border-t border-cool-100 cursor-pointer hover:bg-cool-50 transition-colors"
                    data-testid={`partner-row-${r.id}`}
                  >
                    <td className="px-4 py-3">
                      <p className="text-navy font-semibold">{r.name ?? '(unnamed)'}</p>
                      <p className="text-cool-400 text-xs">{r.partnerType ?? 'type not set'}</p>
                    </td>
                    <td className="px-4 py-3">
                      {r.tier ? (
                        <StatusChip tone={TIER_CHIP[r.tier].tone}>{TIER_CHIP[r.tier].label}</StatusChip>
                      ) : (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-navy text-white">
                          Funding
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-cool-600 tabular-nums">{r.tier ? fmtShort(r.lastReferral) : 'n/a'}</td>
                    <td className="px-4 py-3 text-cool-600 tabular-nums">{r.tier ? r.referralsT12 : 'n/a'}</td>
                    <td className="px-4 py-3 text-cool-600 tabular-nums">
                      {r.referralsTotal > 0 ? (
                        <span>
                          {r.fundedCount} of {r.referralsTotal}
                          {r.conversionPct !== null && (
                            <span className="text-cool-400"> ({Math.round(r.conversionPct)}%)</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-cool-400">none attributed</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-navy font-semibold tabular-nums">
                      {r.fundedVolume > 0 ? fmtCompact(r.fundedVolume) : ''}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {r.revenueActual > 0 && (
                        <span className="text-navy font-semibold">{fmtCompact(r.revenueActual)}</span>
                      )}
                      {r.revenueActual > 0 && r.revenueModeled > 0 && <span className="text-cool-400"> + </span>}
                      {r.revenueModeled > 0 && (
                        <span>
                          <span className="text-cool-600">{fmtCompact(r.revenueModeled)}</span>{' '}
                          <span
                            data-estimate
                            title="Estimated through the comp model (config/comp.ts); the recorded Total_Commission is used wherever it exists."
                            className="text-[10px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 cursor-help"
                          >
                            est
                          </span>
                        </span>
                      )}
                      {r.revenueActual === 0 && r.revenueModeled === 0 && ''}
                    </td>
                    <td className="px-4 py-3 text-cool-500 text-xs tabular-nums">{fmtSignIn(r)}</td>
                    <td className="px-4 py-3 text-right">
                      <ChevronRight className="w-4 h-4 text-cool-300 inline" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
