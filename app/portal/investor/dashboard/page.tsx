'use client';

import Link from 'next/link';
import { Search, Download, MessageSquare, TrendingUp, DollarSign, Percent, Wallet } from 'lucide-react';

export default function InvestorDashboard() {
  const stats = [
    { icon: DollarSign, value: '$750,000', label: 'Total Deployed', sub: 'Across 2 active positions' },
    { icon: TrendingUp, value: '$52,500', label: 'Interest Earned YTD', sub: '10.5% annualized avg' },
    { icon: Percent, value: '10.5%', label: 'Weighted Avg Return', sub: 'Across portfolio' },
    { icon: Wallet, value: '$0', label: 'Available to Deploy', sub: 'All capital invested' },
  ];

  const positions = [
    {
      id: '1',
      property: '142 Wellington St, Kitchener',
      position: '1st',
      invested: '$500,000',
      rate: '10.5%',
      monthly: '$4,375',
      maturity: 'Dec 2026',
      status: 'Active',
    },
    {
      id: '2',
      property: '88 King St, Guelph',
      position: '2nd',
      invested: '$250,000',
      rate: '13.0%',
      monthly: '$2,708',
      maturity: 'Jun 2026',
      status: 'Active',
    },
  ];

  const payments = [
    { date: 'Apr 1', property: '142 Wellington', amount: '$4,375', status: 'Scheduled', color: 'blue' },
    { date: 'Apr 1', property: '88 King', amount: '$2,708', status: 'Scheduled', color: 'blue' },
    { date: 'May 1', property: '142 Wellington', amount: '$4,375', status: 'Upcoming', color: 'gray' },
    { date: 'May 1', property: '88 King', amount: '$2,708', status: 'Upcoming', color: 'gray' },
  ];

  const quickActions = [
    { icon: Search, label: 'Browse Opportunities', href: '/portal/investor/opportunities' },
    { icon: Download, label: 'Download Statements', href: '/portal/investor/statements' },
    { icon: MessageSquare, label: 'Contact Support', href: '/portal/investor/support' },
  ];

  return (
    <div>
      {/* Welcome Bar */}
      <div className="bg-lime/10 border border-lime/30 rounded-xl p-4 mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-heading text-navy text-lg">Welcome back, Michael</h2>
          <p className="text-gray-500 text-sm">Private Investor · Fox Mortgage Portal</p>
        </div>
        <div className="text-lime font-semibold text-sm">
          Next Payment: April 1, 2026 · $7,083
        </div>
      </div>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-6">
            <stat.icon className="w-5 h-5 text-lime mb-2" />
            <p className="font-heading text-2xl text-navy">{stat.value}</p>
            <p className="text-gray-500 text-sm">{stat.label}</p>
            <p className="text-gray-400 text-xs mt-1">{stat.sub}</p>
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-gray-500 text-xs uppercase tracking-wider">
                <th className="text-left py-3 font-medium">Property</th>
                <th className="text-left py-3 font-medium">Position</th>
                <th className="text-left py-3 font-medium">Invested</th>
                <th className="text-left py-3 font-medium">Rate</th>
                <th className="text-left py-3 font-medium">Monthly Int.</th>
                <th className="text-left py-3 font-medium">Maturity</th>
                <th className="text-left py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="font-body">
              {positions.map((pos) => (
                <Link
                  key={pos.id}
                  href={`/portal/investor/portfolio/${pos.id}`}
                  className="contents"
                >
                  <tr className="border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors">
                    <td className="py-3 text-navy font-medium">{pos.property}</td>
                    <td className="py-3 text-gray-600">{pos.position}</td>
                    <td className="py-3 font-heading text-navy">{pos.invested}</td>
                    <td className="py-3 text-navy">{pos.rate}</td>
                    <td className="py-3 text-navy">{pos.monthly}</td>
                    <td className="py-3 text-gray-600">{pos.maturity}</td>
                    <td className="py-3">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        {pos.status}
                      </span>
                    </td>
                  </tr>
                </Link>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upcoming Payments */}
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
