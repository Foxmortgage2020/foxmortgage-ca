'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import { Search, Download, MessageSquare, TrendingUp, DollarSign, Percent, Wallet } from 'lucide-react';

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n);

type TabKey = 'all' | 'funded' | 'in_progress' | 'paid_off' | 'terminated'

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
          <a href="mailto:mfox@foxmortgage.ca" className="text-lime font-semibold hover:underline">
            mfox@foxmortgage.ca
          </a>{' '}
          to complete setup.
        </p>
      </div>
    );
  }

  // Computed stats
  const totalDeployed = positions.reduce((sum, p) => sum + (Number(p.Investor_Amount) || 0), 0);
  const totalLenderFees = positions.reduce((sum, p) => sum + (Number(p.Lender_Fee) || 0), 0);
  const weightedAvgReturn =
    positions.length > 0
      ? positions.reduce((sum, p) => sum + (Number(p.Investor_Rate) || 0), 0) / positions.length
      : 0;
  const totalMonthly = positions.reduce(
    (sum, p) => sum + ((Number(p.Investor_Amount) || 0) * (Number(p.Investor_Rate) || 0)) / 100 / 12,
    0
  );

  // All-time interest earned per position
  const positionReturns = positions.map((p) => {
    const start = p.First_Payment_Date
      ? new Date(p.First_Payment_Date)
      : p.Closing_Date ? new Date(p.Closing_Date) : new Date();
    const end = p.Maturity_Date && new Date(p.Maturity_Date) < new Date()
      ? new Date(p.Maturity_Date) : new Date();
    const monthsActive = Math.max(0, Math.round(
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30)
    ));
    const interestEarned = ((Number(p.Investor_Amount) || 0) * (Number(p.Investor_Rate) || 0) / 100 / 12) * monthsActive;
    return { ...p, monthsActive, interestEarned };
  });
  const totalInterestEarned = positionReturns.reduce((sum, p) => sum + p.interestEarned, 0);
  const totalReturn = totalInterestEarned + totalLenderFees;

  const stats = [
    { icon: DollarSign, value: formatCurrency(totalDeployed), label: 'Total Deployed', sub: `Across ${positions.length} position${positions.length !== 1 ? 's' : ''}` },
    { icon: TrendingUp, value: formatCurrency(totalInterestEarned), label: 'Interest Earned', sub: 'All time estimated' },
    { icon: Percent, value: `${weightedAvgReturn.toFixed(1)}%`, label: 'Weighted Avg Return', sub: 'Across portfolio' },
    { icon: Wallet, value: formatCurrency(totalMonthly), label: 'Monthly Income', sub: 'Current run rate' },
  ];

  // Tab filtering
  const getTabCount = (tab: TabKey) => {
    if (tab === 'all') return positions.length;
    return positions.filter(p => matchesTab(p, tab)).length;
  };

  function matchesTab(p: any, tab: TabKey) {
    const stage = p.Stage || '';
    if (tab === 'funded') return stage === 'Mortgage Funded';
    if (tab === 'in_progress') return ['Submitted to Lender', 'Conditionally Approved', 'Underwriting In Progress', 'Broker Complete', 'Application Pending'].some(s => stage.includes(s));
    if (tab === 'paid_off') return stage.includes('Discharged') || stage.includes('Paid');
    if (tab === 'terminated') return stage.includes('Lost') || stage.includes('Terminated') || stage.includes('Cancelled');
    return true;
  }

  const filteredPositions = activeTab === 'all' ? positions : positions.filter(p => matchesTab(p, activeTab));

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'all', label: 'All Loans' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'funded', label: 'Funded' },
    { key: 'paid_off', label: 'Paid Off' },
    { key: 'terminated', label: 'Terminated' },
  ];

  // Upcoming payments
  const now = new Date();
  const nextFirst = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const followingFirst = new Date(now.getFullYear(), now.getMonth() + 2, 1);
  const formatMonthDay = (d: Date) =>
    d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });

  const payments = positions.flatMap((p) => {
    const monthlyInterest = ((Number(p.Investor_Amount) || 0) * (Number(p.Investor_Rate) || 0)) / 100 / 12;
    const street = p.Street ?? 'Property';
    return [
      { date: formatMonthDay(nextFirst), property: street, amount: formatCurrency(monthlyInterest), status: 'Scheduled', color: 'blue' },
      { date: formatMonthDay(followingFirst), property: street, amount: formatCurrency(monthlyInterest), status: 'Upcoming', color: 'gray' },
    ];
  });

  return (
    <div>
      {/* Welcome Bar */}
      <div className="bg-lime/10 border border-lime/30 rounded-xl p-4 mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-heading text-navy text-lg">
            Welcome back, {user?.firstName || 'there'}
          </h2>
          <p className="text-gray-500 text-sm font-body">Private Investor · Fox Mortgage Portal</p>
        </div>
        {positions.length > 0 && (
          <div className="text-navy font-semibold text-sm font-body">
            Next Payment: {formatMonthDay(nextFirst)}, {nextFirst.getFullYear()} · {formatCurrency(totalMonthly)}
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

      {/* Loan Details */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-heading text-navy text-lg">Loan Details</h3>
          <Link href="/portal/investor/portfolio" className="text-lime text-sm font-semibold hover:underline">
            View All →
          </Link>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-6 border-b border-gray-200 mb-4">
          {tabs.map((tab) => {
            const count = getTabCount(tab.key);
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={[
                  'pb-3 text-sm font-body cursor-pointer whitespace-nowrap transition-colors',
                  isActive ? 'text-lime border-b-2 border-lime font-semibold' : 'text-gray-500 hover:text-navy',
                ].join(' ')}
              >
                {tab.label}
                <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full ml-1.5">
                  {count}
                </span>
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
                  const monthlyInterest =
                    ((Number(pos.Investor_Amount) || 0) * (Number(pos.Investor_Rate) || 0)) / 100 / 12;
                  const maturityFormatted = pos.Maturity_Date
                    ? new Date(pos.Maturity_Date).toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })
                    : '—';
                  const stage = pos.Stage || 'Unknown';
                  const stageBadge = stage === 'Mortgage Funded'
                    ? 'bg-green-100 text-green-800'
                    : stage.includes('Lost') || stage.includes('Terminated')
                      ? 'bg-red-100 text-red-800'
                      : stage.includes('Discharged') || stage.includes('Paid')
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-yellow-100 text-yellow-800';
                  return (
                    <tr
                      key={pos.id}
                      onClick={() => router.push(`/portal/investor/portfolio/${pos.id}`)}
                      className="border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-3 text-navy font-medium">
                        {pos.Street}{pos.City ? `, ${pos.City}` : ''}
                      </td>
                      <td className="py-3 text-gray-600">{pos.Mortgage_Type} Mortgage</td>
                      <td className="py-3 font-heading text-navy">{formatCurrency(Number(pos.Investor_Amount) || 0)}</td>
                      <td className="py-3 text-navy">{pos.Investor_Rate}%</td>
                      <td className="py-3 text-navy">{formatCurrency(monthlyInterest)}</td>
                      <td className="py-3 text-gray-600">{pos.Lender_Fee ? formatCurrency(Number(pos.Lender_Fee)) : '—'}</td>
                      <td className="py-3 text-gray-600">{maturityFormatted}</td>
                      <td className="py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${stageBadge}`}>
                          {stage === 'Mortgage Funded' ? 'Funded' : stage}
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
            <p className="font-heading text-2xl text-navy">{weightedAvgReturn.toFixed(1)}%</p>
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

      {/* Upcoming Payments */}
      {payments.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 className="font-heading text-navy text-lg mb-4">Upcoming Payments</h3>
          <div className="space-y-3">
            {payments.map((payment, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-4">
                  <span className="text-gray-500 text-sm w-16 font-body">{payment.date}</span>
                  <span className="text-navy text-sm font-medium font-body">{payment.property}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-heading text-navy">{payment.amount}</span>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      payment.color === 'blue'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {payment.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-4">
        {quickActions.map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col items-center gap-3 hover:border-lime transition-colors text-center"
          >
            <action.icon className="w-6 h-6 text-lime" />
            <span className="font-body text-navy text-sm font-medium">{action.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
