'use client';

import { useState, useEffect } from 'react';

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD',
    minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const getIncomeStart = (p: any): Date =>
  new Date(p.First_Payment_Date || p.Closing_Date);

const getIncomeEnd = (p: any): Date => {
  if (p.Investor_Status === 'Paid Out') {
    if (p.Investor_Payout_Date) return new Date(p.Investor_Payout_Date);
    if (p.Maturity_Date) return new Date(p.Maturity_Date);
  }
  return new Date();
};

const isActive = (p: any): boolean =>
  ['Active', 'Renewal In Progress', 'Renewed'].includes(p.Investor_Status)
  || (!p.Investor_Status && p.Deal_Status_Investor !== 'Matured');

const generateMonthlyStatements = (positions: any[]) => {
  if (!positions.length) return [];
  const starts = positions
    .map(p => new Date(p.First_Payment_Date || p.Closing_Date))
    .filter(d => !isNaN(d.getTime()));
  if (!starts.length) return [];
  const earliest = new Date(Math.min(...starts.map(d => d.getTime())));
  const statements: { period: string; month: number; year: number; activePositions: number; activeDeals: string[]; interestEarned: number }[] = [];
  const today = new Date();
  const current = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
  while (current <= today) {
    const monthStart = new Date(current);
    const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
    let monthlyTotal = 0;
    let activeCount = 0;
    const activeDeals: string[] = [];
    positions.forEach(p => {
      const start = getIncomeStart(p);
      const end = getIncomeEnd(p);
      const dealStart = new Date(start.getFullYear(), start.getMonth(), 1);
      const dealEnd = new Date(end.getFullYear(), end.getMonth() + 1, 0);
      if (monthStart <= dealEnd && monthEnd >= dealStart) {
        const monthly = ((Number(p.Investor_Amount) || 0) * (Number(p.Investor_Rate) || 0)) / 100 / 12;
        monthlyTotal += monthly;
        activeCount++;
        activeDeals.push(p.Street || 'Property');
      }
    });
    if (monthlyTotal > 0) {
      statements.push({
        period: current.toLocaleDateString('en-CA', { month: 'short', year: 'numeric' }),
        month: current.getMonth(),
        year: current.getFullYear(),
        activePositions: activeCount,
        activeDeals,
        interestEarned: Math.round(monthlyTotal),
      });
    }
    current.setMonth(current.getMonth() + 1);
  }
  return statements.reverse();
};

