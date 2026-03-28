'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { MapPin, ArrowRight } from 'lucide-react';

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n);

export default function InvestorOpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expressed, setExpressed] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    fetch('/api/portal/investor/opportunities')
      .then(async (res) => {
        const data = await res.json()
        if (data.error) {
          setError(data.error)
        } else {
          setOpportunities(data.data || (Array.isArray(data) ? data : []))
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleExpress = async (e: React.MouseEvent, dealId: string) => {
    e.preventDefault();
    setExpressed((prev) => ({ ...prev, [dealId]: true }));
    try {
      await fetch('/api/portal/investor/express-interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId }),
      });
    } catch {
      // silently fail – confirmation already shown
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-4 border-lime border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-32">
        <p className="text-red-500 font-body">{error}</p>
      </div>
    );
  }

  const availableOpps = opportunities.filter((o) => o.Stage !== 'Funded' && o.Stage !== 'Closed');

  const renderCard = (opp: any) => {
    const amount = opp.Amount || opp.Investor_Amount || 0;
    const rate = opp.Investor_Rate || 0;
    const ltv = opp.LTV || 0;
    const monthlyInterest = (amount * (rate / 100)) / 12;
    const dealId = opp.id || opp.Deal_Name || '';

    const cardContent = (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between">
          <span className="text-xs text-gray-400 font-mono">{opp.Deal_Name || '—'}</span>
          <div className="text-right">
            <span className="font-heading text-2xl text-navy">{rate}%</span>
            <p className="text-xs text-gray-500">Interest Rate</p>
          </div>
        </div>

        <div className="mt-2">
          <span className="bg-green-100 text-green-700 rounded-full px-2 py-0.5 text-xs">
            Available
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-3">
          <div>
            <p className="text-gray-500 text-xs font-body">Loan Position</p>
            <p className="text-navy text-sm font-medium font-body">{opp.Mortgage_Type || '—'}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs font-body">Loan Amount</p>
            <p className="text-navy text-sm font-medium font-body">{formatCurrency(amount)}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs font-body">LTV</p>
            <p className="text-navy text-sm font-medium font-body">{ltv}%</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs font-body">Monthly Interest</p>
            <p className="text-lime font-semibold text-sm">{formatCurrency(Math.round(monthlyInterest))}</p>
          </div>
        </div>

        {(opp.City || opp.Province) && (
          <div className="flex items-center gap-1 mt-3 text-gray-500 text-xs font-body">
            <MapPin className="w-3 h-3" />
            {opp.City}{opp.City && opp.Province ? ', ' : ''}{opp.Province}
          </div>
        )}

        {opp.Exit_Strategy && (
          <div className="flex items-center gap-1 mt-2 text-gray-500 text-xs font-body">
            <ArrowRight className="w-3 h-3" />
            {opp.Exit_Strategy.length > 60 ? opp.Exit_Strategy.slice(0, 60) + '...' : opp.Exit_Strategy}
          </div>
        )}

        <div className="mt-4">
          {expressed[dealId] ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center text-green-700 text-sm font-body">
              Interest registered! Michael will be in touch within 1 business day.
            </div>
          ) : (
            <button
              onClick={(e) => handleExpress(e, dealId)}
              className="bg-lime text-navy w-full py-3 rounded-lg font-heading font-bold"
            >
              Express Interest
            </button>
          )}
        </div>
      </div>
    );

    return (
      <Link key={dealId} href={`/portal/investor/opportunities/${dealId}`}>
        {cardContent}
      </Link>
    );
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-heading text-navy text-2xl">
            Available Investment Opportunities
          </h1>
          <p className="text-gray-500 font-body text-sm mt-1">
            New opportunities are presented to existing investors first. Express interest to
            reserve your position.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-green-500 rounded-full inline-block" />
          <span className="font-heading text-navy text-sm font-medium">
            {availableOpps.length} Available
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <select className="font-body text-sm border border-gray-200 rounded-lg px-3 py-2">
            <option>All Types</option>
            <option>1st Mortgage</option>
            <option>2nd Mortgage</option>
            <option>Construction</option>
            <option>Bridge</option>
          </select>
          <select className="font-body text-sm border border-gray-200 rounded-lg px-3 py-2">
            <option>Any Rate</option>
            <option>8-10%</option>
            <option>10-12%</option>
            <option>12-14%</option>
            <option>14%+</option>
          </select>
          <select className="font-body text-sm border border-gray-200 rounded-lg px-3 py-2">
            <option>Any Term</option>
            <option>3-6 months</option>
            <option>6-12 months</option>
            <option>12-18 months</option>
          </select>
          <select className="font-body text-sm border border-gray-200 rounded-lg px-3 py-2">
            <option>All Regions</option>
            <option>Wellington County</option>
            <option>Guelph</option>
            <option>Kitchener-Waterloo</option>
            <option>GTA</option>
          </select>
          <select className="font-body text-sm border border-gray-200 rounded-lg px-3 py-2">
            <option>Any LTV</option>
            <option>Under 65%</option>
            <option>65-70%</option>
            <option>70-75%</option>
          </select>
        </div>
      </div>

      {availableOpps.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-500 font-body text-lg mb-2">
            No opportunities available right now.
          </p>
          <p className="text-gray-400 font-body text-sm">
            New deals are added regularly. Contact Michael to be notified first.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {availableOpps.map((opp) => renderCard(opp))}
        </div>
      )}
    </div>
  );
}
