'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import { Search, Download, MessageSquare, TrendingUp, DollarSign, Percent, Wallet, CircleDollarSign } from 'lucide-react';

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n);

// ── Investor_Status-driven helpers ──

const isIncomeActive = (p: any): boolean => {
  const status = p.Investor_Status
  return ['Active', 'Renewal In Progress', 'Renewed'].includes(status)
    || (!status && p.Deal_Status_Investor !== 'Matured')
}

const getIncomeEndDate = (p: any): Date => {
  const today = new Date()
  if (p.Investor_Status === 'Paid Out') {
    if (p.Investor_Payout_Date) return new Date(p.Investor_Payout_Date)
    if (p.Maturity_Date) return new Date(p.Maturity_Date)
    return today
  }
  if (p.Investor_Status === 'Legal') {
    if (p.Maturity_Date) return new Date(p.Maturity_Date)
    return today
  }
  return today
}

const getIncomeStartDate = (p: any): Date => {
  const start = p.First_Payment_Date || p.Closing_Date
  return start ? new Date(start) : new Date()
}

const getMonthsActive = (p: any): number => {
  const start = getIncomeStartDate(p)
  const end = getIncomeEndDate(p)
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30)))
}

const getMonthlyIncome = (p: any): number => {
  if (!isIncomeActive(p)) return 0
  return ((Number(p.Investor_Amount) || 0) * (Number(p.Investor_Rate) || 0)) / 100 / 12
}

const getInterestEarned = (p: any): number => {
  const monthlyRate = ((Number(p.Investor_Amount) || 0) * (Number(p.Investor_Rate) || 0)) / 100 / 12
  return monthlyRate * getMonthsActive(p)
}

// ── Status badge system ──

