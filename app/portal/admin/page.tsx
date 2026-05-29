'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
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
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Label,
} from 'recharts';

// Shape returned by GET /api/admin/dashboard (see getAdminDashboardPayload in
// lib/zoho.ts). `deals` is null when the single deal pull fails — partner
// tiles still render; deal-derived tiles fall back to dashes.
type RecentReferral = {
  dealId: string;
  borrower: string;
  partner: string | null;
  stage: string;
  createdTime: string | null;
};

type FundedYear = {
  year: number;
  volume: number;
  count: number;
};

type DealMetrics = {
  fundedVolume: number;
  fundedCount: number;
  inProgress: number;
  total: number;
  referralsThisMonth: number;
  totalReferrals: number;
  attributionPct: number;
  recentReferrals: RecentReferral[];
  fundedByYear: FundedYear[];
};

type AdminDashboard = {
  partners: {
    total: number;
    byType: {
      realtor: number;
      lawyer: number;
      investor: number;
      financialPlanner: number;
      untyped: number;
    };
  };
  deals: DealMetrics | null;
  warning?: string;
};

// Render a number, or an em-dash when unavailable (loading or a failed
// aggregate). Never throws on null/undefined.
const dash = (n: number | null | undefined): string =>
  n === null || n === undefined ? '—' : String(n);

// Compact millions, e.g. 31279738 -> "$31.3M". Dash when unavailable.
const moneyM = (n: number | null | undefined): string =>
  n === null || n === undefined ? '—' : `$${(n / 1_000_000).toFixed(1)}M`;

// "May 12"-style short date from a Zoho ISO datetime.
const fmtDate = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// Pill color by deal stage. Funded → green, lost/cancelled → gray,
// approved → lime, everything else → blue.
const stageColor = (stage: string): string => {
  const s = stage.toLowerCase();
  if (s.includes('funded')) return 'bg-green-100 text-green-700';
  if (s.includes('lost') || s.includes('cancel') || s.includes('declin'))
    return 'bg-gray-100 text-gray-600';
  if (s.includes('approved')) return 'bg-lime-100 text-lime-700';
  return 'bg-blue-100 text-blue-700';
};

// ─── Practice History (funded volume by year) ────────────────────────────────
// Brand palette (tailwind: navy / lime).
const NAVY = '#032133';
const LIME = '#95D600';
// Partial (current/YTD) year bar — a faded lime so it never reads as a decline.
const LIME_FADED = '#CFEB95';

// First calendar year with funded production. Bars run from here to the
// current year; also the fallback when the deal pull is unavailable.
const FIRST_FUNDED_YEAR = 2021;

// Vertical event marker on the by-year chart. Year + label are constants so
// they move in a single edit as the timeline advances.
const MILESTONE_YEAR = 2026;
const MILESTONE_LABEL = 'Systems + AI live';

// "$31.3M" / "$590K" — compact, $-prefixed to match the existing tiles.
const moneyShort = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
};

// "$6,231,323" — full dollars with thousands separators (chart tooltip).
const moneyFull = (n: number | null | undefined): string =>
  n === null || n === undefined ? '—' : `$${Math.round(n).toLocaleString('en-US')}`;

type ChartYear = {
  year: string;
  volume: number;
  count: number;
  isCurrent: boolean;
};

// Tooltip for the by-year bars: year, full funded volume, funded count.
function VolumeTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload as ChartYear;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-3 py-2">
      <p className="font-heading text-navy text-sm font-bold">
        {d.isCurrent ? `${d.year} (YTD)` : d.year}
      </p>
      <p className="font-body text-xs text-gray-600 mt-0.5">{moneyFull(d.volume)}</p>
      <p className="font-body text-xs text-gray-400">
        {d.count} funded {d.count === 1 ? 'deal' : 'deals'}
      </p>
    </div>
  );
}

type Kpi = {
  icon: typeof Building2;
  value: string;
  label: string;
  sub: string | null;
  comingSoon?: boolean;
};

