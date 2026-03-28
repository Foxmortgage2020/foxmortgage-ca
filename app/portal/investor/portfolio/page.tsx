'use client';

import Link from 'next/link';

export default function InvestorPortfolio() {
  const summary = [
    { label: 'Total Deployed', value: '$750,000' },
    { label: 'Active Positions', value: '2' },
    { label: 'YTD Interest Earned', value: '$52,500' },
  ];

  const positions = [
    {
      id: '1',
      address: '142 Wellington St, Kitchener ON',
      type: 'Single-Family Residential',
      mortgage: '1st Mortgage',
      file: 'BRXM-F025201',
      invested: '$500,000',
      rate: '10.5%',
      monthly: '$4,375',
      maturity: 'Dec 2026',
      progressLabel: '8 of 12 months',
      progressWidth: 'w-[66%]',
    },
    {
      id: '2',
      address: '88 King Street, Guelph ON',
      type: 'Commercial Retail',
      mortgage: '2nd Mortgage',
      file: 'BRXM-F025267',
      invested: '$250,000',
      rate: '13.0%',
      monthly: '$2,708',
      maturity: 'Jun 2026',
      progressLabel: '9 of 12 months',
      progressWidth: 'w-[75%]',
    },
  ];

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
      <div className="space-y-4">
        {positions.map((pos) => (
          <Link
            key={pos.id}
            href={`/portal/investor/portfolio/${pos.id}`}
            className="block bg-white rounded-xl border border-gray-200 p-6 hover:border-lime transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-heading text-navy text-lg">{pos.address}</h3>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Active
              </span>
            </div>
            <p className="text-gray-500 text-sm font-body mb-4">
              {pos.type} · {pos.mortgage} · File: {pos.file}
            </p>

            <div className="grid grid-cols-4 gap-4 mb-4">
              {[
                { label: 'Invested', value: pos.invested },
                { label: 'Rate', value: pos.rate },
                { label: 'Monthly', value: pos.monthly },
                { label: 'Maturity', value: pos.maturity },
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
                <span className="text-gray-500 text-xs font-body">{pos.progressLabel}</span>
              </div>
              <div className="bg-gray-200 h-2 rounded-full">
                <div className={`bg-lime h-2 rounded-full ${pos.progressWidth}`} />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
