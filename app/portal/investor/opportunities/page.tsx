'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MapPin, Calendar, ArrowRight, Download } from 'lucide-react';

const opportunities = [
  {
    id: 'brxm-f025265',
    ref: 'BRXM-F025265',
    rate: '13%',
    status: 'available',
    loanPosition: '1st Mortgage',
    loanAmount: '$1,137,500',
    term: '12 Months',
    ltv: '65%',
    appraisedValue: '$1,750,000',
    monthlyPayment: '$13,975',
    location: 'Cambridge ON',
    fundingDate: 'Est July 2, 2026',
    exitStrategy: 'Sale of primary + B-lender refinance',
    viewers: '2 investors have viewed this deal',
  },
  {
    id: 'brxm-f025266',
    ref: 'BRXM-F025266',
    rate: '11.5%',
    status: 'available',
    loanPosition: '1st Mortgage',
    loanAmount: '$875,000',
    term: '18 Months',
    ltv: '70%',
    appraisedValue: '$1,250,000',
    monthlyPayment: '$8,385',
    location: 'London ON',
    fundingDate: 'Est July 15, 2026',
    exitStrategy: 'Construction completion & sale',
    viewers: '1 investor has viewed this deal',
  },
  {
    id: 'brxm-f025267',
    ref: 'BRXM-F025267',
    rate: '14.5%',
    status: 'pending',
    loanPosition: '2nd Mortgage',
    loanAmount: '$450,000',
    term: '9 Months',
    ltv: '75%',
    appraisedValue: '$900,000',
    monthlyPayment: '$5,437',
    location: 'Kitchener ON',
    fundingDate: '',
    exitStrategy: '',
    viewers: '',
  },
  {
    id: 'brxm-f025264',
    ref: 'BRXM-F025264',
    rate: '12%',
    status: 'funded',
    loanPosition: '1st Mortgage',
    loanAmount: '$650,000',
    term: '12 Months',
    ltv: '68%',
    appraisedValue: '',
    monthlyPayment: '',
    location: 'Toronto ON',
    fundingDate: '',
    exitStrategy: '',
    viewers: '',
  },
];

export default function InvestorOpportunitiesPage() {
  const [expressed, setExpressed] = useState<{ [key: string]: boolean }>({});

  const handleExpress = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setExpressed((prev) => ({ ...prev, [id]: true }));
  };

  const renderStatusBadge = (status: string) => {
    if (status === 'available') {
      return (
        <span className="bg-green-100 text-green-700 rounded-full px-2 py-0.5 text-xs">
          Available
        </span>
      );
    }
    if (status === 'pending') {
      return (
        <span className="bg-yellow-100 text-yellow-700 rounded-full px-2 py-0.5 text-xs">
          Pending Interest
        </span>
      );
    }
    if (status === 'funded') {
      return (
        <span className="bg-gray-100 text-gray-500 rounded-full px-2 py-0.5 text-xs">
          Fully Funded
        </span>
      );
    }
    return null;
  };

  const renderCard = (opp: (typeof opportunities)[number]) => {
    const isFunded = opp.status === 'funded';

    const cardContent = (
      <div
        className={`bg-white rounded-xl border border-gray-200 p-6 ${isFunded ? 'opacity-60' : ''}`}
      >
        <div className="flex items-start justify-between">
          <span className="text-gray-500 text-xs">{opp.ref}</span>
          <div className="text-right">
            <span
              className={`font-heading text-2xl ${isFunded ? 'text-gray-400' : 'text-navy'}`}
            >
              {opp.rate}
            </span>
            <p className="text-xs text-gray-500">Interest Rate</p>
          </div>
        </div>

        <div className="mt-2">{renderStatusBadge(opp.status)}</div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-3">
          <div>
            <p className="text-gray-500 text-xs">Loan Position</p>
            <p className="text-navy text-sm font-medium">{opp.loanPosition}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Loan Amount</p>
            <p className="text-navy text-sm font-medium">{opp.loanAmount}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Term</p>
            <p className="text-navy text-sm font-medium">{opp.term}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs">LTV</p>
            <p className="text-navy text-sm font-medium">{opp.ltv}</p>
          </div>
          {opp.appraisedValue && (
            <div>
              <p className="text-gray-500 text-xs">Appraised Value</p>
              <p className="text-navy text-sm font-medium">{opp.appraisedValue}</p>
            </div>
          )}
          {opp.monthlyPayment && (
            <div>
              <p className="text-gray-500 text-xs">Monthly Payment</p>
              <p className="text-lime font-semibold text-sm">{opp.monthlyPayment}</p>
            </div>
          )}
        </div>

        {opp.location && (
          <div className="flex items-center gap-4 mt-3 text-gray-500 text-xs">
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {opp.location}
            </span>
            {opp.fundingDate && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {opp.fundingDate}
              </span>
            )}
          </div>
        )}

        {opp.exitStrategy && (
          <div className="flex items-center gap-1 mt-2 text-gray-500 text-xs">
            <ArrowRight className="w-3 h-3" />
            {opp.exitStrategy}
          </div>
        )}

        {!isFunded && (
          <div className="mt-4">
            {expressed[opp.id] ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center text-green-700 text-sm">
                ✓ Interest registered! Michael will be in touch within 1 business day.
              </div>
            ) : (
              <button
                onClick={(e) => handleExpress(e, opp.id)}
                className="bg-lime text-navy w-full py-3 rounded-lg font-heading font-bold"
              >
                Express Interest
              </button>
            )}
            {opp.viewers && (
              <p className="text-gray-400 text-xs text-center mt-2">{opp.viewers}</p>
            )}
          </div>
        )}

        {isFunded && (
          <p className="text-gray-400 text-sm text-center py-3">Opportunity Closed</p>
        )}
      </div>
    );

    if (isFunded) {
      return <div key={opp.id}>{cardContent}</div>;
    }

    return (
      <Link key={opp.id} href={`/portal/investor/opportunities/${opp.id}`}>
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
          <span className="font-heading text-navy text-sm font-medium">3 Available</span>
        </div>
      </div>

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {opportunities.map((opp) => renderCard(opp))}
      </div>
    </div>
  );
}
