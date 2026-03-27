'use client'

import { useState } from 'react'
import { Users, DollarSign, TrendingUp, CheckCircle2, Download } from 'lucide-react'

const dateRanges = ['This Month', 'Last 3 Months', 'This Year', 'All Time'] as const

const stats = [
  { label: 'Total Referrals', value: '247', icon: Users, color: 'bg-blue-100 text-blue-600' },
  { label: 'Funded Volume', value: '$45.2M', icon: DollarSign, color: 'bg-green-100 text-green-600' },
  { label: 'Conversion Rate', value: '63.2%', icon: TrendingUp, color: 'bg-amber-100 text-amber-600' },
  { label: 'Closed Mortgages', value: '156', icon: CheckCircle2, color: 'bg-purple-100 text-purple-600' },
]

const monthlyData = [
  { month: 'Jan', height: 40 },
  { month: 'Feb', height: 55 },
  { month: 'Mar', height: 35 },
  { month: 'Apr', height: 70 },
  { month: 'May', height: 60 },
  { month: 'Jun', height: 85 },
  { month: 'Jul', height: 75 },
  { month: 'Aug', height: 90 },
  { month: 'Sep', height: 65 },
  { month: 'Oct', height: 80 },
  { month: 'Nov', height: 50 },
  { month: 'Dec', height: 45 },
]

const statusBreakdown = [
  { label: 'Active Monitoring', pct: 36, color: 'bg-lime' },
  { label: 'In Progress', pct: 24, color: 'bg-blue-500' },
  { label: 'Closed', pct: 28, color: 'bg-navy' },
  { label: 'On Hold', pct: 12, color: 'bg-gray-400' },
]

const activeClients = [
  { name: 'Sarah Johnson', status: 'Active', amount: '$620,000', date: 'Mar 25, 2026' },
  { name: 'David Chen', status: 'Onboarding', amount: '$485,000', date: 'Mar 24, 2026' },
  { name: 'Maria Garcia', status: 'Savings Found', amount: '$720,000', date: 'Mar 23, 2026' },
  { name: 'James Wilson', status: 'Closed', amount: '$550,000', date: 'Mar 22, 2026' },
  { name: 'Lisa Thompson', status: 'Active', amount: '$890,000', date: 'Mar 20, 2026' },
]

const statusColors: Record<string, string> = {
  Active: 'bg-lime/20 text-lime-dark',
  Onboarding: 'bg-blue-100 text-blue-700',
  'Savings Found': 'bg-amber-100 text-amber-700',
  Closed: 'bg-gray-100 text-gray-600',
}

export default function ReportsPage() {
  const [activeRange, setActiveRange] = useState<string>('This Year')

  return (
    <div>
      {/* Date Range Tabs */}
      <div className="flex gap-2 mb-6">
        {dateRanges.map((range) => (
          <button
            key={range}
            onClick={() => setActiveRange(range)}
            className={`px-4 py-2 rounded-lg font-body text-sm transition-colors ${
              activeRange === range
                ? 'bg-navy text-white font-semibold'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {range}
          </button>
        ))}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-white border border-gray-100 rounded-xl p-5 hover:shadow-sm transition-shadow"
          >
            <div className={`w-10 h-10 rounded-lg ${stat.color} flex items-center justify-center mb-3`}>
              <stat.icon className="w-5 h-5" />
            </div>
            <div className="font-heading font-bold text-navy text-xl">{stat.value}</div>
            <div className="font-body text-xs text-gray-500 mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Referrals Over Time */}
        <div className="bg-white border border-gray-100 rounded-xl p-6">
          <h3 className="font-heading font-semibold text-navy text-base mb-6">
            Referrals Over Time
          </h3>
          <div className="flex items-end gap-2 h-48">
            {monthlyData.map((d) => (
              <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full bg-lime rounded-t-sm transition-all"
                  style={{ height: `${d.height}%` }}
                />
                <span className="font-body text-[10px] text-gray-400">{d.month}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Mortgage Status Breakdown */}
        <div className="bg-white border border-gray-100 rounded-xl p-6">
          <h3 className="font-heading font-semibold text-navy text-base mb-6">
            Mortgage Status Breakdown
          </h3>
          <div className="space-y-4">
            {statusBreakdown.map((item) => (
              <div key={item.label}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-sm ${item.color}`} />
                    <span className="font-body text-sm text-gray-700">{item.label}</span>
                  </div>
                  <span className="font-heading font-bold text-navy text-sm">{item.pct}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${item.color} transition-all`}
                    style={{ width: `${item.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Active Clients Table */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-heading font-semibold text-navy text-base">Active Clients</h3>
        </div>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">
                Client
              </th>
              <th className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">
                Status
              </th>
              <th className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3 hidden md:table-cell">
                Amount
              </th>
              <th className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3 hidden md:table-cell">
                Date
              </th>
            </tr>
          </thead>
          <tbody>
            {activeClients.map((client, i) => (
              <tr
                key={i}
                className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50"
              >
                <td className="px-5 py-3 font-body text-sm font-medium text-navy">
                  {client.name}
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
                <td className="px-5 py-3 font-body text-sm text-gray-600 hidden md:table-cell">
                  {client.amount}
                </td>
                <td className="px-5 py-3 font-body text-sm text-gray-400 hidden md:table-cell">
                  {client.date}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Download Button */}
      <div className="flex justify-end">
        <button
          onClick={() => alert('Full report download will be available soon.')}
          className="flex items-center gap-2 bg-navy text-white font-heading font-bold px-6 py-3 rounded-lg hover:bg-navy/90 transition-colors"
        >
          <Download className="w-4 h-4" />
          Download Full Report
        </button>
      </div>
    </div>
  )
}
