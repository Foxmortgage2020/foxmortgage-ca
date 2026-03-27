'use client'

export default function SMMDashboardCard() {
  return (
    <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 w-full max-w-sm mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="font-body text-xs text-gray-500 uppercase tracking-wider">Strategic Mortgage Monitoring</p>
          <p className="font-heading font-bold text-navy text-sm mt-0.5">Your Dashboard</p>
        </div>
        <div className="relative flex items-center">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping-slow absolute inline-flex h-full w-full rounded-full bg-lime opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-lime"></span>
          </span>
          <span className="font-body text-xs text-lime font-medium ml-2">Active</span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="font-body text-xs text-gray-500 mb-1">Current Rate</p>
          <p className="font-heading font-bold text-navy text-lg">5.24%</p>
          <p className="font-body text-xs text-gray-400">Fixed · 5yr</p>
        </div>
        <div className="bg-lime/10 rounded-xl p-3 border border-lime/20">
          <p className="font-body text-xs text-gray-500 mb-1">Market Rate</p>
          <p className="font-heading font-bold text-lime-dark text-lg">4.89%</p>
          <p className="font-body text-xs text-lime-dark">↓ Opportunity</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="font-body text-xs text-gray-500 mb-1">Next Renewal</p>
          <p className="font-heading font-bold text-navy text-base">Mar 2026</p>
          <p className="font-body text-xs text-gray-400">11 months</p>
        </div>
        <div className="bg-navy/5 rounded-xl p-3">
          <p className="font-body text-xs text-gray-500 mb-1">Est. Savings</p>
          <p className="font-heading font-bold text-navy text-base">$4,200</p>
          <p className="font-body text-xs text-gray-400">Over 5 years</p>
        </div>
      </div>

      {/* Last checked */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-lime"></div>
          <span className="font-body text-xs text-gray-500">Last checked: Today, 6:00 AM</span>
        </div>
        <span className="font-body text-xs font-medium text-navy">View Report →</span>
      </div>
    </div>
  )
}