export default function AdminDashboard() {
  const router = useRouter();
  const [data, setData] = useState<AdminDashboard | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/dashboard')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        // Swallow — tiles fall back to dashes / Coming Soon.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const byType = data?.partners.byType;
  const deals = data?.deals ?? null;

  // Real by-type breakdown that INCLUDES lawyers and investors.
  const partnerSubtitle = byType
    ? `${byType.realtor} realtors, ${byType.lawyer} lawyers, ${byType.investor} investors, ${byType.financialPlanner} FPs`
    : 'Loading…';

  const todayFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Trend badges removed — each needs a month-over-month query we have not
  // built. Tiles with no live Zoho source are flagged comingSoon.
  const topKpis: Kpi[] = [
    {
      icon: Building2,
      value: moneyM(deals?.fundedVolume),
      label: 'Total Funded Volume',
      sub: deals ? `${deals.fundedCount} funded deals` : null,
    },
    {
      icon: Users,
      value: dash(data?.partners.total),
      label: 'Active Partners',
      sub: partnerSubtitle,
    },
    {
      icon: DollarSign,
      value: '',
      label: 'Capital Deployed (Investors)',
      sub: null,
      comingSoon: true,
    },
    {
      icon: TrendingUp,
      value: '',
      label: 'Referral Close Rate',
      sub: null,
      comingSoon: true,
    },
  ];

  const secondKpis: Kpi[] = [
    {
      icon: FileText,
      value: dash(deals?.totalReferrals),
      label: 'Total Referrals (All Time)',
      sub: deals ? `${deals.attributionPct}% of ${deals.total} deals` : null,
    },
    {
      icon: Shield,
      value: '',
      label: 'Assets Under Monitoring',
      sub: null,
      comingSoon: true,
    },
    {
      icon: Clock,
      value: dash(deals?.inProgress),
      label: 'Deals In Progress',
      sub: deals ? 'Active pipeline' : null,
    },
    {
      icon: Bell,
      value: '',
      label: 'Pending Actions',
      sub: null,
      comingSoon: true,
    },
  ];

  const recent = deals?.recentReferrals ?? [];

  // ─── Practice History derived data ─────────────────────────────────────────
  const currentYear = new Date().getFullYear();
  const byYear = deals?.fundedByYear ?? [];
  const firstFundedYear = byYear.length ? byYear[0].year : FIRST_FUNDED_YEAR;

  // One bar per calendar year, first funded year → current year. Years with no
  // funded deals fill in at zero so the axis reads continuously.
  const byYearMap = new Map(byYear.map((y) => [y.year, y]));
  const chartData: ChartYear[] = [];
  for (let y = firstFundedYear; y <= currentYear; y++) {
    const rec = byYearMap.get(y);
    chartData.push({
      year: String(y),
      volume: rec?.volume ?? 0,
      count: rec?.count ?? 0,
      isCurrent: y === currentYear,
    });
  }

  // 5-yr avg reference: mean of the COMPLETE (non-current) years only, so the
  // partial current year never drags the baseline down. Label is derived from
  // the count of complete years, so it stays correct in future years.
  const completeYears = chartData.filter((d) => !d.isCurrent);
  const avgComplete =
    completeYears.length > 0
      ? completeYears.reduce((s, d) => s + d.volume, 0) / completeYears.length
      : 0;
  const avgLabel = `${completeYears.length}-yr avg`;
  const showMilestone =
    MILESTONE_YEAR >= firstFundedYear && MILESTONE_YEAR <= currentYear;

  // Summary-strip figures (all-time funded volume/count come straight from the
  // same metrics that back the existing $31M card — not recomputed here).
  const avgDeal =
    deals && deals.fundedCount > 0 ? deals.fundedVolume / deals.fundedCount : null;
  const yearsActive = deals ? currentYear - firstFundedYear + 1 : null;

  const renderKpi = (kpi: Kpi) => {
    const Icon = kpi.icon;
    return (
      <div
        key={kpi.label}
        className={`bg-white rounded-xl border border-gray-200 p-5 ${kpi.comingSoon ? 'opacity-60' : ''}`}
      >
        <div className={`rounded-lg p-2 w-fit ${kpi.comingSoon ? 'bg-gray-100' : 'bg-lime/10'}`}>
          <Icon className={`w-5 h-5 ${kpi.comingSoon ? 'text-gray-400' : 'text-lime'}`} />
        </div>
        {kpi.comingSoon ? (
          <>
            <span className="inline-block bg-gray-100 text-gray-500 text-xs font-semibold px-3 py-1 rounded-full mt-3">
              Coming Soon
            </span>
            <p className="text-gray-500 text-sm font-body mt-2">{kpi.label}</p>
          </>
        ) : (
          <>
            <p className="font-heading text-3xl text-navy font-bold mt-3">{kpi.value}</p>
            <p className="text-gray-500 text-sm font-body mt-1">{kpi.label}</p>
            {kpi.sub && <p className="text-gray-400 text-xs mt-0.5">{kpi.sub}</p>}
          </>
        )}
      </div>
    );
  };

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
        {topKpis.map(renderKpi)}
      </div>

      {/* 3. SECOND KPI ROW */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {secondKpis.map(renderKpi)}
      </div>

      {/* 4. PORTAL OVERVIEW TILES */}
      <div className="mb-8">
        <h2 className="font-heading text-navy text-xl font-bold mb-4">Portal Activity</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Partner Portal — enters the realtor portal as the representative
              partner view (mirrors the sidebar "Switch to Portal → Realtor").
              The retired /portal/dashboard catch-all would no-op for admins. */}
          <div
            onClick={() => router.push('/portal/realtor/dashboard')}
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
                <p className="font-heading text-navy text-xl font-bold">{dash(byType?.realtor)}</p>
                <p className="text-gray-500 text-xs">Active Realtors</p>
              </div>
              <div>
                <p className="font-heading text-navy text-xl font-bold">{dash(byType?.financialPlanner)}</p>
                <p className="text-gray-500 text-xs">Active FPs</p>
              </div>
              <div>
                <p className="font-heading text-navy text-xl font-bold">{dash(byType?.lawyer)}</p>
                <p className="text-gray-500 text-xs">Active Lawyers</p>
              </div>
              <div>
                <p className="font-heading text-navy text-xl font-bold">{dash(byType?.investor)}</p>
                <p className="text-gray-500 text-xs">Active Investors</p>
              </div>
              <div>
                <p className="font-heading text-navy text-xl font-bold">{dash(deals?.referralsThisMonth)}</p>
                <p className="text-gray-500 text-xs">Referrals This Month</p>
              </div>
              <div>
                <p className="font-heading text-navy text-xl font-bold">
                  {deals
                    ? `${deals.totalReferrals} / ${deals.total} (${deals.attributionPct}%)`
                    : '—'}
                </p>
                <p className="text-gray-500 text-xs">Referral Attribution</p>
              </div>
            </div>
            <p className="text-lime font-semibold text-sm mt-4">Enter Partner Portal &rarr;</p>
          </div>

          {/* Investor Portal — only the partner count is live; position-level
              figures await an investor data source in Zoho. */}
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
                <p className="font-heading text-navy text-xl font-bold">{dash(byType?.investor)}</p>
                <p className="text-gray-500 text-xs">Active Investors</p>
              </div>
              <div>
                <span className="inline-block bg-gray-100 text-gray-500 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                  Coming Soon
                </span>
                <p className="text-gray-500 text-xs mt-1">Capital Deployed</p>
              </div>
              <div>
                <span className="inline-block bg-gray-100 text-gray-500 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                  Coming Soon
                </span>
                <p className="text-gray-500 text-xs mt-1">Interest Paid YTD</p>
              </div>
              <div>
                <span className="inline-block bg-gray-100 text-gray-500 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                  Coming Soon
                </span>
                <p className="text-gray-500 text-xs mt-1">New Opportunities</p>
              </div>
            </div>
            <p className="text-lime font-semibold text-sm mt-4">Enter Investor Portal &rarr;</p>
          </div>

          {/* SMM Dashboard — no live data source yet. */}
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
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <span className="bg-gray-100 text-gray-500 text-xs font-semibold px-3 py-1 rounded-full">
                Coming Soon
              </span>
              <p className="text-gray-400 text-xs text-center">
                Monitoring metrics not yet sourced from Zoho.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 5. RECENT ACTIVITY */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Recent Referrals — live, attributed deals newest first. */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading text-navy font-bold text-lg">Recent Referrals</h3>
            <Link href="/portal/clients" className="text-lime text-sm font-semibold">
              View All &rarr;
            </Link>
          </div>
          <div>
            {recent.length === 0 ? (
              <p className="text-sm text-gray-400 py-3">
                {data ? 'No attributed referrals yet.' : 'Loading…'}
              </p>
            ) : (
              recent.map((ref, i) => (
                <div
                  key={ref.dealId}
                  className={`flex items-center justify-between py-3 ${i < recent.length - 1 ? 'border-b border-gray-100' : ''}`}
                >
                  <div>
                    <p className="text-sm font-body text-navy font-semibold">{ref.borrower}</p>
                    <p className="text-xs text-gray-400">{ref.partner ?? 'Unknown partner'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${stageColor(ref.stage)}`}>
                      {ref.stage || '—'}
                    </span>
                    <span className="text-xs text-gray-400">{fmtDate(ref.createdTime)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Investor Activity — no live data source yet. */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 opacity-75">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading text-navy font-bold text-lg">Investor Activity</h3>
          </div>
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <span className="bg-gray-100 text-gray-500 text-xs font-semibold px-3 py-1 rounded-full">
              Coming Soon
            </span>
            <p className="text-gray-400 text-xs text-center">
              Investor position data not yet sourced from Zoho.
            </p>
          </div>
        </div>
      </div>

      {/* 6. PENDING ACTIONS — no live data source yet. */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8 opacity-75">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-navy font-bold text-lg">Pending Actions</h3>
        </div>
        <div className="flex flex-col items-center justify-center py-10 gap-2">
          <span className="bg-gray-100 text-gray-500 text-xs font-semibold px-3 py-1 rounded-full">
            Coming Soon
          </span>
          <p className="text-gray-400 text-xs text-center">
            Action queue not yet wired to a live source.
          </p>
        </div>
      </div>

      {/* 7. PRACTICE SUMMARY — real deal-derived numbers only. */}
      <div className="bg-navy text-white rounded-xl p-6">
        <h3 className="text-lime font-heading font-bold text-lg mb-4">Practice Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div>
            <p className="font-heading text-2xl font-bold text-lime">{moneyM(deals?.fundedVolume)}</p>
            <p className="text-gray-400 text-xs mt-1">Total Funded Volume</p>
          </div>
          <div>
            <p className="font-heading text-2xl font-bold text-white">{dash(deals?.fundedCount)}</p>
            <p className="text-gray-400 text-xs mt-1">Funded Deals</p>
          </div>
          <div>
            <p className="font-heading text-2xl font-bold text-lime">{dash(deals?.total)}</p>
            <p className="text-gray-400 text-xs mt-1">Total Deals</p>
          </div>
          <div>
            <p className="font-heading text-2xl font-bold text-white">{dash(data?.partners.total)}</p>
            <p className="text-gray-400 text-xs mt-1">Active Partners</p>
          </div>
        </div>
      </div>

      {/* 8. PRACTICE HISTORY — funded production over time (admin only). Sits
          at the bottom; the all-time tiles above are untouched. */}
      <div className="mt-8">
        <h2 className="font-heading text-navy text-xl font-bold mb-1">Practice History</h2>
        <p className="text-gray-500 font-body text-sm mb-4">
          Funded production since {firstFundedYear}.
        </p>

        {/* Summary strip */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="font-heading text-2xl text-navy font-bold">{moneyM(deals?.fundedVolume)}</p>
            <p className="text-gray-500 text-sm font-body mt-1">Total Funded Volume</p>
            <p className="text-gray-400 text-xs mt-0.5">All time</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="font-heading text-2xl text-navy font-bold">{dash(deals?.fundedCount)}</p>
            <p className="text-gray-500 text-sm font-body mt-1">Funded Deals</p>
            <p className="text-gray-400 text-xs mt-0.5">All time</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="font-heading text-2xl text-navy font-bold">{moneyShort(avgDeal)}</p>
            <p className="text-gray-500 text-sm font-body mt-1">Avg Deal Size</p>
            <p className="text-gray-400 text-xs mt-0.5">Volume &divide; funded deals</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="font-heading text-2xl text-navy font-bold">
              {yearsActive === null ? '—' : yearsActive}
            </p>
            <p className="text-gray-500 text-sm font-body mt-1">Years Active</p>
            <p className="text-gray-400 text-xs mt-0.5">
              {deals ? `${firstFundedYear}–${currentYear}` : ''}
            </p>
          </div>
          {/* Active partners slot — reserved, sourced in a later pass. */}
          <div className="bg-white rounded-xl border border-dashed border-gray-200 p-5 opacity-60">
            <p className="font-heading text-2xl text-gray-300 font-bold">—</p>
            <p className="text-gray-500 text-sm font-body mt-1">Active Partners</p>
            <p className="text-gray-400 text-xs mt-0.5">Coming soon</p>
          </div>
        </div>

        {/* Volume by Year */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mt-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading text-navy font-bold text-lg">Funded Volume by Year</h3>
            <span className="text-xs text-gray-400 font-body">
              Actuals &middot; {firstFundedYear}&ndash;{currentYear}
            </span>
          </div>
          <div className="w-full" style={{ height: 320 }}>
            {!deals ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">
                Loading&hellip;
              </div>
            ) : chartData.every((d) => d.volume === 0) ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">
                No funded deals yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 28, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f2" />
                  <XAxis
                    dataKey="year"
                    tickFormatter={(y) => (Number(y) === currentYear ? `${y} YTD` : y)}
                    tick={{ fontSize: 12, fill: '#6b7280' }}
                    axisLine={{ stroke: '#e5e7eb' }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => moneyShort(v)}
                    tick={{ fontSize: 12, fill: '#6b7280' }}
                    axisLine={false}
                    tickLine={false}
                    width={56}
                  />
                  <Tooltip content={<VolumeTooltip />} cursor={{ fill: 'rgba(3,33,51,0.04)' }} />
                  <Bar dataKey="volume" radius={[6, 6, 0, 0]} maxBarSize={64} isAnimationActive={false}>
                    {chartData.map((d) => (
                      <Cell key={d.year} fill={d.isCurrent ? LIME_FADED : LIME} />
                    ))}
                  </Bar>
                  {avgComplete > 0 && (
                    <ReferenceLine y={avgComplete} stroke={NAVY} strokeOpacity={0.55} strokeDasharray="5 4">
                      <Label
                        content={(p: any) => {
                          const vb = p?.viewBox;
                          if (!vb) return null;
                          return (
                            <text
                              x={vb.x + 8}
                              y={vb.y - 6}
                              textAnchor="start"
                              fill={NAVY}
                              fillOpacity={0.75}
                              fontSize={11}
                              fontWeight={600}
                            >
                              {avgLabel}
                            </text>
                          );
                        }}
                      />
                    </ReferenceLine>
                  )}
                  {showMilestone && (
                    <ReferenceLine x={String(MILESTONE_YEAR)} stroke={NAVY} strokeWidth={1.5} strokeDasharray="4 3">
                      <Label
                        content={(p: any) => {
                          const vb = p?.viewBox;
                          if (!vb) return null;
                          return (
                            <text
                              x={vb.x - 6}
                              y={vb.y - 8}
                              textAnchor="end"
                              fill={NAVY}
                              fontSize={11}
                              fontWeight={600}
                            >
                              {MILESTONE_LABEL}
                            </text>
                          );
                        }}
                      />
                    </ReferenceLine>
                  )}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
