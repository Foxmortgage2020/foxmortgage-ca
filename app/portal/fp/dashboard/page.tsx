'use client'

import { useUser } from '@clerk/nextjs'
import Link from 'next/link'
import { useState, useEffect } from 'react'
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
  Loader2,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardStats {
  totalReferrals: number
  activeMonitoring: number
  closedMortgages: number
  fundedVolume: number
  leadToClose: number
  savingsYTD: number
  mortgagesUnderMgmt: number
}

interface RecentDeal {
  client: string
  dealId: string
  stage: string
  lastActivity: string | null
  savingsIdentified: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${n.toLocaleString('en-CA')}`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}

function stageToStatus(stage: string): string {
  const s = (stage ?? '').toLowerCase()
  if (s.includes('closed won') || s.includes('funded')) return 'Closed'
  if (s.includes('closed')) return 'Closed'
  if (s.includes('prospecting') || s.includes('qualification') || !s) return 'Referred'
  if (s.includes('needs') || s.includes('value') || s.includes('decision') || s.includes('perception')) return 'Onboarding'
  return 'Active'
}

// ─── Constants ────────────────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  Active: 'bg-lime/20 text-lime-dark',
  Onboarding: 'bg-blue-100 text-blue-700',
  'Savings Found': 'bg-amber-100 text-amber-700',
  Closed: 'bg-gray-100 text-gray-600',
  Referred: 'bg-purple-100 text-purple-700',
}

const quickActions = [
  { title: 'Add Referral', description: 'Submit a new client referral', icon: UserPlus, href: '/portal/fp/add-referral' },
  { title: 'View Clients', description: 'See all your referred clients', icon: Users, href: '/portal/fp/clients' },
  { title: 'Message Michael', description: 'Send a message or ask a question', icon: MessageSquare, href: '/portal/fp/messages' },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FPDashboardPage() {
  const { user } = useUser()
  const firstName = user?.firstName || 'there'

  const EMPTY_STATS: DashboardStats = {
    totalReferrals: 0,
    activeMonitoring: 0,
    closedMortgages: 0,
    fundedVolume: 0,
    leadToClose: 0,
    savingsYTD: 0,
    mortgagesUnderMgmt: 0,
  }

  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS)
  const [recent, setRecent] = useState<RecentDeal[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/portal/fp/dashboard')
      .then(r => r.json())
      .then(data => {
        // Payload shape: { stats, recent, warning? } — always set, even on warning.
        if (data?.stats) setStats(data.stats)
        if (Array.isArray(data?.recent)) setRecent(data.recent)
        if (data?.warning) console.warn('[fp/dashboard] warning:', data.warning)
      })
      .catch(err => console.error('[fp/dashboard] fetch error:', err))
      .finally(() => setLoading(false))
  }, [])

  const statCards = [
    { label: 'Total Referrals', value: String(stats.totalReferrals), icon: Users, up: true },
    { label: 'Files In Progress', value: String(stats.activeMonitoring), icon: Target, up: true },
    { label: 'Funded Mortgages', value: String(stats.closedMortgages), icon: CheckCircle2, up: true },
    { label: 'Total Funded', value: formatCurrency(stats.fundedVolume), icon: DollarSign, up: true },
    { label: 'Lead-to-Close %', value: `${stats.leadToClose}%`, icon: TrendingUp, up: true },
    {
      label: 'Savings Identified YTD',
      value: stats.savingsYTD > 0 ? formatCurrency(stats.savingsYTD) : '—',
      icon: DollarSign,
      up: true,
    },
    { label: 'Total Referred Value', value: formatCurrency(stats.mortgagesUnderMgmt), icon: Briefcase, up: true },
  ]

  const upcomingRenewals = recent.filter(r => r.savingsIdentified).length
  const hasNewActivity = recent.length > 0

  return (
    <div>
      {/* Welcome Bar */}
      <div className="bg-lime/10 border border-lime/30 rounded-xl p-4 mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-heading font-bold text-navy text-lg">Welcome back, {firstName}</h2>
          <p className="font-body text-sm text-gray-600">
            {loading ? (
              'Loading your portfolio…'
            ) : (
              <>
                You have{' '}
                <span className="font-semibold text-navy">{stats.activeMonitoring} file{stats.activeMonitoring !== 1 ? 's' : ''}</span>{' '}
                in progress
                {upcomingRenewals > 0 && (
                  <> and <span className="font-semibold text-navy">{upcomingRenewals} with savings identified</span></>
                )}
                .
              </>
            )}
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
        {loading ? (
          Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-xl p-4 animate-pulse">
              <div className="h-4 w-4 bg-gray-200 rounded mb-3" />
              <div className="h-6 w-16 bg-gray-200 rounded mb-2" />
              <div className="h-3 w-24 bg-gray-100 rounded" />
            </div>
          ))
        ) : (
          statCards.map((stat) => (
            <div
              key={stat.label}
              className="bg-white border border-gray-100 rounded-xl p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-center justify-between mb-2">
                <stat.icon className="w-5 h-5 text-gray-400" />
                {stat.up ? (
                  <TrendingUp className="w-3 h-3 text-green-500" />
                ) : (
                  <TrendingDown className="w-3 h-3 text-red-500" />
                )}
              </div>
              <div className="font-heading font-bold text-navy text-xl">{stat.value}</div>
              <div className="font-body text-xs text-gray-500 mt-1">{stat.label}</div>
            </div>
          ))
        )}
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
        {loading ? (
          <div className="flex items-center justify-center py-10 gap-2 text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="font-body text-sm">Loading activity…</span>
          </div>
        ) : recent.length === 0 ? (
          <div className="px-5 py-10 text-center font-body text-sm text-gray-400">
            No recent activity yet.
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Client</th>
                <th className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Stage</th>
                <th className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3 hidden md:table-cell">Last Activity</th>
                <th className="font-body text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((row, i) => {
                const status = stageToStatus(row.stage)
                return (
                  <tr
                    key={i}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 cursor-pointer"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/portal/fp/clients/${row.dealId}`}
                        className="font-body text-sm font-medium text-navy hover:text-lime transition-colors"
                      >
                        {row.client}
                      </Link>
                    </td>
                    <td className="px-5 py-3 font-body text-sm text-gray-600">{row.stage || '—'}</td>
                    <td className="px-5 py-3 font-body text-sm text-gray-400 hidden md:table-cell">
                      {formatDate(row.lastActivity)}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-block font-body text-xs font-semibold px-3 py-1 rounded-full ${
                          statusColors[status] || 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
