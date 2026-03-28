'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Download, FileText, Info } from 'lucide-react';

export default function StatementsPage() {
  const [activeYear, setActiveYear] = useState('2026');

  const years = ['2026', '2025', '2024'];

  const summaryCards = [
    { value: '$52,500', label: 'Interest Earned', sub: '2026 YTD' },
    { value: '$750,000', label: 'Capital Deployed', sub: 'Current' },
    { value: '10.5%', label: 'Avg Return', sub: '2026 YTD' },
  ];

  const monthlyStatements = [
    { period: 'Mar 2026', positions: 2, interest: '$7,083' },
    { period: 'Feb 2026', positions: 2, interest: '$7,083' },
    { period: 'Jan 2026', positions: 2, interest: '$7,083' },
    { period: 'Dec 2025', positions: 1, interest: '$4,375' },
    { period: 'Nov 2025', positions: 1, interest: '$4,375' },
    { period: 'Oct 2025', positions: 1, interest: '$4,375' },
  ];

  const taxDocuments = [
    { name: 'T5 — 2025 Tax Year' },
    { name: 'T5 — 2024 Tax Year' },
  ];

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-navy mb-1">Statements & Tax Documents</h1>
      <p className="font-body text-gray-500 text-sm mb-6">View your monthly statements, earnings summaries, and tax documents</p>

      {/* Year Tabs */}
      <div className="flex gap-2 mb-6">
        {years.map((year) => (
          <button
            key={year}
            onClick={() => setActiveYear(year)}
            className={
              activeYear === year
                ? 'bg-lime text-navy font-semibold rounded-full px-4 py-1 text-sm'
                : 'bg-white border border-gray-200 text-gray-600 rounded-full px-4 py-1 text-sm cursor-pointer'
            }
          >
            {year}
          </button>
        ))}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {summaryCards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-6">
            <p className="font-heading text-2xl font-bold text-navy">{card.value}</p>
            <p className="font-body text-gray-500 text-sm">{card.label}</p>
            <p className="font-body text-gray-400 text-xs">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Monthly Statements Table */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="font-heading text-lg font-bold text-navy mb-4">Monthly Statements</h2>
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-gray-400 font-body uppercase tracking-wider border-b">
              <th className="pb-3">Period</th>
              <th className="pb-3">Active Positions</th>
              <th className="pb-3">Interest Earned</th>
              <th className="pb-3">Documents</th>
            </tr>
          </thead>
          <tbody className="font-body text-sm">
            {monthlyStatements.map((row) => (
              <tr key={row.period} className="border-b last:border-b-0">
                <td className="py-3 text-navy font-medium">{row.period}</td>
                <td className="py-3 text-navy">{row.positions}</td>
                <td className="py-3 text-navy font-heading font-semibold">{row.interest}</td>
                <td className="py-3">
                  <button
                    onClick={() => alert('Contact mfox@foxmortgage.ca to request your statement')}
                    className="border border-gray-200 text-navy rounded-lg px-3 py-1 text-sm hover:border-lime transition-colors inline-flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" />
                    Download PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tax Documents */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-heading text-lg font-bold text-navy mb-4">Tax Documents</h2>
        <div className="bg-lime/10 border border-lime/30 rounded-lg p-3 mb-4 text-sm font-body text-navy flex items-start gap-2">
          <Info className="w-4 h-4 mt-0.5 text-lime flex-shrink-0" />
          <span>T5 slips are issued annually by February 28 for interest income earned in the prior calendar year. Contact us if you have not received yours.</span>
        </div>
        <div className="space-y-3">
          {taxDocuments.map((doc) => (
            <div key={doc.name} className="flex items-center justify-between py-3 border-b last:border-b-0">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-lime" />
                <span className="font-body text-sm text-navy font-medium">{doc.name}</span>
              </div>
              <button
                onClick={() => alert('Contact mfox@foxmortgage.ca to request your statement')}
                className="border border-gray-200 text-navy rounded-lg px-3 py-1 text-sm hover:border-lime transition-colors inline-flex items-center gap-1"
              >
                <Download className="w-3 h-3" />
                Download
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
