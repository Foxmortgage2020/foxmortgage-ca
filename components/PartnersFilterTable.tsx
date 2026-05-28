'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, FileText } from 'lucide-react'

interface PartnerRow {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  city: string | null
  province: string | null
  partnerType: string | null
  partnerStatus: string | null
  modifiedTime: string | null
  documentCount: number
}

interface PartnersFilterTableProps {
  partners: PartnerRow[]
}

type FilterKey = 'all' | 'investor' | 'fp' | 'realtor' | 'lawyer'

// Match against the Partner_Type picklist values used in Zoho. Partner
// Type strings are case-sensitive on the Zoho side — keep these aligned.
function matchesFilter(partner: PartnerRow, filter: FilterKey): boolean {
  if (filter === 'all') return true
  const t = (partner.partnerType ?? '').toLowerCase()
  if (filter === 'investor') return t.includes('investor')
  if (filter === 'fp') return t.includes('financial planner') || t.includes('planner')
  if (filter === 'realtor') return t.includes('realtor')
  if (filter === 'lawyer') return t.includes('lawyer')
  return true
}

function matchesSearch(partner: PartnerRow, q: string): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  return (
    (partner.name ?? '').toLowerCase().includes(needle) ||
    (partner.email ?? '').toLowerCase().includes(needle)
  )
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const diffMs = Date.now() - d.getTime()
  const day = 1000 * 60 * 60 * 24
  const days = Math.floor(diffMs / day)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days} days ago`
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

function typeBadge(partnerType: string | null): { label: string; cls: string } {
  const t = (partnerType ?? '').toLowerCase()
  if (t.includes('investor')) {
    return { label: 'Investor', cls: 'bg-navy text-lime' }
  }
  if (t.includes('financial planner') || t.includes('planner')) {
    return { label: 'Financial Planner', cls: 'bg-lime text-navy' }
  }
  if (t.includes('realtor')) {
    return { label: 'Realtor', cls: 'bg-gray-700 text-white' }
  }
  if (t.includes('lawyer')) {
    return { label: 'Lawyer', cls: 'bg-amber-100 text-amber-900' }
  }
  return { label: partnerType ?? '—', cls: 'bg-gray-100 text-gray-700' }
}

const FILTER_PILLS: { key: FilterKey; label: string }[] = [
  { key: 'all',      label: 'All' },
  { key: 'investor', label: 'Investors' },
  { key: 'fp',       label: 'Financial Planners' },
  { key: 'realtor',  label: 'Realtors' },
  { key: 'lawyer',   label: 'Lawyers' },
]

export default function PartnersFilterTable({ partners }: PartnersFilterTableProps) {
  const router = useRouter()
  const [filter, setFilter] = useState<FilterKey>('all')
  const [search, setSearch] = useState('')

  const counts = useMemo(() => {
    const c = { investor: 0, fp: 0, realtor: 0, lawyer: 0 }
    for (const p of partners) {
      const t = (p.partnerType ?? '').toLowerCase()
      if (t.includes('investor')) c.investor += 1
      else if (t.includes('financial planner') || t.includes('planner')) c.fp += 1
      else if (t.includes('realtor')) c.realtor += 1
      else if (t.includes('lawyer')) c.lawyer += 1
    }
    return c
  }, [partners])

  const filtered = useMemo(
    () => partners.filter(p => matchesFilter(p, filter) && matchesSearch(p, search)),
    [partners, filter, search],
  )

  return (
    <div>
      {/* Sticky filter bar */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-2 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {FILTER_PILLS.map(pill => {
            const active = filter === pill.key
            return (
              <button
                key={pill.key}
                onClick={() => setFilter(pill.key)}
                className={`px-3 py-1.5 rounded-full text-sm font-body font-semibold transition-colors border ${
                  active
                    ? 'bg-navy text-white border-navy'
                    : 'bg-white text-navy border-navy/30 hover:border-navy'
                }`}
              >
                {pill.label}
              </button>
            )
          })}
        </div>
        <input
          type="search"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-72 border border-gray-200 rounded-lg px-3 py-2 font-body text-sm text-navy bg-white focus:outline-none focus:ring-2 focus:ring-lime/40"
        />
      </div>

      <p className="text-gray-500 text-xs font-body mb-6 px-1">
        {partners.length} total · {counts.investor} investor{counts.investor !== 1 ? 's' : ''} ·{' '}
        {counts.fp} financial planner{counts.fp !== 1 ? 's' : ''} ·{' '}
        {counts.realtor} realtor{counts.realtor !== 1 ? 's' : ''} ·{' '}
        {counts.lawyer} lawyer{counts.lawyer !== 1 ? 's' : ''}
      </p>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <p className="font-body text-gray-500 text-sm py-12 text-center">No partners match this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400 text-xs uppercase tracking-wider text-left">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Documents</th>
                  <th className="px-5 py-3 font-medium">Last Activity</th>
                  <th className="px-5 py-3 w-24"></th>
                </tr>
              </thead>
              <tbody className="font-body">
                {filtered.map((p) => {
                  const badge = typeBadge(p.partnerType)
                  return (
                    <tr
                      key={p.id}
                      onClick={() => router.push(`/portal/admin/partners/${p.id}`)}
                      className="border-b border-gray-50 last:border-0 cursor-pointer hover:bg-lime/5 transition-colors"
                    >
                      <td className="px-5 py-3">
                        <p className="text-navy font-semibold">{p.name ?? '—'}</p>
                        {p.email && <p className="text-gray-400 text-xs">{p.email}</p>}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`${badge.cls} text-xs font-semibold px-2 py-0.5 rounded-full`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-700">
                        {/* Phase 2 will pull this from Onboarding_Stage. For now everyone is shown as Active. */}
                        Active
                      </td>
                      <td className="px-5 py-3 text-gray-700">
                        <span className="inline-flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-gray-400" />
                          {p.documentCount} docs
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-500">{relativeTime(p.modifiedTime)}</td>
                      <td className="px-5 py-3 text-right">
                        <span className="inline-flex items-center gap-1 text-lime font-semibold text-sm">
                          View <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
