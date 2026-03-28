'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, Download, MessageSquare, TrendingUp, DollarSign, Percent, Wallet } from 'lucide-react';

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n);

export default function InvestorDashboard() {
  const router = useRouter();
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);

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
  const monthsThisYear = new Date().getMonth() + 1;
  const interestEarnedYTD = positions.reduce(
    (sum, p) => sum + ((Number(p.Investor_Amount) || 0) * (Number(p.Investor_Rate) || 0) / 100) * (monthsThisYear / 12),
    0
  );
  const weightedAvgReturn =
    positions.length > 0
      ? positions.reduce((sum, p) => sum + (Number(p.Investor_Rate) || 0), 0) / positions.length
      : 0;
  const activeCount = positions.length;

  const stats = [
    { icon: DollarSign, value: formatCurrency(totalDeployed), label: 'Total Deployed', sub: `Across ${activeCount} active position${activeCount !== 1 ? 's' : ''}` },
    { icon: TrendingUp, value: formatCurrency(interestEarnedYTD), label: 'Interest Earned YTD', sub: `${weightedAvgReturn.toFixed(1)}% annualized avg` },
    { icon: Percent, value: `${weightedAvgReturn.toFixed(1)}%`, label: 'Weighted Avg Return', sub: 'Across portfolio' },
    { icon: Wallet, value: activeCount.toString(), label: 'Active Positions', sub: 'Current investments' },
  ];

  // Upcoming payments — next 1st of month for each position
  const now = new Date();
  const nextFirst = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const followingFirst = new Date(now.getFullYear(), now.getMonth() + 2, 1);
  const formatMonthDay = (d: Date) =>
    d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });

  const payments = positions.flatMap((p) => {
    const monthlyInterest = ((Number(p.Investor_Amount) || 0) * (Number(p.Investor_Rate) || 0)) / 100 / 12;
    const street = p.Street ?? p.address ?? 'Property';
    return [
      { date: formatMonthDay(nextFirst), property: street, amount: formatCurrency(monthlyInterest), status: 'Scheduled', color: 'blue' },
      { date: formatMonthDay(followingFirst), property: street, amount: formatCurrency(monthlyInterest), status: 'Upcoming', color: 'gray' },
    ];
  });

  // Next payment total for welcome bar
  const totalMonthly = positions.reduce(
    (sum, p) => sum + ((Number(p.Investor_Amount) || 0) * (Number(p.Investor_Rate) || 0)) / 100 / 12,
    0
  );

  return (
    <div>
      {/* Welcome Bar */}
      <div className="bg-lime/10 border border-lime/30 rounded-xl p-4 mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-heading text-navy text-lg">Welcome back</h2>
          <p className="text-gray-500 text-sm font-body">Private Investor · Fox Mortgage Portal</p>
        </div>
        {positions.length > 0 && (
          <div className="text-lime font-semibold text-sm font-body">
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

      {/* Active Positions */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-navy text-lg">Active Positions</h3>
          <Link href="/portal/investor/portfolio" className="text-lime text-sm font-semibold hover:underline">
            View All →
          </Link>
        </div>
        {positions.length === 0 ? (
          <p className="font-body text-gray-500 text-center py-8">No active positions yet.</p>
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
                  <th className="text-left py-3 font-medium">Maturity</th>
                  <th className="text-left py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="font-body">
                {positions.map((pos) => {
                  const monthlyInterest =
                    ((Number(pos.Investor_Amount) || 0) * (Number(pos.Investor_Rate) || 0)) / 100 / 12;
                  const maturityFormatted = pos.Maturity_Date
                    ? new Date(pos.Maturity_Date).toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })
                    : '—';
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
                      <td className="py-3 text-gray-600">{maturityFormatted}</td>
                      <td className="py-3">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Active
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