const getStatusLabel = (position: any) => {
  const status = position.Investor_Status
  const daysUntilMaturity = position.Maturity_Date
    ? Math.ceil((new Date(position.Maturity_Date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : null

  switch (status) {
    case 'Active':
      if (daysUntilMaturity !== null && daysUntilMaturity <= 90 && daysUntilMaturity > 0)
        return { label: 'Maturing Soon', color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' }
      return { label: 'Performing', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' }
    case 'Renewal In Progress':
      return { label: 'Renewal Pending', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-400' }
    case 'Renewed':
      return { label: 'Performing', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' }
    case 'Paid Out':
      return { label: 'Paid Out', color: 'bg-gray-100 text-gray-500', dot: 'bg-gray-400' }
    case 'Legal':
      return { label: 'In Legal', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' }
    default:
      if (position.Deal_Status_Investor === 'Matured')
        return { label: 'Paid Out', color: 'bg-gray-100 text-gray-500', dot: 'bg-gray-400' }
      return { label: 'Performing', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' }
  }
}

type TabKey = 'all' | 'performing' | 'renewal_pending' | 'paid_out' | 'legal'

export default function InvestorDashboard() {
  const router = useRouter();
  const { user } = useUser();
  const [positions, setPositions] = useState<any[]>([]);
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('all');

  useEffect(() => {
    fetch('/api/portal/investor/positions')
      .then(async (res) => {
        const data = await res.json()
        if (data.setup_pending || data.setup_required) { setSetupRequired(true); setPositions(data.data || []) }
        else if (data.error) { setError(data.error) }
        else { setPositions(data.data || []) }
      })
      .catch((err) => setError(err.message ?? 'Failed to load portfolio'))
      .finally(() => setLoading(false))
  }, []);

  useEffect(() => {
    fetch('/api/portal/investor/opportunities')
      .then(r => r.json())
      .then(data => setOpportunities((data.data || []).slice(0, 2)))
      .catch(() => {})
  }, []);

  const quickActions = [
    { icon: Search, label: 'Browse Opportunities', href: '/portal/investor/opportunities' },
    { icon: Download, label: 'Download Statements', href: '/portal/investor/statements' },
    { icon: MessageSquare, label: 'Contact Support', href: '/portal/investor/support' },
  ];

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24">
      <div className="w-8 h-8 border-4 border-lime border-t-transparent rounded-full animate-spin mb-4" />
      <p className="font-body text-gray-500">Loading your portfolio...</p>
    </div>
  );
  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
      <h2 className="font-heading text-navy text-lg mb-2">Something went wrong</h2>
      <p className="font-body text-gray-600">{error}</p>
    </div>
  );
  if (setupRequired) return (
    <div className="bg-lime/10 border border-lime/30 rounded-xl p-6 text-center">
      <h2 className="font-heading text-navy text-lg mb-2">Portfolio Setup Pending</h2>
      <p className="font-body text-gray-600">Contact Michael at{' '}
        <a href="mailto:mfox@foxmortgage.ca" className="text-lime font-semibold hover:underline">mfox@foxmortgage.ca</a> to complete setup.</p>
    </div>
  );

  // ── Investor_Status-driven calculations ──
  const activePositions = positions.filter(p => isIncomeActive(p))
  const paidOutPositions = positions.filter(p => p.Investor_Status === 'Paid Out' || (!p.Investor_Status && p.Deal_Status_Investor === 'Matured'))
  const legalPositions = positions.filter(p => p.Investor_Status === 'Legal')

  const totalMonthlyIncome = positions.reduce((sum, p) => sum + getMonthlyIncome(p), 0)
  const totalDeployed = activePositions.reduce((sum, p) => sum + (Number(p.Investor_Amount) || 0), 0)
  const avgRate = activePositions.length > 0
    ? activePositions.reduce((sum, p) => sum + (Number(p.Investor_Rate) || 0), 0) / activePositions.length : 0
  const totalInterestEarned = positions.reduce((sum, p) => sum + getInterestEarned(p), 0)
  const totalLenderFees = positions.reduce((sum, p) => sum + (Number(p.Lender_Fee) || 0), 0)
  const totalReturn = totalInterestEarned + totalLenderFees
  const annualProjected = totalMonthlyIncome * 12
  const unallocatedCapital = 0

  const stats = [
    { icon: DollarSign, value: formatCurrency(totalDeployed), label: 'Total Deployed', sub: `Across ${activePositions.length} active position${activePositions.length !== 1 ? 's' : ''}` },
    { icon: TrendingUp, value: formatCurrency(totalInterestEarned), label: 'Interest Earned', sub: 'All time' },
    { icon: Percent, value: `${avgRate.toFixed(1)}%`, label: 'Avg Return', sub: 'Active positions' },
    { icon: Wallet, value: formatCurrency(totalMonthlyIncome), label: 'Monthly Income', sub: 'Current run rate' },
    { icon: CircleDollarSign, value: formatCurrency(unallocatedCapital), label: 'Unallocated', sub: 'Available to deploy' },
  ];

  // Tab filtering
  function matchesTab(p: any, tab: TabKey) {
    const st = getStatusLabel(p)
    if (tab === 'performing') return st.label === 'Performing' || st.label === 'Maturing Soon'
    if (tab === 'renewal_pending') return st.label === 'Renewal Pending'
    if (tab === 'paid_out') return st.label === 'Paid Out'
    if (tab === 'legal') return st.label === 'In Legal'
    return true
  }
  const getTabCount = (tab: TabKey) => tab === 'all' ? positions.length : positions.filter(p => matchesTab(p, tab)).length
  const filteredPositions = activeTab === 'all' ? positions : positions.filter(p => matchesTab(p, activeTab))

  const allTabs: { key: TabKey; label: string; hideIfZero?: boolean }[] = [
    { key: 'all', label: 'All Loans' },
    { key: 'performing', label: 'Performing' },
    { key: 'renewal_pending', label: 'Renewal Pending' },
    { key: 'paid_out', label: 'Paid Out' },
    { key: 'legal', label: 'Legal', hideIfZero: true },
  ]
  const visibleTabs = allTabs.filter(t => !t.hideIfZero || getTabCount(t.key) > 0)

  // Time
  const hour = new Date().getHours()
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  const now = new Date()
  const nextFirst = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const formatMonthDay = (d: Date) => d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })

  // Cash Flow
  const cashFlow = (() => {
    const months: { month: string; payments: { property: string; amount: number; status: string }[]; total: number }[] = []
    for (let i = 0; i < 3; i++) {
      const payDate = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const key = payDate.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })
      const payments: { property: string; amount: number; status: string }[] = []
      let total = 0
      positions.forEach(p => {
        const mi = getMonthlyIncome(p)
        if (mi <= 0) return
        payments.push({ property: p.Street || 'Property', amount: mi, status: i === 0 ? 'Scheduled' : 'Upcoming' })
        total += mi
      })
      if (payments.length > 0) months.push({ month: key, payments, total })
    }
    return months
  })()

  // Insights
  const insights: { icon: string; title: string; sub: string; color: string; textColor: string }[] = []
  if (activePositions.length > 0 && activePositions.every(p => getStatusLabel(p).label === 'Performing'))
    insights.push({ icon: '✅', title: '100% of active loans are performing', sub: 'All positions on schedule', color: 'border-green-200 bg-green-50', textColor: 'text-green-800' })
  const ltvVals = positions.filter(p => p.LTV).map(p => Number(p.LTV))
  const maxLTV = ltvVals.length > 0 ? Math.max(...ltvVals) : 0
  if (maxLTV > 0) insights.push({ icon: '🏠', title: `Max LTV exposure: ${maxLTV}%`, sub: maxLTV <= 75 ? 'Within conservative thresholds' : 'Approaching lending limits', color: maxLTV <= 75 ? 'border-blue-200 bg-blue-50' : 'border-yellow-200 bg-yellow-50', textColor: maxLTV <= 75 ? 'text-blue-800' : 'text-yellow-800' })
  if (positions.some(p => p.Mortgage_Type === 'First') && positions.some(p => p.Mortgage_Type === 'Second'))
    insights.push({ icon: '📊', title: 'Diversified across 1st and 2nd positions', sub: 'Balanced risk profile', color: 'border-purple-200 bg-purple-50', textColor: 'text-purple-800' })
  const maturingSoon = positions.filter(p => { if (!p.Maturity_Date) return false; const d = (new Date(p.Maturity_Date).getTime() - now.getTime()) / (1000*60*60*24); return d > 0 && d <= 90 })
  if (maturingSoon.length > 0) insights.push({ icon: '⏰', title: `${maturingSoon.length} position${maturingSoon.length > 1 ? 's' : ''} maturing within 90 days`, sub: maturingSoon.map(p => p.Street).join(', '), color: 'border-yellow-200 bg-yellow-50', textColor: 'text-yellow-800' })
  if (totalMonthlyIncome > 0) insights.push({ icon: '💰', title: `On track to earn ${formatCurrency(annualProjected)} this year`, sub: `${formatCurrency(totalMonthlyIncome)}/month run rate`, color: 'border-lime/30 bg-lime/5', textColor: 'text-navy' })

  // Banner sub-text
  const bannerSub = `${activePositions.length} active position${activePositions.length !== 1 ? 's' : ''} · ${formatCurrency(totalDeployed)} deployed${paidOutPositions.length > 0 ? ` · ${paidOutPositions.length} paid out` : ''}`

  return (
    <div>
      {/* Insight Banner */}
      <div className="bg-navy rounded-xl p-5 mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-gray-400 text-sm font-body">Good {timeOfDay}, {user?.firstName || 'there'}</p>
          <p className="font-heading text-white text-xl font-bold mt-0.5">
            Your portfolio is generating {formatCurrency(totalMonthlyIncome)}/month at a {avgRate.toFixed(1)}% average return
          </p>
          <p className="text-gray-400 text-sm mt-1 font-body">Projected annual income: {formatCurrency(annualProjected)}</p>
          <p className="text-gray-500 text-xs mt-0.5 font-body">{bannerSub}</p>
        </div>
        {activePositions.length > 0 && (
          <div className="text-right shrink-0">
            <p className="text-gray-400 text-xs font-body uppercase tracking-wider">Next Payment</p>
            <p className="text-lime font-heading font-bold text-lg">{formatMonthDay(nextFirst)}, {nextFirst.getFullYear()} · {formatCurrency(totalMonthlyIncome)}</p>
            <span className="bg-lime/20 text-lime text-xs px-2 py-0.5 rounded-full font-body">Scheduled</span>
          </div>
        )}
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {stats.map((stat, i) => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow">
            <stat.icon className="w-5 h-5 text-lime mb-2" />
            <p className={`font-heading text-2xl ${i === 4 && unallocatedCapital > 0 ? 'text-lime' : 'text-navy'}`}>{stat.value}</p>
            <p className="text-gray-500 text-sm font-body">{stat.label}</p>
            <p className="text-gray-400 text-xs mt-1 font-body">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Loan Details */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-heading text-navy text-2xl">Loan Details</h3>
          <Link href="/portal/investor/portfolio" className="text-lime text-sm font-semibold hover:underline">View All →</Link>
        </div>
        <div className="flex gap-6 border-b border-gray-200 mb-4 overflow-x-auto">
          {visibleTabs.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={['pb-3 text-sm font-body cursor-pointer whitespace-nowrap transition-colors',
                activeTab === tab.key ? 'text-lime border-b-2 border-lime font-semibold' : 'text-gray-500 hover:text-navy'].join(' ')}>
              {tab.label}
              <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full ml-1.5">{getTabCount(tab.key)}</span>
            </button>
          ))}
        </div>
        {filteredPositions.length === 0 ? (
          <p className="font-body text-gray-500 text-center py-8">No loans in this category.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500 text-xs uppercase tracking-wider">
                  <th className="text-left py-3 font-medium">Property</th>
                  <th className="text-left py-3 font-medium">Type</th>
                  <th className="text-left py-3 font-medium">Invested</th>
                  <th className="text-left py-3 font-medium">Rate</th>
                  <th className="text-left py-3 font-medium">Monthly Int.</th>
                  <th className="text-left py-3 font-medium">Lender Fee</th>
                  <th className="text-left py-3 font-medium">Maturity</th>
                  <th className="text-left py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="font-body">
                {filteredPositions.map((pos) => {
                  const mi = ((Number(pos.Investor_Amount) || 0) * (Number(pos.Investor_Rate) || 0)) / 100 / 12;
                  const matFmt = pos.Maturity_Date ? new Date(pos.Maturity_Date).toLocaleDateString('en-CA', { month: 'short', year: 'numeric' }) : '—';
                  const status = getStatusLabel(pos);
                  return (
                    <tr key={pos.id} onClick={() => router.push(`/portal/investor/portfolio/${pos.id}`)}
                        className="border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors">
                      <td className="py-3 text-navy font-medium">{pos.Street}{pos.City ? `, ${pos.City}` : ''}</td>
                      <td className="py-3 text-gray-600">{pos.Mortgage_Type} Mortgage</td>
                      <td className="py-3 font-heading text-navy">{formatCurrency(Number(pos.Investor_Amount) || 0)}</td>
                      <td className="py-3 text-navy">{pos.Investor_Rate}%</td>
                      <td className="py-3 text-navy">{formatCurrency(mi)}</td>
                      <td className="py-3 text-gray-600">{pos.Lender_Fee ? formatCurrency(Number(pos.Lender_Fee)) : '—'}</td>
                      <td className="py-3 text-gray-600">{matFmt}</td>
                      <td className="py-3">
                        <span className={`${status.color} rounded-full px-3 py-1 text-xs font-medium flex items-center gap-1.5 w-fit`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                          {status.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* All-Time Returns */}
      <div className="mb-6">
        <div className="mb-4">
          <h3 className="font-heading text-navy text-2xl">All-Time Returns</h3>
          <p className="text-gray-400 text-xs font-body">Cumulative returns across all positions including matured deals</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow">
            <p className="font-heading text-2xl text-navy">{formatCurrency(totalInterestEarned)}</p>
            <p className="text-gray-500 text-sm font-body">Total Interest Earned</p>
            <p className="text-gray-400 text-xs mt-1 font-body">Based on payment history</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow">
            <p className="font-heading text-2xl text-navy">{formatCurrency(totalLenderFees)}</p>
            <p className="text-gray-500 text-sm font-body">Total Lender Fees Earned</p>
            <p className="text-gray-400 text-xs mt-1 font-body">One-time origination fees</p>
          </div>
          <div className="bg-navy rounded-xl p-5">
            <p className="font-heading text-2xl text-lime">{formatCurrency(totalReturn)}</p>
            <p className="text-gray-300 text-sm font-body">Total Return</p>
            <p className="text-gray-400 text-xs mt-1 font-body">Interest + fees combined</p>
          </div>
        </div>

        {/* Paid Out summary */}
        {paidOutPositions.length > 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mt-4">
            <div className="flex items-start gap-3">
              <span className="text-lg">📋</span>
              <div>
                <p className="font-body font-semibold text-sm text-gray-700">
                  {paidOutPositions.length} position{paidOutPositions.length !== 1 ? 's' : ''} paid out at maturity
                </p>
                <p className="text-gray-500 text-xs mt-0.5 font-body">
                  {paidOutPositions.map(p =>
                    `${p.Street}, ${p.City} (paid out ${p.Investor_Payout_Date ? new Date(p.Investor_Payout_Date).toLocaleDateString('en-CA', { month: 'short', year: 'numeric' }) : p.Maturity_Date ? new Date(p.Maturity_Date).toLocaleDateString('en-CA', { month: 'short', year: 'numeric' }) : 'at maturity'})`
                  ).join(' · ')} · Capital returned to investor
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Legal alert */}
        {legalPositions.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mt-4">
            <div className="flex items-start gap-3">
              <span className="text-lg">⚠️</span>
              <div>
                <p className="font-body font-semibold text-sm text-red-700">
                  {legalPositions.length} position in legal proceedings
                </p>
                <p className="text-gray-500 text-xs mt-0.5 font-body">
                  {legalPositions.map(p => p.Street).join(', ')} · Contact Michael Fox for status update
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Portfolio Insights */}
      {insights.length > 0 && (
        <div className="mb-6">
          <div className="mb-3">
            <h3 className="font-heading text-navy text-2xl">Portfolio Insights</h3>
            <p className="text-gray-400 text-xs font-body">Auto-generated from your live deal data</p>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {insights.map((insight, i) => (
              <div key={i} className={`border rounded-xl p-4 ${insight.color}`}>
                <div className="flex items-start gap-3">
                  <span className="text-xl">{insight.icon}</span>
                  <div>
                    <p className={`font-body font-semibold text-sm ${insight.textColor}`}>{insight.title}</p>
                    <p className="text-gray-500 text-xs mt-0.5 font-body">{insight.sub}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Available Opportunities */}
      {opportunities.length > 0 && (
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-heading text-navy text-2xl">Available Opportunities</h3>
            <Link href="/portal/investor/opportunities" className="text-lime text-sm font-semibold hover:underline">View All →</Link>
          </div>
          <div className={`grid ${opportunities.length > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'} gap-4`}>
            {opportunities.map((opp, i) => (
              <div key={opp.id || i} onClick={() => router.push('/portal/investor/opportunities')}
                   className="bg-white rounded-xl border-2 border-lime/30 p-5 hover:border-lime cursor-pointer transition-colors hover:shadow-sm">
                <div className="flex justify-between items-start">
                  <span className="text-gray-400 text-xs font-mono">{opp.Deal_Name}</span>
                  <span className="bg-lime text-navy font-heading font-bold text-lg px-3 py-1 rounded-lg">{opp.Investor_Rate || opp.Mortgage_Rate}%</span>
                </div>
                <p className="text-navy font-semibold text-sm mt-2">{opp.Mortgage_Type} Mortgage</p>
                <p className="text-gray-500 text-sm">{opp.City}{opp.Province ? `, ${opp.Province}` : ''}</p>
                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-100">
                  <div><p className="text-navy font-semibold text-sm">{formatCurrency(Number(opp.Amount) || 0)}</p><p className="text-gray-400 text-xs">Loan Amount</p></div>
                  <div><p className="text-navy font-semibold text-sm">{opp.LTV || '—'}%</p><p className="text-gray-400 text-xs">LTV</p></div>
                  <div><p className="text-navy font-semibold text-sm">{opp.Payment_Amount ? formatCurrency(Number(opp.Payment_Amount)) : '—'}</p><p className="text-gray-400 text-xs">/mo</p></div>
                </div>
                <p className="text-lime text-sm font-semibold mt-3">Express Interest →</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cash Flow Timeline */}
      {cashFlow.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 className="font-heading text-navy text-2xl mb-4">Cash Flow Timeline</h3>
          <div className="space-y-4">
            {cashFlow.map((month, mi) => (
              <div key={mi}>
                <div className="flex justify-between items-center py-2 border-b border-gray-100">
                  <span className="font-heading text-navy text-sm font-semibold">{month.month}</span>
                  <span className="text-lime font-semibold text-sm font-body">Total: {formatCurrency(month.total)}</span>
                </div>
                {month.payments.map((payment, pi) => (
                  <div key={pi} className="flex justify-between items-center py-2.5 pl-4 border-b border-gray-50">
                    <span className="text-gray-600 text-sm font-body">{payment.property}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-navy font-semibold text-sm font-body">{formatCurrency(payment.amount)}</span>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${payment.status === 'Scheduled' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>{payment.status}</span>
                    </div>
                  </div>
                ))}
                <div className="bg-lime/5 rounded-lg py-2 px-4 mt-1 flex justify-between">
                  <span className="text-gray-500 text-xs font-body">Month total</span>
                  <span className="text-navy font-semibold text-xs font-body">{formatCurrency(month.total)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-4">
        {quickActions.map((action) => (
          <Link key={action.label} href={action.href}
            className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col items-center gap-3 hover:border-lime hover:shadow-sm transition-all text-center">
            <action.icon className="w-6 h-6 text-lime" />
            <span className="font-body text-navy text-sm font-medium">{action.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
