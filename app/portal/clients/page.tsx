'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'

const tabs = ['All', 'Active', 'Referred', 'Onboarding', 'Potential Savings']

const clients = [
  {
    id: '1',
    name: 'Sarah Johnson',
    status: 'Active',
    balance: '$482,000',
    rate: '4.89%',
    equity: '$138,000',
    lastReport: 'Mar 20, 2026',
    nextReview: 'Jun 15, 2026',
  },
  {
    id: '2',
    name: 'David Chen',
    status: 'Onboarding',
    balance: '$615,000',
    rate: '5.14%',
    equity: '$85,000',
    lastReport: 'Mar 18, 2026',
    nextReview: 'Apr 10, 2026',
  },
  {
    id: '3',
    name: 'Maria Garcia',
    status: 'Potential Savings',
    balance: '$340,000',
    rate: '5.49%',
    equity: '$210,000',
    lastReport: 'Mar 22, 2026',
    nextReview: 'Apr 5, 2026',
  },
  {
    id: '4',
    name: 'James Wilson',
    status: 'Active',
    balance: '$728,000',
    rate: '4.29%',
    equity: '$192,000',
    lastReport: 'Mar 15, 2026',
    nextReview: 'Sep 1, 2026',
  },
  {
    id: '5',
    name: 'Emily Tran',
    status: 'Referred',
    balance: '$395,000',
    rate: '5.34%',
    equity: '$67,000',
    lastReport: 'Mar 24, 2026',
    nextReview: 'May 20, 2026',
  },
  {
    id: '6',
    name: 'Robert Patel',
    status: 'Active',
    balance: '$560,000',
    rate: '4.59%',
    equity: '$145,000',
    lastReport: 'Mar 19, 2026',
    nextReview: 'Jul 12, 2026',
  },
  {
    id: '7',
    name: 'Lisa Nakamura',
    status: 'Potential Savings',
    balance: '$290,000',
    rate: '5.74%',
    equity: '$310,000',
    lastReport: 'Mar 21, 2026',
    nextReview: 'Apr 8, 2026',
  },
  {
    id: '8',
    name: 'Michael Brown',
    status: 'Onboarding',
    balance: '$445,000',
    rate: '5.09%',
    equity: '$52,000',
    lastReport: 'Mar 23, 2026',
    nextReview: 'Apr 15, 2026',
  },
]

const statusColors: Record<string, string> = {
  Active: 'bg-lime/20 text-lime-dark',
  Referred: 'bg-purple-100 text-purple-700',
  Onboarding: 'bg-blue-100 text-blue-700',
  'Potential Savings': 'bg-amber-100 text-amber-700',
}

export default function ClientsPage() {
  const [activeTab, setActiveTab] = useState('All')
  const [search, setSearch] = useState('')

  const filteredClients = clients.filter((c) => {
    const matchesTab = activeTab === 'All' || c.status === activeTab
    const matchesSearch =
      search === '' || c.name.toLowerCase().includes(search.toLowerCase())
    return matchesTab && matchesSearch
  })

  return (
    <div>
      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`font-body text-sm px-4 py-2 rounded-full transition-colors ${
              activeTab === tab
                ? 'bg-lime text-navy font-semibold'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients by name..."
          className="w-full md:w-80 pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg font-body text-sm focus:outline-none focus:ring-2 focus:ring-lime/50 focus:border-lime"
        />
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-x-auto mb-6">
        <table className="w-full text-left min-w-[900px]">
          <thead>
            <tr className="border-b border-gray-100">
              {[
                'Client Name',
                'Status',
                'Mortgage Balance',
                'Current Rate',
                'Est. Equity',
                'Last Report',
                'Next Review',
              ].map((col) => (
                <th
                  key={col}
                  className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredClients.map((client) => (
              <tr
                key={client.id}
                className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50"
              >
                <td className="px-5 py-3">
                  <Link
                    href={`/portal/clients/${client.id}`}
                    className="font-body text-sm font-medium text-navy hover:underline"
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
                <td className="px-5 py-3 font-body text-sm text-gray-700">
                  {client.balance}
                </td>
                <td className="px-5 py-3 font-body text-sm text-gray-700">
                  {client.rate}
                </td>
                <td className="px-5 py-3 font-body text-sm text-gray-700">
                  {client.equity}
                </td>
                <td className="px-5 py-3 font-body text-sm text-gray-400">
                  {client.lastReport}
                </td>
                <td className="px-5 py-3 font-body text-sm text-gray-400">
                  {client.nextReview}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="font-body text-sm text-gray-500">
          Showing {filteredClients.length} of {clients.length} clients
        </p>
        <div className="flex items-center gap-2">
          <button className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-navy text-white font-body text-sm">
            1
          </button>
          <button className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 font-body text-sm">
            2
          </button>
          <button className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