export default function StatementsPage() {
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  useEffect(() => {
    fetch('/api/portal/investor/positions')
      .then(r => r.json())
      .then(data => setPositions(data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const allStatements = generateMonthlyStatements(positions);
  const availableYears = Array.from(new Set(allStatements.map(s => s.year))).sort((a, b) => b - a);
  const filteredStatements = allStatements.filter(s => s.year === selectedYear);
  const yearInterest = filteredStatements.reduce((sum, s) => sum + s.interestEarned, 0);
  const allTimeInterest = allStatements.reduce((sum, s) => sum + s.interestEarned, 0);

  const activePos = positions.filter(p => isActive(p));
  const totalDeployed = activePos.reduce((sum, p) => sum + (Number(p.Investor_Amount) || 0), 0);
  const monthlyIncome = activePos.reduce((sum, p) => sum + ((Number(p.Investor_Amount) || 0) * (Number(p.Investor_Rate) || 0) / 100 / 12), 0);
  const totalLenderFees = positions.reduce((sum, p) => sum + (Number(p.Lender_Fee) || 0), 0);
  const taxYears = Array.from(new Set(allStatements.map(s => s.year))).filter(y => y < new Date().getFullYear()).sort((a, b) => b - a);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-lime/30 border-t-lime rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="font-heading text-navy text-2xl font-bold">Statements</h1>
        <p className="text-gray-400 text-sm font-body mt-0.5">Monthly earnings summaries and tax documents</p>
      </div>

      {/* KPI Bar */}
      <div className="bg-navy rounded-xl p-5 mb-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'ALL-TIME INTEREST', value: formatCurrency(allTimeInterest) },
          { label: 'LENDER FEES EARNED', value: formatCurrency(totalLenderFees) },
          { label: 'ACTIVE CAPITAL', value: formatCurrency(totalDeployed) },
          { label: 'MONTHLY INCOME', value: formatCurrency(monthlyIncome) },
        ].map((kpi, i) => (
          <div key={i} className={i > 0 ? 'sm:border-l sm:border-white/10 sm:pl-4' : ''}>
            <p className="text-gray-400 text-xs font-body uppercase tracking-wider">{kpi.label}</p>
            <p className="font-heading text-white text-xl font-bold mt-1">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Year Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {availableYears.map(year => (
          <button key={year} onClick={() => setSelectedYear(year)}
            className={`px-4 py-2 rounded-full text-sm font-body font-semibold transition-colors ${selectedYear === year ? 'bg-lime text-navy' : 'bg-white border border-gray-200 text-gray-600 hover:border-lime'}`}>
            {year}
          </button>
        ))}
      </div>

      {/* Year Summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="font-heading text-navy text-lg font-bold">{selectedYear} Summary</h2>
            <p className="text-gray-400 text-xs font-body mt-0.5">{filteredStatements.length} month{filteredStatements.length !== 1 ? 's' : ''} of activity</p>
          </div>
          <div className="text-right">
            <p className="font-heading text-navy text-2xl font-bold">{formatCurrency(yearInterest)}</p>
            <p className="text-gray-400 text-xs font-body">Total interest earned {selectedYear}</p>
          </div>
        </div>
        {allTimeInterest > 0 && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-gray-400 font-body mb-1">
              <span>{selectedYear} share of all-time returns</span>
              <span>{Math.round((yearInterest / allTimeInterest) * 100)}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full">
              <div className="h-full bg-lime rounded-full transition-all" style={{ width: `${Math.round((yearInterest / allTimeInterest) * 100)}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Monthly Statements Table */}
      <div className="bg-white rounded-xl border border-gray-200 mb-6">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-heading text-navy text-xl font-bold">Monthly Statements</h2>
          <p className="text-gray-400 text-xs font-body mt-0.5">Computed from live deal data · Statement PDFs available on request</p>
        </div>
        {filteredStatements.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-400 font-body text-sm">No activity in {selectedYear}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {['PERIOD', 'ACTIVE POSITIONS', 'INTEREST EARNED', 'STATEMENT'].map(h => (
                  <th key={h} className="text-left text-xs font-body font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredStatements.map((stmt, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5 text-sm font-body text-navy font-semibold">{stmt.period}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-col">
                      <span className="text-sm font-body text-navy">{stmt.activePositions}</span>
                      <span className="text-xs text-gray-400 font-body">{stmt.activeDeals.map(d => d.split(',')[0]).join(' · ')}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-sm font-body font-semibold text-navy">{formatCurrency(stmt.interestEarned)}</td>
                  <td className="px-5 py-3.5">
                    <a href={`mailto:mfox@foxmortgage.ca?subject=Statement Request: ${stmt.period}&body=Hi Michael,%0A%0ACould you please send me the statement for ${stmt.period}?%0A%0AThank you`}
                      className="text-lime text-xs font-body font-semibold hover:underline flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                      Request PDF
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Tax Documents */}
      <div className="bg-white rounded-xl border border-gray-200 mb-6">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-heading text-navy text-xl font-bold">Tax Documents</h2>
        </div>
        <div className="p-5">
          <div className="bg-lime/5 border border-lime/20 rounded-xl p-4 mb-5">
            <div className="flex items-start gap-3">
              <span className="text-lime text-base">ℹ️</span>
              <p className="text-gray-600 text-sm font-body">T5 slips are issued annually by February 28 for interest income earned in the prior calendar year. Contact Michael if you have not received yours.</p>
            </div>
          </div>
          {taxYears.length === 0 ? (
            <p className="text-gray-400 text-sm font-body text-center py-4">Tax documents will appear here after your first full tax year</p>
          ) : (
            <div className="space-y-3">
              {taxYears.map(year => {
                const yearTotal = allStatements.filter(s => s.year === year).reduce((sum, s) => sum + s.interestEarned, 0);
                return (
                  <div key={year} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-lime/10 rounded-lg flex items-center justify-center">
                        <svg className="w-4 h-4 text-lime" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                      </div>
                      <div>
                        <p className="text-navy font-semibold text-sm font-body">T5 — {year} Tax Year</p>
                        <p className="text-gray-400 text-xs font-body">{formatCurrency(yearTotal)} in interest income</p>
                      </div>
                    </div>
                    <a href={`mailto:mfox@foxmortgage.ca?subject=T5 Request: ${year} Tax Year&body=Hi Michael,%0A%0ACould you please send me my T5 slip for the ${year} tax year?%0A%0AThank you`}
                      className="flex items-center gap-1.5 text-lime text-sm font-body font-semibold hover:underline">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                      Request
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Trust footer */}
      <div className="pt-4 border-t border-gray-100 flex justify-between items-center text-xs text-gray-400 font-body">
        <span>Data computed from live Zoho deal records</span>
        <span>Questions? <a href="mailto:mfox@foxmortgage.ca" className="text-lime hover:underline">mfox@foxmortgage.ca</a></span>
      </div>
    </div>
  );
}
