'use client'

import Link from 'next/link'
import {
  TrendingUp,
  TrendingDown,
  Users,
  Eye,
  CheckCircle2,
  DollarSign,
  Target,
  Wallet,
  ShieldCheck,
  UserPlus,
  Download,
  CalendarClock,
  ArrowRight,
  Video,
} from 'lucide-react'

const stats = [
  { label: 'Total Referrals', value: '247', change: '+12%', up: true, icon: Users },
  { label: 'Active Monitoring', value: '89', change: '+8%', up: true, icon: Eye },
  { label: 'Closed Mortgages', value: '156', change: '+5%', up: true, icon: CheckCircle2 },
  { label: 'Funded Volume', value: '$45.2M', change: '+18%', up: true, icon: DollarSign },
  { label: 'Lead→Close %', value: '63.2%', change: '-2.1%', up: false, icon: Target },
  { label: 'Savings Generated', value: '$2.8M', change: '', up: true, icon: Wallet },
  { label: 'Assets Protected', value: '$128M', change: '', up: true, icon: ShieldCheck },
]

const quickActions = [
  {
    title: 'Add Referral',
    description: 'Submit a new client referral',
    icon: UserPlus,
    href: '/portal/add-referral',
  },
  {
    title: 'Download Assets',
    description: 'Co-branded marketing materials',
    icon: Download,
    href: '/portal/assets',
  },
  {
    title: 'Book Strategy Call',
    description: 'Schedule time with Michael',
    icon: CalendarClock,
    href: '/portal/support',
  },
]

const recentActivity = [
  {
    client: 'Sarah Johnson',
    action: 'Mortgage file updated — rate hold confirmed',
    date: 'Mar 25, 2026',
    status: 'Active',
  },
  {
    client: 'David Chen',
    action: 'New referral submitted — onboarding started',
    date: 'Mar 24, 2026',
    status: 'Onboarding',
  },
  {
    client: 'Maria Garcia',
    action: 'Savings alert — potential $380/mo reduction',
    date: 'Mar 23, 2026',
    status: 'Savings Found',
  },
  {
    client: 'James Wilson',
    action: 'Renewal review completed — locked 4.29%',
    date: 'Mar 22, 2026',
    status: 'Closed',
  },
]

const statusColors: Record<string, string> = {
  Active: 'bg-lime/20 text-lime-dark',
  Onboarding: 'bg-blue-100 text-blue-700',
  'Savings Found': 'bg-amber-100 text-amber-700',
  Closed: 'bg-gray-100 text-gray-600',
}

export default function DashboardPage() {
  return (
    <div>
      {/* Welcome Bar */}
      <div className="bg-lime/10 border border-lime/30 rounded-xl p-4 mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-heading font-bold text-navy text-lg">
            Welcome back, John
          </h2>
          <p className="font-body text-sm text-gray-600">
            You have <span className="font-semibold text-navy">3 new alerts</span> and{' '}
            <span className="font-semibold text-navy">2 pending referrals</span> to review.
          </p>
        </div>
        <Link
          href="/portal/clients"
          className="hidden md:flex items-center gap-2 bg-navy text-white font-body text-sm px-4 py-2 rounded-lg hover:bg-navy/90 transition-colors"
        >
          View Clients <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Webinar Banner */}
      <div className="bg-navy text-white rounded-xl p-4 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-lime/20 flex items-center justify-center">
            <Video className="w-5 h-5 text-lime" />
          </div>
          <div>
            <p className="font-heading font-semibold text-sm">
              Upcoming Webinar: 2026 Rate Forecast & Client Strategy
            </p>
            <p className="font-body text-xs text-gray-300">
              April 3, 2026 at 12:00 PM ET — Hosted by Michael Fox
            </p>
          </div>
        </div>
        <button className="bg-lime text-navy font-heading font-bold text-xs px-4 py-2 rounded-lg hover:bg-lime-dark transition-colors whitespace-nowrap">
          Register Now
        </button>
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
              <div className="font-heading font-semibold text-navy text-sm">
                {action.title}
              </div>
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
                className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50"
              >
                <td className="px-5 py-3 font-body text-sm font-medium text-navy">
                  {row.client}
                </td>
                <td className="px-5 py-3 font-body text-sm text-gray-600">
                  {row.action}
                </td>
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
