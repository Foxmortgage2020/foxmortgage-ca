'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n);

// ── Investor_Status helpers ──

const isIncomeActive = (p: any): boolean => {
  const s = p.Investor_Status
  return ['Active', 'Renewal In Progress', 'Renewed'].includes(s)
    || (!s && p.Deal_Status_Investor !== 'Matured')
}

const getStatusLabel = (p: any) => {
  const s = p.Investor_Status
  const daysLeft = p.Maturity_Date
    ? Math.ceil((new Date(p.Maturity_Date).getTime() - Date.now()) / 86400000) : null
  switch (s) {
    case 'Active':
      if (daysLeft !== null && daysLeft <= 90 && daysLeft > 0)
        return { label: 'Maturing Soon', color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' }
      return { label: 'Performing', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' }
    case 'Renewal In Progress':
      return { label: 'Renewal Pending', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-400' }
    case 'Renewed':
      return { label: 'Performing', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' }
    case 'Paid Out':
      return { label: 'Paid Out', color: 'bg-gray-100 text-gray-500', dot: 'bg-gray-400' }
    case 'Legal':
      return { label: 'In Legal', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' }
    default:
      if (p.Deal_Status_Investor === 'Matured')
        return { label: 'Paid Out', color: 'bg-gray-100 text-gray-500', dot: 'bg-gray-400' }
      return { label: 'Performing', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' }
  }
}

const getNextAction = (p: any) => {
  switch (p.Investor_Status) {
    case 'Paid Out':
      return `Capital returned ${p.Investor_Payout_Date
        ? new Date(p.Investor_Payout_Date).toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })
        : 'at maturity'}`
    case 'Renewal In Progress':
      return 'Renewal agreement in progress — payments continuing'
    case 'Renewed':
      return `Renewed · New maturity ${p.Maturity_Date
        ? new Date(p.Maturity_Date).toLocaleDateString('en-CA', { month: 'short', year: 'numeric' }) : '—'}`
    case 'Legal':
      return 'Legal proceedings in progress — contact Michael Fox'
    default: {
      const daysLeft = p.Maturity_Date
        ? Math.ceil((new Date(p.Maturity_Date).getTime() - Date.now()) / 86400000) : null
      if (daysLeft !== null && daysLeft <= 90 && daysLeft > 0)
        return `Matures in ${daysLeft} days — renewal discussion upcoming`
      if (daysLeft !== null && daysLeft > 0)
        return `Next payment ${new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
          .toLocaleDateString('en-CA', { month: 'long', day: 'numeric' })}`
      return 'Active'
    }
  }
}

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
        if (data.setup_pending || data.setup_required) { setSetupRequired(true); setPositions(data.data || []) }
        else if (data.error) { setError(data.error) }
        else { setPositions(data.data || []) }
      })
      .catch((err) => setError(err.message ?? 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24">
      <div className="w-8 h-8 border-4 border-lime border-t-transparent rounded-full animate-spin mb-4" />
      <p className="font-body text-gray-500">Loading your portfolio...</p>
    </div>
  );
  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
      <h2 className="font-heading text-navy text-lg mb-2">Something went wrong</h2>
      <p className="font-body text-gray-600">{error}</p>
    </div>
  );
  if (setupRequired) return (
    <div className="bg-lime/10 border border-lime/30 rounded-xl p-6 text-center">
      <h2 className="font-heading text-navy text-lg mb-2">Portfolio Setup Pending</h2>
      <p className="font-body text-gray-600">Contact Michael at <a href="mailto:mfox@foxmortgage.ca" className="text-lime font-semibold hover:underline">mfox@foxmortgage.ca</a> to complete setup.</p>
    </div>
  );

  // ── Calculations ──
  const activePositions = positions.filter(p => isIncomeActive(p))
  const totalDeployed = activePositions.reduce((sum, p) => sum + (Number(p.Investor_Amount) || 0), 0)
  const monthlyIncome = activePositions.reduce((sum, p) =>
    sum + ((Number(p.Investor_Amount) || 0) * (Number(p.Investor_Rate) || 0) / 100 / 12), 0)

  const ytdStart = new Date(new Date().getFullYear(), 0, 1)
  const ytdInterest = positions.reduce((sum, p) => {
    const start = p.First_Payment_Date || p.Closing_Date
    if (!start) return sum
    const startDate = new Date(start)
    const endDate = p.Investor_Status === 'Paid Out'
      ? (p.Investor_Payout_Date ? new Date(p.Investor_Payout_Date) : (p.Maturity_Date ? new Date(p.Maturity_Date) : new Date()))
      : new Date()
    const effectiveStart = startDate > ytdStart ? startDate : ytdStart
    if (effectiveStart > endDate) return sum
    const months = Math.max(0, Math.round((endDate.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24 * 30)))
    return sum + ((Number(p.Investor_Amount) || 0) * (Number(p.Investor_Rate) || 0) / 100 / 12) * months
  }, 0)

  const kpis = [
    { label: 'ACTIVE CAPITAL DEPLOYED', value: formatCurrency(totalDeployed), sub: `${activePositions.length} position${activePositions.length !== 1 ? 's' : ''} generating returns` },
    { label: 'MONTHLY INCOME', value: formatCurrency(monthlyIncome), sub: 'Current run rate' },
    { label: 'YTD INTEREST EARNED', value: formatCurrency(ytdInterest), sub: `${new Date().getFullYear()} to date` },
    { label: 'ALL POSITIONS', value: String(positions.length), sub: `${activePositions.length} active · ${positions.length - activePositions.length} paid out` },
  ]

  return (
    <div>
      {/* KPI Bar */}
      <div className="bg-navy text-white rounded-xl p-6 mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map(k => (
          <div key={k.label} className="text-center">
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-1 font-body">{k.label}</p>
            <p className="font-heading text-2xl text-white">{k.value}</p>
            <p className="text-gray-500 text-xs font-body mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Position Cards */}
      {positions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="font-body text-gray-500">No positions. Contact Michael at <a href="mailto:mfox@foxmortgage.ca" className="text-lime font-semibold hover:underline">mfox@foxmortgage.ca</a></p>
        </div>
      ) : (
        <div className="space-y-4">
          {positions.map((pos) => {
            const amt = Number(pos.Investor_Amount) || 0
            const rate = Number(pos.Investor_Rate) || 0
            const mi = (amt * rate / 100) / 12
            const status = getStatusLabel(pos)
            const isPaidOut = pos.Investor_Status === 'Paid Out' || (!pos.Investor_Status && pos.Deal_Status_Investor === 'Matured')
            const isRenewal = pos.Investor_Status === 'Renewal In Progress'
            const address = `${pos.Street ?? ''}${pos.City ? `, ${pos.City}` : ''}${pos.Province ? ` ${pos.Province}` : ''}`
            const matFmt = pos.Maturity_Date ? new Date(pos.Maturity_Date).toLocaleDateString('en-CA', { month: 'short', year: 'numeric' }) : '—'

            // Progress
            const startDate = pos.First_Payment_Date || pos.Closing_Date
            const endDate = pos.Investor_Payout_Date || pos.Maturity_Date
            let progressPct = 0, progressLabel = '—'
            if (startDate && endDate) {
              const s = new Date(startDate).getTime()
              const e = new Date(endDate).getTime()
              const totalMs = e - s
              const elapsedMs = Math.min(Date.now(), e) - s
              if (totalMs > 0) {
                progressPct = Math.min(100, Math.max(0, Math.round((elapsedMs / totalMs) * 100)))
                const em = Math.round(elapsedMs / (1000 * 60 * 60 * 24 * 30))
                const tm = Math.round(totalMs / (1000 * 60 * 60 * 24 * 30))
                progressLabel = isPaidOut ? 'Term complete' : isRenewal ? 'Renewal pending' : `${em} of ${tm} months`
              }
            }
            const barColor = isPaidOut ? 'bg-gray-300' : isRenewal ? 'bg-amber-400' : 'bg-lime'

            return (
              <div key={pos.id} onClick={() => router.push(`/portal/investor/portfolio/${pos.id}`)}
                className="bg-white rounded-xl border border-gray-200 p-6 hover:border-lime transition-colors cursor-pointer hover:shadow-sm">
                <div className="flex items-start justify-between mb-1">
                  <h3 className="font-heading text-navy text-lg">{address}</h3>
                  <span className={`${status.color} rounded-full px-3 py-1 text-xs font-medium flex items-center gap-1.5 shrink-0`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                    {status.label}
                  </span>
                </div>
                <p className="text-gray-500 text-sm font-body mb-4">
                  {pos.Deal_Name ? `${pos.Deal_Name} · ` : ''}{pos.Mortgage_Type} Mortgage
                </p>

                <div className="grid grid-cols-4 gap-4 mb-4">
                  <div>
                    <p className="text-gray-400 text-xs font-body">Invested</p>
                    <p className="font-heading text-navy font-semibold">{formatCurrency(amt)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-xs font-body">Rate</p>
                    <p className="font-heading text-navy font-semibold">{rate}%</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-xs font-body">Monthly Interest</p>
                    {isPaidOut ? (
                      <div>
                        <span className="line-through text-gray-300 text-xs mr-1">{formatCurrency(mi)}</span>
                        <span className="text-gray-500 text-sm">$0 (paid out)</span>
                      </div>
                    ) : (
                      <p className="font-heading text-navy font-semibold">{formatCurrency(mi)}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-gray-400 text-xs font-body">Maturity</p>
                    <p className="font-heading text-navy font-semibold">{matFmt}</p>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1 font-body">
                    <span>Term Progress</span>
                    <span>{progressLabel}</span>
                  </div>
                  <div className="bg-gray-200 rounded-full h-2">
                    <div className={`${barColor} rounded-full h-2 transition-all`}
                      style={{ width: `${isPaidOut ? 100 : progressPct}%` }} />
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2">
                  <span className="text-xs font-body text-gray-400">→</span>
                  <span className="text-xs font-body text-gray-500">{getNextAction(pos)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  );
}
