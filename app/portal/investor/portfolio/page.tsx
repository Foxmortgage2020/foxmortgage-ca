'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n);

export default function InvestorPortfolio() {
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
      .finally(() => setLoading(false));
  }, []);

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

  // Computed summary
  const totalDeployed = positions.reduce((sum, p) => sum + (Number(p.Investor_Amount) || 0), 0);
  const activeCount = positions.length;
  const monthsThisYear = new Date().getMonth() + 1;
  const interestEarnedYTD = positions.reduce(
    (sum, p) => sum + ((Number(p.Investor_Amount) || 0) * (Number(p.Investor_Rate) || 0) / 100) * (monthsThisYear / 12),
    0
  );

  const summary = [
    { label: 'Total Deployed', value: formatCurrency(totalDeployed) },
    { label: 'Active Positions', value: activeCount.toString() },
    { label: 'YTD Interest Earned', value: formatCurrency(interestEarnedYTD) },
  ];

  // Progress helper
  const computeProgress = (firstPayment: string | undefined, maturity: string | undefined) => {
    if (!firstPayment || !maturity) return { pct: 0, label: '—' };
    const start = new Date(firstPayment).getTime();
    const end = new Date(maturity).getTime();
    const now = Date.now();
    const totalMs = end - start;
    if (totalMs <= 0) return { pct: 100, label: 'Complete' };
    const elapsedMs = Math.max(0, Math.min(now - start, totalMs));
    const pct = Math.round((elapsedMs / totalMs) * 100);
    const totalMonths = Math.round(totalMs / (1000 * 60 * 60 * 24 * 30.44));
    const elapsedMonths = Math.round(elapsedMs / (1000 * 60 * 60 * 24 * 30.44));
    return { pct, label: `${elapsedMonths} of ${totalMonths} months` };
  };

  return (
    <div>
      {/* Summary Bar */}
      <div className="bg-navy text-white rounded-xl p-6 mb-6 grid grid-cols-3 text-center divide-x divide-white/20">
        {summary.map((item) => (
          <div key={item.label}>
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-1 font-body">{item.label}</p>
            <p className="font-heading text-2xl text-white">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Position Cards */}
      {positions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="font-body text-gray-500">
            No active positions. Contact Michael at{' '}
            <a href="mailto:mfox@foxmortgage.ca" className="text-lime font-semibold hover:underline">
              mfox@foxmortgage.ca
            </a>
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {positions.map((pos) => {
            const investorAmount = Number(pos.Investor_Amount) || 0;
            const investorRate = Number(pos.Investor_Rate) || 0;
            const monthlyInterest = (investorAmount * investorRate) / 100 / 12;
            const maturityFormatted = pos.Maturity_Date
              ? new Date(pos.Maturity_Date).toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })
              : '—';
            const progress = computeProgress(pos.First_Payment_Date, pos.Maturity_Date);
            const address = `${pos.Street ?? ''}${pos.City ? `, ${pos.City}` : ''}${pos.Province ? ` ${pos.Province}` : ''}`;

            return (
              <div
                key={pos.id}
                onClick={() => router.push(`/portal/investor/portfolio/${pos.id}`)}
                className="block bg-white rounded-xl border border-gray-200 p-6 hover:border-lime transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-heading text-navy text-lg">{address}</h3>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Active
                  </span>
                </div>
                <p className="text-gray-500 text-sm font-body mb-4">
                  {pos.Deal_Name ? `${pos.Deal_Name} · ` : ''}{pos.Mortgage_Type} Mortgage
                </p>

                <div className="grid grid-cols-4 gap-4 mb-4">
                  {[
                    { label: 'Invested', value: formatCurrency(investorAmount) },
                    { label: 'Rate', value: `${investorRate}%` },
                    { label: 'Monthly Interest', value: formatCurrency(monthlyInterest) },
                    { label: 'Maturity', value: maturityFormatted },
                  ].map((stat) => (
                    <div key={stat.label}>
                      <p className="text-gray-500 text-xs uppercase font-body">{stat.label}</p>
                      <p className="font-heading text-navy text-lg">{stat.value}</p>
                    </div>
                  ))}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-gray-500 text-xs font-body">Term Progress</span>
                    <span className="text-gray-500 text-xs font-body">{progress.label}</span>
                  </div>
                  <div className="bg-gray-200 h-2 rounded-full">
                    <div
                      className="bg-lime h-2 rounded-full transition-all"
                      style={{ width: `${progress.pct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
