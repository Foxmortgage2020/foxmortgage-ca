'use client'

import { useUser } from '@clerk/nextjs'
import Link from 'next/link'
import {
  Users,
  DollarSign,
  CheckCircle2,
  Target,
  TrendingUp,
  TrendingDown,
  UserPlus,
  MessageSquare,
  ArrowRight,
  Briefcase,
} from 'lucide-react'

const stats = [
  { label: 'Total Referrals', value: '12', change: '+3', up: true, icon: Users },
  { label: 'Active Monitoring', value: '8', change: '+1', up: true, icon: Target },
  { label: 'Closed Mortgages', value: '7', change: '+2', up: true, icon: CheckCircle2 },
  { label: 'Funded Volume', value: '$4.1M', change: '+$850K', up: true, icon: DollarSign },
  { label: 'Lead-to-Close %', value: '58.3%', change: '-3.2%', up: false, icon: TrendingUp },
  { label: 'Savings Identified YTD', value: '$42,800', change: '', up: true, icon: DollarSign },
  { label: 'Mortgages Under Mgmt', value: '$3.2M', change: '', up: true, icon: Briefcase },
]

const recentActivity = [
  {
    client: 'Amanda Reyes',
    action: 'Mortgage file updated — rate hold confirmed at 4.79%',
    date: 'Apr 1, 2026',
    status: 'Active',
  },
  {
    client: 'Ben Kowalski',
    action: 'New referral submitted — onboarding started',
    date: 'Mar 31, 2026',
    status: 'Onboarding',
  },
  {
    client: 'Priya Sharma',
    action: 'Renewal review completed — savings of $410/mo identified',
    date: 'Mar 28, 2026',
    status: 'Savings Found',
  },
  {
    client: 'Carlos Mendes',
    action: 'Mortgage funded — $685,000 at 4.54% 5yr fixed',
    date: 'Mar 25, 2026',
    status: 'Closed',
  },
]

const statusColors: Record<string, string> = {
  Active: 'bg-lime/20 text-lime-dark',
  Onboarding: 'bg-blue-100 text-blue-700',
  'Savings Found': 'bg-amber-100 text-amber-700',
  Closed: 'bg-gray-100 text-gray-600',
}

const quickActions = [
  {
    title: 'Add Referral',
    description: 'Submit a new client referral',
    icon: UserPlus,
    href: '/portal/fp/add-referral',
  },
  {
    title: 'View Clients',
    description: 'See all your referred clients',
    icon: Users,
    href: '/portal/fp/clients',
  },
  {
    title: 'Message Michael',
    description: 'Send a message or ask a question',
    icon: MessageSquare,
    href: '/portal/fp/messages',
  },
]

export default function FPDashboardPage() {
  const { user } = useUser()
  const firstName = user?.firstName || 'there'

  return (
    <div>
      {/* Welcome Bar */}
      <div className="bg-lime/10 border border-lime/30 rounded-xl p-4 mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-heading font-bold text-navy text-lg">
            Welcome back, {firstName}
          </h2>
          <p className="font-body text-sm text-gray-600">
            You have <span className="font-semibold text-navy">2 clients</span> with upcoming
            renewals and <span className="font-semibold text-navy">1 new message</span> from
            Michael.
          </p>
        </div>
        <Link
          href="/portal/fp/clients"
          className="hidden md:flex items-center gap-2 bg-navy text-white font-body text-sm px-4 py-2 rounded-lg hover:bg-navy/90 transition-colors"
        >
          View Clients <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-white border border-gray-100 rounded-xl p-4 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-center justify-between mb-2">
              <stat.icon className="w-5 h-5 text-gray-400" />
              {stat.change && (
                <span
                  className={`flex items-center gap-0.5 text-xs font-body font-semibold ${
                    stat.up ? 'text-green-600' : 'text-red-500'
                  }`}
                >
                  {stat.up ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  {stat.change}
                </span>
              )}
            </div>
            <div className="font-heading font-bold text-navy text-xl">{stat.value}</div>
            <div className="font-body text-xs text-gray-500 mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <h3 className="font-heading font-bold text-navy text-lg mb-4">Quick Actions</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {quickActions.map((action) => (
          <Link
            key={action.title}
            href={action.href}
            className="bg-white border border-gray-100 rounded-xl p-5 flex items-center gap-4 hover:shadow-md transition-shadow group"
          >
            <div className="w-11 h-11 rounded-full bg-lime/15 flex items-center justify-center group-hover:bg-lime/25 transition-colors">
              <action.icon className="w-5 h-5 text-navy" />
            </div>
            <div>
              <div className="font-heading font-semibold text-navy text-sm">{action.title}</div>
              <div className="font-body text-xs text-gray-500">{action.description}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Recent Activity */}
      <h3 className="font-heading font-bold text-navy text-lg mb-4">Recent Activity</h3>
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">
                Client
              </th>
              <th className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">
                Activity
              </th>
              <th className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3 hidden md:table-cell">
                Date
              </th>
              <th className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {recentActivity.map((row, i) => (
              <tr
                key={i}
                className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 cursor-pointer"
                onClick={() => {}}
              >
                <td className="px-5 py-3 font-body text-sm font-medium text-navy">
                  {row.client}
                </td>
                <td className="px-5 py-3 font-body text-sm text-gray-600">{row.action}</td>
                <td className="px-5 py-3 font-body text-sm text-gray-400 hidden md:table-cell">
                  {row.date}
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`inline-block font-body text-xs font-semibold px-3 py-1 rounded-full ${
                      statusColors[row.status] || 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
