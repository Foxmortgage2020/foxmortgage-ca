'use client'

// ─── Demo FP clients list ──────────────────────────────────────────────────────
// Mirrors app/portal/fp/clients/page.tsx. Search + tabs are kept (they filter
// the inline static array only — no network). ZERO fetch, no Clerk, read-only.
// "Add Referral" is a disabled no-op. Links point to /demo/fp/clients/[id].

import Link from 'next/link'
import { useState } from 'react'
import { UserPlus, Search, ChevronRight } from 'lucide-react'
import { DEMO_CLIENTS } from '../_data/demo-data'

// ─── Helpers (copied from the live list) ──────────────────────────────────────

function stageToStatus(stage: string, savingsIdentified: string | null): string {
  const s = (stage ?? '').toLowerCase()
  if (s.includes('closed won') || s.includes('funded')) return 'Closed'
  if (s.includes('closed')) return 'Closed'
  if (savingsIdentified && savingsIdentified !== '—' && savingsIdentified !== '0') return 'Savings Found'
  if (s.includes('prospecting') || s.includes('qualification') || !s) return 'Referred'
  if (s.includes('needs') || s.includes('value') || s.includes('decision') || s.includes('perception')) return 'Onboarding'
  return 'Active'
}

function formatAmount(amount: number | null): string {
  if (!amount) return '—'
  return '$' + amount.toLocaleString('en-CA')
}

function formatRate(rate: number | null): string {
  if (rate == null) return '—'
  return `${rate}%`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-CA', {
      month: 'short', day: 'numeric', year: 'numeric',
    })
  } catch {
    return iso
  }
}

const statusColors: Record<string, string> = {
  Active: 'bg-lime/20 text-lime-dark',
  Onboarding: 'bg-blue-100 text-blue-700',
  'Savings Found': 'bg-amber-100 text-amber-700',
  Closed: 'bg-gray-100 text-gray-600',
  Referred: 'bg-purple-100 text-purple-700',
}

const tabs = ['All', 'Active', 'Onboarding', 'Savings Found', 'Closed']

export default function DemoFPClientsPage() {
  const clients = DEMO_CLIENTS
  const [activeTab, setActiveTab] = useState('All')
  const [search, setSearch] = useState('')

  const clientsWithStatus = clients.map(c => ({
    ...c,
    status: stageToStatus(c.stage, c.savingsIdentified),
    displayName: c.contactName || c.dealName,
  }))

  const filtered = clientsWithStatus.filter((c) => {
    const matchesTab = activeTab === 'All' || c.status === activeTab
    const matchesSearch = c.displayName.toLowerCase().includes(search.toLowerCase())
    return matchesTab && matchesSearch
  })

  return (
    <div>
      {/* Header actions */}
      <div className="flex items-center justify-between mb-6">
        <p className="font-body text-sm text-gray-500">
          {`${clients.length} client${clients.length !== 1 ? 's' : ''} total`}
        </p>
        {/* Disabled in the read-only demo */}
        <span
          aria-disabled="true"
          title="Disabled in demo"
          className="flex items-center gap-2 bg-lime/40 text-navy/70 font-heading font-bold text-sm px-4 py-2 rounded-lg cursor-not-allowed select-none"
        >
          <UserPlus className="w-4 h-4" />
          Add Referral
        </span>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search clients…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg font-body text-sm text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime/40"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-md text-xs font-body font-semibold transition-colors ${
              activeTab === tab
                ? 'bg-white text-navy shadow-sm'
                : 'text-gray-500 hover:text-navy'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">
                Client
              </th>
              <th className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">
                Status
              </th>
              <th className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3 hidden lg:table-cell">
                Balance
              </th>
              <th className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3 hidden lg:table-cell">
                Rate
              </th>
              <th className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3 hidden xl:table-cell">
                Savings
              </th>
              <th className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3 hidden md:table-cell">
                Next Review
              </th>
              <th className="px-5 py-3 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center font-body text-sm text-gray-400">
                  {clients.length === 0 ? 'No clients yet.' : 'No clients match your search.'}
                </td>
              </tr>
            ) : (
              filtered.map((client) => (
                <tr
                  key={client.id}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 cursor-pointer"
                >
                  <td className="px-5 py-3">
                    <Link
                      href={`/demo/fp/clients/${client.id}`}
                      className="font-body text-sm font-medium text-navy hover:text-lime transition-colors"
                    >
                      {client.displayName}
                    </Link>
                    {client.relationshipTag && (
                      <span className="block w-fit mt-1 font-body text-[10px] font-medium text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
                        {client.relationshipTag}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-block font-body text-xs font-semibold px-3 py-1 rounded-full ${
                        statusColors[client.status] || 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {client.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-body text-sm text-gray-700 hidden lg:table-cell">
                    {formatAmount(client.amount)}
                  </td>
                  <td className="px-5 py-3 font-body text-sm text-gray-700 hidden lg:table-cell">
                    {formatRate(client.mortgageRate)}
                  </td>
                  <td className="px-5 py-3 font-body text-sm text-gray-700 hidden xl:table-cell">
                    {client.savingsIdentified ?? '—'}
                  </td>
                  <td className="px-5 py-3 font-body text-sm text-gray-400 hidden md:table-cell">
                    {formatDate(client.nextReviewDate)}
                  </td>
                  <td className="px-5 py-3">
                    <Link href={`/demo/fp/clients/${client.id}`}>
                      <ChevronRight className="w-4 h-4 text-gray-300 hover:text-navy transition-colors" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
