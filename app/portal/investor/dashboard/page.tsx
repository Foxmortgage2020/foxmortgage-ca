'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import { Search, Download, MessageSquare, TrendingUp, DollarSign, Percent, Wallet } from 'lucide-react';

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n);

type TabKey = 'all' | 'performing' | 'in_progress' | 'matured' | 'paid_out'

// Smart status labels
const getStatusLabel = (position: any) => {
  const stage = position.Stage || ''
  const maturityDate = position.Maturity_Date ? new Date(position.Maturity_Date) : null
  const isMatured = maturityDate && maturityDate < new Date()

  if (isMatured && stage === 'Mortgage Funded') return { label: 'Matured', color: 'bg-gray-100 text-gray-600' }
  if (stage === 'Mortgage Funded') return { label: 'Performing', color: 'bg-green-100 text-green-700' }
  if (['Submitted to Lender', 'Conditionally Approved', 'Underwriting In Progress', 'Broker Complete', 'Application Pending'].some(s => stage.includes(s)))
    return { label: 'In Progress', color: 'bg-blue-100 text-blue-700' }
  if (stage.includes('Discharged') || stage.includes('Paid'))
    return { label: 'Paid Out', color: 'bg-purple-100 text-purple-700' }
  if (stage.includes('Lost') || stage.includes('Terminated') || stage.includes('Cancelled'))
    return { label: 'Terminated', color: 'bg-red-100 text-red-700' }
  return { label: 'On Schedule', color: 'bg-green-100 text-green-700' }
}

