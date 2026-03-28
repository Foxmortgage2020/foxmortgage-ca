'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Users,
  DollarSign,
  TrendingUp,
  FileText,
  Shield,
  Clock,
  Bell,
  Activity,
} from 'lucide-react';

export default function AdminDashboard() {
  const router = useRouter();

  const todayFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const topKpis = [
    {
      icon: Building2,
      value: '$45.2M',
      label: 'Total Funded Volume',
      sub: '+18% this month',
      badge: '+18%',
      badgeColor: 'bg-green-100 text-green-700',
    },
    {
      icon: Users,
      value: '12',
      label: 'Active Partners',
      sub: '8 realtors, 4 FPs',
      badge: null,
      badgeColor: '',
    },
    {
      icon: DollarSign,
      value: '$750K',
      label: 'Capital Deployed (Investors)',
      sub: '2 active positions',
      badge: null,
      badgeColor: '',
    },
    {
      icon: TrendingUp,
      value: '63.2%',
      label: 'Referral Close Rate',
      sub: '-2.1% vs last month',
      badge: '-2.1%',
      badgeColor: 'bg-red-100 text-red-700',
    },
  ];

  const secondKpis = [
    {
      icon: FileText,
      value: '247',
      label: 'Total Referrals (All Time)',
      sub: '+12 this month',
    },
    {
      icon: Shield,
      value: '$128M',
      label: 'Assets Under Monitoring',
      sub: 'Across all SMM clients',
    },
    {
      icon: Clock,
      value: '3',
      label: 'Deals In Progress',
      sub: 'Expected close: 14 days avg',
    },
    {
      icon: Bell,
      value: '5',
      label: 'Pending Actions',
      sub: 'Require your attention',
    },
  ];

  const recentReferrals = [
    { name: 'Sarah Johnson', partner: 'John Smith (Realtor)', status: 'Active', statusColor: 'bg-green-100 text-green-700', date: 'Jan 15' },
    { name: 'Michael Chen', partner: 'Jane Doe (FP)', status: 'Potential Savings', statusColor: 'bg-yellow-100 text-yellow-700', date: 'Jan 10' },
    { name: 'Emily Rodriguez', partner: 'John Smith', status: 'Onboarding', statusColor: 'bg-blue-100 text-blue-700', date: 'Jan 8' },
    { name: 'David Thompson', partner: 'Sarah Lee (Realtor)', status: 'Referred', statusColor: 'bg-gray-100 text-gray-600', date: 'Jan 5' },
    { name: 'Jennifer Walsh', partner: 'John Smith', status: 'Active', statusColor: 'bg-green-100 text-green-700', date: 'Jan 2' },
  ];

  const investorActivity = [
    { date: 'Apr 1, 2026', type: 'Interest Payment', amount: '$4,375', property: '142 Wellington', status: 'Scheduled', statusColor: 'bg-blue-100 text-blue-700' },
    { date: 'Apr 1', type: 'Interest Payment', amount: '$2,708', property: '88 King', status: 'Scheduled', statusColor: 'bg-blue-100 text-blue-700' },
    { date: 'Mar 15', type: 'Interest Payment', amount: '$4,375', property: '142 Wellington', status: 'Paid', statusColor: 'bg-green-100 text-green-700' },
    { date: 'Mar 15', type: 'Interest Payment', amount: '$2,708', property: '88 King', status: 'Paid', statusColor: 'bg-green-100 text-green-700' },
    { date: 'Mar 1', type: 'New Opportunity', amount: '$1.1M', property: 'BRXM-F025265', status: 'Available', statusColor: 'bg-lime-100 text-lime-700' },
  ];

  const pendingActions = [
    { dot: 'bg-red-500', desc: 'KYC review due for Michael Fox investor account', due: 'Due Apr 30', action: 'Complete', href: '/portal/investor/profile' },
    { dot: 'bg-yellow-500', desc: '3 new deal opportunities need to be posted', due: 'Due ASAP', action: 'Manage', href: '/portal/investor/opportunities' },
    { dot: 'bg-yellow-500', desc: 'Renewal alert: 4 clients maturing in 60 days', due: 'Due May 1', action: 'View', href: '/portal/clients' },
    { dot: 'bg-blue-500', desc: 'New referral submitted: David Thompson', due: 'Received Jan 5', action: 'Review', href: '/portal/clients' },
    { dot: 'bg-blue-500', desc: 'Monthly statements ready to send', due: 'Due Apr 1', action: 'Send', href: '/portal/investor/statements' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-10">
      {/* 1. PAGE HEADER */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between mb-8">
        <div>
          <h1 className="font-heading text-navy text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-gray-500 font-body mt-1">
            Good evening, Michael. Here&apos;s everything happening across your practice.
          </p>
        </div>
        <div className="text-right mt-4 md:mt-0">
          <p className="text-sm text-navy font-body">{todayFormatted}</p>
          <p className="text-xs text-gray-400">Last updated: just now</p>
        </div>
      </div>

      {/* 2. TOP KPI ROW */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {topKpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.label}
              className="bg-white rounded-xl border border-gray-200 p-5 relative"
            >
              <div className="flex items-start justify-between">
                <div className="bg-lime/10 rounded-lg p-2">
                  <Icon className="w-5 h-5 text-lime" />
                </div>
                {kpi.badge && (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${kpi.badgeColor}`}>
                    {kpi.badge}
                  </span>
                )}
              </div>
              <p className="font-heading text-3xl text-navy font-bold mt-3">{kpi.value}</p>
              <p className="text-gray-500 text-sm font-body mt-1">{kpi.label}</p>
              <p className="text-gray-400 text-xs mt-0.5">{kpi.sub}</p>
            </div>
          );
        })}
      </div>

      {/* 3. SECOND KPI ROW */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {secondKpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.label}
              className="bg-white rounded-xl border border-gray-200 p-5"
            >
              <div className="bg-lime/10 rounded-lg p-2 w-fit">
                <Icon className="w-5 h-5 text-lime" />
              </div>
              <p className="font-heading text-3xl text-navy font-bold mt-3">{kpi.value}</p>
              <p className="text-gray-500 text-sm font-body mt-1">{kpi.label}</p>
              <p className="text-gray-400 text-xs mt-0.5">{kpi.sub}</p>
            </div>
          );
        })}
      </div>

      {/* 4. PORTAL OVERVIEW TILES */}
      <div className="mb-8">
        <h2 className="font-heading text-navy text-xl font-bold mb-4">Portal Activity</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Partner Portal */}
          <div
            onClick={() => router.push('/portal/dashboard')}
            className="bg-white rounded-2xl border-2 border-gray-200 hover:border-lime cursor-pointer transition-all p-6"
          >
            <div className="flex items-center gap-3">
              <div className="bg-lime/10 rounded-full p-2">
                <Users className="w-5 h-5 text-lime" />
              </div>
              <h3 className="font-heading text-navy font-bold text-lg">Partner Portal</h3>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <p className="font-heading text-navy text-xl font-bold">8</p>
                <p className="text-gray-500 text-xs">Active Realtors</p>
              </div>
              <div>
                <p className="font-heading text-navy text-xl font-bold">4</p>
                <p className="text-gray-500 text-xs">Active FPs</p>
              </div>
              <div>
                <p className="font-heading text-navy text-xl font-bold">23</p>
                <p className="text-gray-500 text-xs">Referrals This Month</p>
              </div>
              <div>
                <p className="font-heading text-navy text-xl font-bold">2</p>
                <p className="text-gray-500 text-xs">Pending Reviews</p>
              </div>
            </div>
            <p className="text-lime font-semibold text-sm mt-4">Enter Partner Portal &rarr;</p>
          </div>

          {/* Investor Portal */}
          <div
            onClick={() => router.push('/portal/investor/dashboard')}
            className="bg-white rounded-2xl border-2 border-gray-200 hover:border-lime cursor-pointer transition-all p-6"
          >
            <div className="flex items-center gap-3">
              <div className="bg-lime/10 rounded-full p-2">
                <TrendingUp className="w-5 h-5 text-lime" />
              </div>
              <h3 className="font-heading text-navy font-bold text-lg">Investor Portal</h3>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <p className="font-heading text-navy text-xl font-bold">3</p>
                <p className="text-gray-500 text-xs">Active Investors</p>
              </div>
              <div>
                <p className="font-heading text-navy text-xl font-bold">$750K</p>
                <p className="text-gray-500 text-xs">Capital Deployed</p>
              </div>
              <div>
                <p className="font-heading text-navy text-xl font-bold">$52,500</p>
                <p className="text-gray-500 text-xs">Interest Paid YTD</p>
              </div>
              <div>
                <p className="font-heading text-navy text-xl font-bold">3</p>
                <p className="text-gray-500 text-xs">New Opportunities</p>
              </div>
            </div>
            <p className="text-lime font-semibold text-sm mt-4">Enter Investor Portal &rarr;</p>
          </div>

          {/* SMM Dashboard */}
          <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 opacity-75 p-6">
            <div className="flex items-center gap-3">
              <div className="bg-gray-100 rounded-full p-2">
                <Activity className="w-5 h-5 text-gray-400" />
              </div>
              <div>
                <h3 className="font-heading text-navy font-bold text-lg">SMM Dashboard</h3>
                <p className="text-gray-400 text-xs">Strategic Mortgage Monitoring</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <p className="font-heading text-navy text-xl font-bold">200+</p>
                <p className="text-gray-500 text-xs">Clients Monitored</p>
              </div>
              <div>
                <p className="font-heading text-navy text-xl font-bold">$4,200</p>
                <p className="text-gray-500 text-xs">Avg Rate Savings</p>
              </div>
              <div>
                <p className="font-heading text-navy text-xl font-bold">18</p>
                <p className="text-gray-500 text-xs">Renewals This Quarter</p>
              </div>
              <div>
                <p className="font-heading text-navy text-xl font-bold">47</p>
                <p className="text-gray-500 text-xs">Alerts Sent</p>
              </div>
            </div>
            <div className="mt-4">
              <span className="bg-gray-100 text-gray-500 text-xs font-semibold px-3 py-1 rounded-full">
                Coming Soon
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 5. RECENT ACTIVITY */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Recent Referrals */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading text-navy font-bold text-lg">Recent Referrals</h3>
            <Link href="/portal/clients" className="text-lime text-sm font-semibold">
              View All &rarr;
            </Link>
          </div>
          <div>
            {recentReferrals.map((ref, i) => (
              <div
                key={i}
                className={`flex items-center justify-between py-3 ${i < recentReferrals.length - 1 ? 'border-b border-gray-100' : ''}`}
              >
                <div>
                  <p className="text-sm font-body text-navy font-semibold">{ref.name}</p>
                  <p className="text-xs text-gray-400">{ref.partner}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ref.statusColor}`}>
                    {ref.status}
                  </span>
                  <span className="text-xs text-gray-400">{ref.date}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Investor Activity */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading text-navy font-bold text-lg">Investor Activity</h3>
            <Link href="/portal/investor/dashboard" className="text-lime text-sm font-semibold">
              View All &rarr;
            </Link>
          </div>
          <div>
            {investorActivity.map((item, i) => (
              <div
                key={i}
                className={`flex items-center justify-between py-3 ${i < investorActivity.length - 1 ? 'border-b border-gray-100' : ''}`}
              >
                <div>
                  <p className="text-sm font-body text-navy font-semibold">{item.type}</p>
                  <p className="text-xs text-gray-400">{item.property}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-heading text-navy font-bold">{item.amount}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${item.statusColor}`}>
                    {item.status}
                  </span>
                  <span className="text-xs text-gray-400">{item.date}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 6. PENDING ACTIONS */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-navy font-bold text-lg">Pending Actions</h3>
          <p className="text-gray-500 text-sm">5 items require attention</p>
        </div>
        <div>
          {pendingActions.map((item, i) => (
            <div
              key={i}
              className={`flex items-center gap-4 py-3 ${i < pendingActions.length - 1 ? 'border-b border-gray-100' : ''}`}
            >
              <div className={`w-2 h-2 rounded-full ${item.dot} flex-shrink-0`} />
              <p className="text-sm font-body text-navy flex-1">{item.desc}</p>
              <span className="text-gray-400 text-xs whitespace-nowrap">{item.due}</span>
              <Link href={item.href} className="text-lime text-sm font-semibold whitespace-nowrap">
                {item.action} &rarr;
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* 7. PRACTICE SUMMARY */}
      <div className="bg-navy text-white rounded-xl p-6">
        <h3 className="text-lime font-heading font-bold text-lg mb-4">Practice Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6 text-center">
          <div>
            <p className="font-heading text-2xl font-bold text-lime">$47M+</p>
            <p className="text-gray-400 text-xs mt-1">Capital Deployed (All Time)</p>
          </div>
          <div>
            <p className="font-heading text-2xl font-bold text-white">247</p>
            <p className="text-gray-400 text-xs mt-1">Total Referrals</p>
          </div>
          <div>
            <p className="font-heading text-2xl font-bold text-lime">11.2%</p>
            <p className="text-gray-400 text-xs mt-1">Avg Investor Return</p>
          </div>
          <div>
            <p className="font-heading text-2xl font-bold text-white">Zero</p>
            <p className="text-gray-400 text-xs mt-1">Investor Losses</p>
          </div>
          <div>
            <p className="font-heading text-2xl font-bold text-lime">200+</p>
            <p className="text-gray-400 text-xs mt-1">Clients Monitored</p>
          </div>
        </div>
      </div>
    </div>
  );
}
