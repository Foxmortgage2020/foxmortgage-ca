'use client'

import Link from 'next/link'
import { useState } from 'react'
import { UserPlus, Search, ChevronRight } from 'lucide-react'

const mockClients = [
  {
    id: 'c001',
    name: 'Amanda Reyes',
    status: 'Active',
    mortgageBalance: '$612,000',
    currentRate: '5.14%',
    estimatedEquity: '$188,000',
    lastReport: 'Apr 1, 2026',
    nextReview: 'Oct 1, 2026',
  },
  {
    id: 'c002',
    name: 'Ben Kowalski',
    status: 'Onboarding',
    mortgageBalance: '$485,000',
    currentRate: '—',
    estimatedEquity: '$115,000',
    lastReport: '—',
    nextReview: 'May 15, 2026',
  },
  {
    id: 'c003',
    name: 'Priya Sharma',
    status: 'Savings Found',
    mortgageBalance: '$738,000',
    currentRate: '5.89%',
    estimatedEquity: '$262,000',
    lastReport: 'Mar 28, 2026',
    nextReview: 'Jun 1, 2026',
  },
  {
    id: 'c004',
    name: 'Carlos Mendes',
    status: 'Closed',
    mortgageBalance: '$685,000',
    currentRate: '4.54%',
    estimatedEquity: '$215,000',
    lastReport: 'Mar 25, 2026',
    nextReview: 'Mar 25, 2031',
  },
  {
    id: 'c005',
    name: 'Jordan Lee',
    status: 'Active',
    mortgageBalance: '$540,000',
    currentRate: '4.99%',
    estimatedEquity: '$160,000',
    lastReport: 'Mar 20, 2026',
    nextReview: 'Sep 20, 2026',
  },
  {
    id: 'c006',
    name: 'Sarah Okonkwo',
    status: 'Referred',
    mortgageBalance: '—',
    currentRate: '—',
    estimatedEquity: '—',
    lastReport: '—',
    nextReview: '—',
  },
]

const statusColors: Record<string, string> = {
  Active: 'bg-lime/20 text-lime-dark',
  Onboarding: 'bg-blue-100 text-blue-700',
  'Savings Found': 'bg-amber-100 text-amber-700',
  Closed: 'bg-gray-100 text-gray-600',
  Referred: 'bg-purple-100 text-purple-700',
}

const tabs = ['All', 'Active', 'Onboarding', 'Savings Found', 'Closed']

export default function FPClientsPage() {
  const [activeTab, setActiveTab] = useState('All')
  const [search, setSearch] = useState('')

  const filtered = mockClients.filter((c) => {
    const matchesTab = activeTab === 'All' || c.status === activeTab
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase())
    return matchesTab && matchesSearch
  })

  return (
    <div>
      {/* Header actions */}
      <div className="flex items-center justify-between mb-6">
        <p className="font-body text-sm text-gray-500">{mockClients.length} clients total</p>
        <Link
          href="/portal/fp/add-referral"
          className="flex items-center gap-2 bg-lime text-navy font-heading font-bold text-sm px-4 py-2 rounded-lg hover:bg-lime-dark transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Add Referral
        </Link>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search clients..."
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
                Equity Est.
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
                  No clients found.
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
                      href={`/portal/fp/clients/${client.id}`}
                      className="font-body text-sm font-medium text-navy hover:text-lime transition-colors"
                    >
                      {client.name}
                    </Link>
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
                    {client.mortgageBalance}
                  </td>
                  <td className="px-5 py-3 font-body text-sm text-gray-700 hidden lg:table-cell">
                    {client.currentRate}
                  </td>
                  <td className="px-5 py-3 font-body text-sm text-gray-700 hidden xl:table-cell">
                    {client.estimatedEquity}
                  </td>
                  <td className="px-5 py-3 font-body text-sm text-gray-400 hidden md:table-cell">
                    {client.nextReview}
                  </td>
                  <td className="px-5 py-3">
                    <Link href={`/portal/fp/clients/${client.id}`}>
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