export default function InvestorDashboard() {
  const router = useRouter();
  const { user } = useUser();
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('all');

  useEffect(() => {
    fetch('/api/portal/investor/positions')
      .then(async (res) => {
        const data = await res.json()
        if (data.setup_pending || data.setup_required) {
          setSetupRequired(true)
          setPositions(data.data || [])
        } else if (data.error) {
          setError(data.error)
        } else {
          setPositions(data.data || [])
        }
      })
      .catch((err) => setError(err.message ?? 'Failed to load portfolio'))
      .finally(() => setLoading(false))
  }, []);

  const quickActions = [
    { icon: Search, label: 'Browse Opportunities', href: '/portal/investor/opportunities' },
    { icon: Download, label: 'Download Statements', href: '/portal/investor/statements' },
    { icon: MessageSquare, label: 'Contact Support', href: '/portal/investor/support' },
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-lime border-t-transparent rounded-full animate-spin mb-4" />
        <p className="font-body text-gray-500">Loading your portfolio...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <h2 className="font-heading text-navy text-lg mb-2">Something went wrong</h2>
        <p className="font-body text-gray-600">{error}</p>
      </div>
    );
  }

  if (setupRequired) {
    return (
      <div className="bg-lime/10 border border-lime/30 rounded-xl p-6 text-center">
        <h2 className="font-heading text-navy text-lg mb-2">Portfolio Setup Pending</h2>
        <p className="font-body text-gray-600">
          Your investor profile is being configured. Contact Michael at{' '}
          <a href="mailto:mfox@foxmortgage.ca" className="text-lime font-semibold hover:underline">mfox@foxmortgage.ca</a>{' '}
          to complete setup.
        </p>
      </div>
    );
  }

  // Computed stats
  const totalDeployed = positions.reduce((sum, p) => sum + (Number(p.Investor_Amount) || 0), 0);
  const totalLenderFees = positions.reduce((sum, p) => sum + (Number(p.Lender_Fee) || 0), 0);
  const avgRate = positions.length > 0
    ? positions.reduce((sum, p) => sum + (Number(p.Investor_Rate) || 0), 0) / positions.length
    : 0;
  const totalMonthly = positions.reduce(
    (sum, p) => sum + ((Number(p.Investor_Amount) || 0) * (Number(p.Investor_Rate) || 0)) / 100 / 12, 0
  );

  // All-time interest earned
  const positionReturns = positions.map((p) => {
    const start = p.First_Payment_Date ? new Date(p.First_Payment_Date) : p.Closing_Date ? new Date(p.Closing_Date) : new Date();
    const end = p.Maturity_Date && new Date(p.Maturity_Date) < new Date() ? new Date(p.Maturity_Date) : new Date();
    const monthsActive = Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30)));
    const interestEarned = ((Number(p.Investor_Amount) || 0) * (Number(p.Investor_Rate) || 0) / 100 / 12) * monthsActive;
    return { ...p, monthsActive, interestEarned };
  });
  const totalInterestEarned = positionReturns.reduce((sum, p) => sum + p.interestEarned, 0);
  const totalReturn = totalInterestEarned + totalLenderFees;

  const stats = [
    { icon: DollarSign, value: formatCurrency(totalDeployed), label: 'Total Deployed', sub: `Across ${positions.length} position${positions.length !== 1 ? 's' : ''}` },
    { icon: TrendingUp, value: formatCurrency(totalInterestEarned), label: 'Interest Earned', sub: 'All time estimated' },
    { icon: Percent, value: `${avgRate.toFixed(1)}%`, label: 'Weighted Avg Return', sub: 'Across portfolio' },
    { icon: Wallet, value: formatCurrency(totalMonthly), label: 'Monthly Income', sub: 'Current run rate' },
  ];

  // Tab filtering with smart status
  function matchesTab(p: any, tab: TabKey) {
    const status = getStatusLabel(p)
    if (tab === 'performing') return status.label === 'Performing' || status.label === 'On Schedule'
    if (tab === 'in_progress') return status.label === 'In Progress'
    if (tab === 'matured') return status.label === 'Matured'
    if (tab === 'paid_out') return status.label === 'Paid Out'
    return true
  }
  const getTabCount = (tab: TabKey) => tab === 'all' ? positions.length : positions.filter(p => matchesTab(p, tab)).length;
  const filteredPositions = activeTab === 'all' ? positions : positions.filter(p => matchesTab(p, activeTab));

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'all', label: 'All Loans' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'performing', label: 'Performing' },
    { key: 'matured', label: 'Matured' },
    { key: 'paid_out', label: 'Paid Out' },
  ];

  // Time of day greeting
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

  // Next payment date
  const now = new Date();
  const nextFirst = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const formatMonthDay = (d: Date) => d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });

  // Cash Flow Timeline — next 3 months
  const generateCashFlow = () => {
    const months: { month: string; payments: { property: string; amount: number; status: string }[]; total: number }[] = []
    const today = new Date()
    for (let i = 0; i < 3; i++) {
      const payDate = new Date(today.getFullYear(), today.getMonth() + i, 1)
      const key = payDate.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })
      const monthPayments: { property: string; amount: number; status: string }[] = []
      let monthTotal = 0
      positions.forEach(position => {
        const monthlyInt = ((Number(position.Investor_Amount) || 0) * (Number(position.Investor_Rate) || 0)) / 100 / 12
        if (monthlyInt <= 0) return
        monthPayments.push({
          property: position.Street || 'Property',
          amount: monthlyInt,
          status: i === 0 ? 'Scheduled' : 'Upcoming'
        })
        monthTotal += monthlyInt
      })
      if (monthPayments.length > 0) {
        months.push({ month: key, payments: monthPayments, total: monthTotal })
      }
    }
    return months
  }
  const cashFlow = generateCashFlow()

  // Portfolio Insights
  const insights: { icon: string; title: string; sub: string; color: string; textColor: string }[] = []

  const allPerforming = positions.length > 0 && positions.every(p => getStatusLabel(p).label === 'Performing' || getStatusLabel(p).label === 'On Schedule')
  if (allPerforming) {
    insights.push({ icon: '✅', title: '100% of loans are currently performing', sub: 'All positions are active and on schedule', color: 'border-green-200 bg-green-50', textColor: 'text-green-800' })
  }

  const ltvValues = positions.filter(p => p.LTV).map(p => Number(p.LTV))
  const maxLTV = ltvValues.length > 0 ? Math.max(...ltvValues) : 0
  if (maxLTV > 0) {
    insights.push({
      icon: '🏠', title: `Maximum LTV exposure is ${maxLTV}%`,
      sub: maxLTV <= 75 ? 'Well within conservative lending thresholds' : 'Monitor — approaching typical lending limits',
      color: maxLTV <= 75 ? 'border-blue-200 bg-blue-50' : 'border-yellow-200 bg-yellow-50',
      textColor: maxLTV <= 75 ? 'text-blue-800' : 'text-yellow-800'
    })
  }

  const hasFirst = positions.some(p => p.Mortgage_Type === 'First')
  const hasSecond = positions.some(p => p.Mortgage_Type === 'Second')
  if (hasFirst && hasSecond) {
    insights.push({ icon: '📊', title: 'Diversified across 1st and 2nd mortgage positions', sub: 'Balanced risk profile across mortgage types', color: 'border-purple-200 bg-purple-50', textColor: 'text-purple-800' })
  }

  const maturingSoon = positions.filter(p => {
    if (!p.Maturity_Date) return false
    const daysUntil = (new Date(p.Maturity_Date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    return daysUntil > 0 && daysUntil <= 90
  })
  if (maturingSoon.length > 0) {
    insights.push({ icon: '⏰', title: `${maturingSoon.length} position${maturingSoon.length > 1 ? 's' : ''} maturing within 90 days`, sub: maturingSoon.map(p => p.Street).join(', '), color: 'border-yellow-200 bg-yellow-50', textColor: 'text-yellow-800' })
  }

  const annualProjected = totalMonthly * 12
  if (totalMonthly > 0) {
    insights.push({ icon: '💰', title: `On track to earn ${formatCurrency(annualProjected)} this year`, sub: `Based on current ${formatCurrency(totalMonthly)}/month run rate`, color: 'border-lime/30 bg-lime/5', textColor: 'text-navy' })
  }

  return (
    <div>
      {/* CHANGE 1: Portfolio Insight Banner */}
      <div className="bg-navy rounded-xl p-5 mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-gray-400 text-sm font-body">Good {timeOfDay}, {user?.firstName || 'there'}</p>
          <p className="font-heading text-white text-xl font-bold mt-0.5">
            Your portfolio is generating {formatCurrency(totalMonthly)}/month at a {avgRate.toFixed(1)}% average return
          </p>
          <p className="text-gray-400 text-sm mt-1 font-body">
            {positions.length} active position{positions.length !== 1 ? 's' : ''} · {formatCurrency(totalDeployed)} deployed
          </p>
        </div>
        {positions.length > 0 && (
          <div className="text-right shrink-0">
            <p className="text-gray-400 text-xs font-body uppercase tracking-wider">Next Payment</p>
            <p className="text-lime font-heading font-bold text-lg">
              {formatMonthDay(nextFirst)}, {nextFirst.getFullYear()} · {formatCurrency(totalMonthly)}
            </p>
            <span className="bg-lime/20 text-lime text-xs px-2 py-0.5 rounded-full font-body">Scheduled</span>
          </div>
        )}
      </div>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-6">
            <stat.icon className="w-5 h-5 text-lime mb-2" />
            <p className="font-heading text-2xl text-navy">{stat.value}</p>
            <p className="text-gray-500 text-sm font-body">{stat.label}</p>
            <p className="text-gray-400 text-xs mt-1 font-body">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Loan Details with status tabs */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-heading text-navy text-lg">Loan Details</h3>
          <Link href="/portal/investor/portfolio" className="text-lime text-sm font-semibold hover:underline">View All →</Link>
        </div>

        <div className="flex gap-6 border-b border-gray-200 mb-4 overflow-x-auto">
          {tabs.map((tab) => {
            const count = getTabCount(tab.key);
            const isActive = activeTab === tab.key;
            return (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={['pb-3 text-sm font-body cursor-pointer whitespace-nowrap transition-colors',
                  isActive ? 'text-lime border-b-2 border-lime font-semibold' : 'text-gray-500 hover:text-navy'].join(' ')}>
                {tab.label}
                <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full ml-1.5">{count}</span>
              </button>
            );
          })}
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
                  const monthlyInterest = ((Number(pos.Investor_Amount) || 0) * (Number(pos.Investor_Rate) || 0)) / 100 / 12;
                  const maturityFormatted = pos.Maturity_Date ? new Date(pos.Maturity_Date).toLocaleDateString('en-CA', { month: 'short', year: 'numeric' }) : '—';
                  const status = getStatusLabel(pos);
                  return (
                    <tr key={pos.id} onClick={() => router.push(`/portal/investor/portfolio/${pos.id}`)}
                        className="border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors">
                      <td className="py-3 text-navy font-medium">{pos.Street}{pos.City ? `, ${pos.City}` : ''}</td>
                      <td className="py-3 text-gray-600">{pos.Mortgage_Type} Mortgage</td>
                      <td className="py-3 font-heading text-navy">{formatCurrency(Number(pos.Investor_Amount) || 0)}</td>
                      <td className="py-3 text-navy">{pos.Investor_Rate}%</td>
                      <td className="py-3 text-navy">{formatCurrency(monthlyInterest)}</td>
                      <td className="py-3 text-gray-600">{pos.Lender_Fee ? formatCurrency(Number(pos.Lender_Fee)) : '—'}</td>
                      <td className="py-3 text-gray-600">{maturityFormatted}</td>
                      <td className="py-3">
                        <span className={`${status.color} rounded-full px-3 py-1 text-xs font-medium`}>{status.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Portfolio Performance */}
      <div className="mb-6">
        <div className="mb-4">
          <h3 className="font-heading text-navy text-xl">Portfolio Performance</h3>
          <p className="text-gray-400 text-xs font-body">Calculated from your Zoho deal records</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="font-heading text-2xl text-navy">{formatCurrency(totalDeployed)}</p>
            <p className="text-gray-500 text-sm font-body">Total Capital Deployed</p>
            <p className="text-gray-400 text-xs mt-1 font-body">All positions combined</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="font-heading text-2xl text-navy">{positions.length}</p>
            <p className="text-gray-500 text-sm font-body">Total Positions</p>
            <p className="text-gray-400 text-xs mt-1 font-body">Current + historical</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="font-heading text-2xl text-navy">{avgRate.toFixed(1)}%</p>
            <p className="text-gray-500 text-sm font-body">Avg Interest Rate</p>
            <p className="text-gray-400 text-xs mt-1 font-body">Across all deals</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="font-heading text-2xl text-navy">{formatCurrency(totalMonthly)}</p>
            <p className="text-gray-500 text-sm font-body">Monthly Income</p>
            <p className="text-gray-400 text-xs mt-1 font-body">Current run rate</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="font-heading text-2xl text-navy">{formatCurrency(totalInterestEarned)}</p>
            <p className="text-gray-500 text-sm font-body">Total Interest Earned</p>
            <p className="text-gray-400 text-xs mt-1 font-body">Based on payment history</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
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
      </div>

      {/* CHANGE 4: Portfolio Insights */}
      {insights.length > 0 && (
        <div className="mb-6">
          <div className="mb-3">
            <h3 className="font-heading text-navy text-xl">Portfolio Insights</h3>
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

      {/* CHANGE 3: Cash Flow Timeline */}
      {cashFlow.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 className="font-heading text-navy text-lg mb-4">Cash Flow Timeline</h3>
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
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        payment.status === 'Scheduled' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
                      }`}>{payment.status}</span>
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
            className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col items-center gap-3 hover:border-lime transition-colors text-center">
            <action.icon className="w-6 h-6 text-lime" />
            <span className="font-body text-navy text-sm font-medium">{action.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
