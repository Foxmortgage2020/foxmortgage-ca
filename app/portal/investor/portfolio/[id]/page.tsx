'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n);

export default function InvestmentDetail() {
  const params = useParams();
  const id = params.id as string;
  const [deal, setDeal] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/portal/investor/deal/${id}`)
      .then(res => { if (!res.ok) throw new Error('Failed to load'); return res.json() })
      .then(data => setDeal(data.data || data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex items-center justify-center py-32"><div className="w-8 h-8 border-4 border-lime border-t-transparent rounded-full animate-spin" /></div>;
  if (error) return <div className="text-center py-32"><p className="text-red-500 font-body">{error}</p></div>;
  if (!deal) return <div className="text-center py-32"><p className="text-gray-500 font-body">Deal not found</p></div>;

  // ── Data mapping ──
  const invested = Number(deal.Investor_Amount) || 0
  const rate = Number(deal.Investor_Rate) || 0
  const monthlyIncome = Number(deal.Payment_Amount) || (invested * rate / 100 / 12)
  const maturityDate = deal.Maturity_Date
  const ltv = deal.LTV
  const propertyValue = Number(deal.Purchase_Price_Value) || 0
  const mortgageType = deal.Mortgage_Type || '—'
  const paymentFreq = deal.Payment_Frequency || 'Monthly'
  const exitStrategy = deal.Exit_Strategy
  const lenderFee = Number(deal.Lender_Fee) || 0
  const firstPayment = deal.First_Payment_Date || deal.Closing_Date
  const investorStatus = deal.Investor_Status
  const dealName = deal.Deal_Name || '—'
  const street = deal.Street || ''
  const city = deal.City || ''
  const province = deal.Province || ''
  const isActive = ['Active', 'Renewal In Progress', 'Renewed'].includes(investorStatus) || (!investorStatus && deal.Deal_Status_Investor !== 'Matured')

  const monthsActive = (() => {
    if (!firstPayment) return 0
    const start = new Date(firstPayment)
    const end = investorStatus === 'Paid Out'
      ? (deal.Investor_Payout_Date ? new Date(deal.Investor_Payout_Date) : (maturityDate ? new Date(maturityDate) : new Date()))
      : new Date()
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30)))
  })()

  const interestEarned = (invested * rate / 100 / 12) * monthsActive
  const totalReturn = interestEarned + lenderFee
  const daysRemaining = maturityDate ? Math.ceil((new Date(maturityDate).getTime() - Date.now()) / 86400000) : null

  // ── Notes ──
  const getNotes = () => {
    const notes: { date: string; text: string; tag: string; tagColor: string }[] = []
    if (investorStatus === 'Renewal In Progress') {
      notes.push({ date: maturityDate ? new Date(maturityDate).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—', text: 'Mortgage reached original maturity date — renewal in progress', tag: '🔄 Renewal', tagColor: 'bg-blue-100 text-blue-700' })
    }
    if (investorStatus === 'Paid Out') {
      notes.push({ date: deal.Investor_Payout_Date ? new Date(deal.Investor_Payout_Date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : 'At maturity', text: 'Principal and final interest payment returned to investor', tag: '✅ Paid Out', tagColor: 'bg-gray-100 text-gray-600' })
    }
    if (firstPayment) {
      notes.push({ date: new Date(firstPayment).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }), text: 'First payment received — mortgage active', tag: '✔ Payment', tagColor: 'bg-green-100 text-green-700' })
    }
    if (deal.Closing_Date) {
      notes.push({ date: new Date(deal.Closing_Date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }), text: `Mortgage funded — ${formatCurrency(invested)} deployed`, tag: '📄 Admin', tagColor: 'bg-purple-100 text-purple-700' })
    }
    return notes
  }
  const notes = getNotes()

  return (
    <div>
      <Link href="/portal/investor/portfolio" className="inline-flex items-center gap-1.5 text-gray-400 text-sm font-body hover:text-navy mb-4">
        <ArrowLeft className="w-4 h-4" /> My Investments
      </Link>

      {/* Investment Snapshot */}
      <div className="bg-navy rounded-xl p-6 mb-6 text-white">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-gray-400 text-xs font-body uppercase tracking-wider">{dealName} · {street}, {city}</p>
            <h2 className="font-heading text-white text-2xl font-bold mt-1">Investment Snapshot</h2>
          </div>
          {(() => {
            const badge = investorStatus === 'Paid Out' ? { l: 'Paid Out', c: 'bg-gray-600 text-gray-200' }
              : investorStatus === 'Renewal In Progress' ? { l: 'Renewal Pending', c: 'bg-blue-500/20 text-blue-300' }
              : investorStatus === 'Legal' ? { l: 'In Legal', c: 'bg-red-500/20 text-red-300' }
              : { l: 'Performing', c: 'bg-lime/20 text-lime' }
            return <span className={`${badge.c} text-xs font-body font-semibold px-3 py-1 rounded-full`}>{badge.l}</span>
          })()}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {[
            { label: 'Amount Invested', value: formatCurrency(invested) },
            { label: 'Monthly Income', value: isActive ? formatCurrency(monthlyIncome) : '$0' },
            { label: 'Interest Rate', value: `${rate}%` },
            { label: 'Total Earned', value: formatCurrency(interestEarned) },
            { label: daysRemaining !== null && daysRemaining > 0 ? `Matures ${new Date(maturityDate).toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })}` : 'Matured',
              value: daysRemaining !== null && daysRemaining > 0 ? `${daysRemaining} days`
                : investorStatus === 'Renewal In Progress' ? 'Renewal pending'
                : investorStatus === 'Paid Out' ? 'Paid out' : '—'
            },
          ].map((item, i) => (
            <div key={i}>
              <p className="text-gray-400 text-xs font-body">{item.label}</p>
              <p className="font-heading text-white text-xl font-bold mt-0.5">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Mortgage Overview */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-heading text-navy text-lg font-bold mb-4">Mortgage Overview</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="font-body text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Core Deal</p>
                {[
                  ['Position', `${mortgageType} Mortgage`],
                  ['Property Value', propertyValue ? formatCurrency(propertyValue) : '—'],
                  ['LTV', ltv ? `${ltv}%` : '—'],
                  ['Lender Fee', lenderFee ? formatCurrency(lenderFee) : 'None'],
                ].map(([l, v]) => (
                  <div key={l} className="flex justify-between py-2 border-b border-gray-100 last:border-0">
                    <span className="text-gray-500 text-sm font-body">{l}</span>
                    <span className="text-navy font-semibold text-sm font-body">{v}</span>
                  </div>
                ))}
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="font-body text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Structure</p>
                {[
                  ['Payment Frequency', paymentFreq],
                  ['Rate Type', deal.Rate_Type || 'Fixed'],
                  ['Term Type', deal.Term_Type || 'Open'],
                  ['Closing Date', deal.Closing_Date ? new Date(deal.Closing_Date).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'],
                ].map(([l, v]) => (
                  <div key={l} className="flex justify-between py-2 border-b border-gray-100 last:border-0">
                    <span className="text-gray-500 text-sm font-body">{l}</span>
                    <span className="text-navy font-semibold text-sm font-body">{v}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Exit Strategy */}
            <div className="bg-lime/5 border border-lime/20 rounded-xl p-4 mt-4">
              <p className="font-body text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Exit Strategy</p>
              <p className="text-gray-600 text-sm font-body leading-relaxed">{exitStrategy || 'Exit strategy to be confirmed'}</p>
            </div>
          </div>

          {/* Payment History */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-heading text-navy text-lg font-bold">Payment History</h3>
              <span className="text-lime text-sm font-body font-semibold">Total Received: {formatCurrency(interestEarned)}</span>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4">
              <p className="text-green-700 text-sm font-body font-semibold">✓ {monthsActive} payment{monthsActive !== 1 ? 's' : ''} received · All on time</p>
              <p className="text-green-600 text-xs font-body mt-0.5">Detailed payment records coming soon</p>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100 text-gray-400 text-xs uppercase tracking-wider"><th className="text-left py-2 font-medium">Date</th><th className="text-left py-2 font-medium">Amount</th><th className="text-left py-2 font-medium">Type</th><th className="text-left py-2 font-medium">Status</th></tr></thead>
              <tbody><tr><td colSpan={4} className="py-6 text-center text-gray-400 text-sm font-body">Detailed records available on request</td></tr></tbody>
            </table>
          </div>

          {/* Documents */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-heading text-navy text-lg font-bold mb-4">Deal Documents</h3>
            <div className="grid grid-cols-2 gap-3">
              {['Commitment Letter', 'Appraisal Report', 'Title Insurance', 'Legal Package', 'Property Insurance'].map(doc => (
                <div key={doc} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    <span className="text-gray-600 text-sm font-body">{doc}</span>
                  </div>
                  <a href={`mailto:mfox@foxmortgage.ca?subject=Document Request: ${doc} - ${dealName}`} className="text-lime text-xs font-body font-semibold hover:underline">Request →</a>
                </div>
              ))}
            </div>
            <p className="text-gray-400 text-xs font-body mt-3 text-center">Documents available on request · mfox@foxmortgage.ca</p>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          {/* Returns Summary */}
          <div className="bg-navy rounded-xl p-5 text-white">
            <p className="text-gray-400 text-xs font-body uppercase tracking-wider mb-4">Returns Summary</p>
            <div className="space-y-4">
              <div>
                <p className="text-gray-400 text-xs font-body">Interest Earned</p>
                <p className="font-heading text-lime text-3xl font-bold">{formatCurrency(interestEarned)}</p>
                <p className="text-gray-500 text-xs font-body mt-0.5">{monthsActive} month{monthsActive !== 1 ? 's' : ''} × {formatCurrency(invested * rate / 100 / 12)}/mo</p>
              </div>
              {lenderFee > 0 && (
                <div className="pt-3 border-t border-white/10">
                  <p className="text-gray-400 text-xs font-body">Lender Fee</p>
                  <p className="font-heading text-white text-xl font-bold">{formatCurrency(lenderFee)}</p>
                  <p className="text-gray-500 text-xs font-body mt-0.5">One-time origination fee</p>
                </div>
              )}
              <div className="pt-3 border-t border-white/10">
                <p className="text-gray-400 text-xs font-body">Total Return</p>
                <p className="font-heading text-lime text-2xl font-bold">{formatCurrency(totalReturn)}</p>
                <p className="text-gray-500 text-xs font-body mt-0.5">Interest + fees combined</p>
              </div>
            </div>
          </div>

          {/* What Happens Next */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="font-heading text-navy font-semibold text-sm mb-3">What Happens Next</p>
            {investorStatus === 'Paid Out' && (
              <div className="flex items-start gap-2"><span className="text-gray-400 text-sm">✅</span><p className="text-gray-600 text-sm font-body">Capital returned to investor. This position is closed.</p></div>
            )}
            {investorStatus === 'Renewal In Progress' && (
              <div className="space-y-2">
                <div className="flex items-start gap-2"><span className="text-blue-400 text-sm">🔄</span><p className="text-gray-600 text-sm font-body">Renewal agreement in progress. Payments continuing on original terms.</p></div>
                <div className="flex items-start gap-2"><span className="text-gray-400 text-sm">→</span><p className="text-gray-500 text-xs font-body">Contact Michael Fox for renewal timeline</p></div>
              </div>
            )}
            {investorStatus === 'Legal' && (
              <div className="flex items-start gap-2"><span className="text-red-400 text-sm">⚠️</span><p className="text-gray-600 text-sm font-body">Legal proceedings in progress. Contact Michael Fox immediately.</p></div>
            )}
            {(investorStatus === 'Active' || investorStatus === 'Renewed' || !investorStatus) && daysRemaining !== null && (
              daysRemaining <= 90 && daysRemaining > 0 ? (
                <div className="flex items-start gap-2"><span className="text-yellow-400 text-sm">⏰</span><p className="text-gray-600 text-sm font-body">Matures in {daysRemaining} days. Renewal discussion upcoming.</p></div>
              ) : daysRemaining > 0 ? (
                <div className="flex items-start gap-2"><span className="text-lime text-sm">✅</span><p className="text-gray-600 text-sm font-body">Performing on schedule. Next payment {new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleDateString('en-CA', { month: 'long', day: 'numeric' })}.</p></div>
              ) : null
            )}
          </div>

          {/* Upcoming Schedule */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="font-heading text-navy font-semibold text-sm mb-3">Upcoming Schedule</p>
            {isActive ? (
              <div className="space-y-2">
                <div className="bg-lime/5 border border-lime/20 rounded-lg p-3 flex justify-between items-center">
                  <div><p className="text-navy text-sm font-body font-semibold">Next Payment</p><p className="text-gray-500 text-xs font-body">{new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}</p></div>
                  <p className="text-lime font-heading font-semibold">{formatCurrency(monthlyIncome)}</p>
                </div>
                {maturityDate && (
                  <div className="bg-gray-50 rounded-lg p-3 flex justify-between items-center">
                    <div><p className="text-navy text-sm font-body font-semibold">Term Maturity</p><p className="text-gray-500 text-xs font-body">{new Date(maturityDate).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}</p></div>
                    <span className="text-gray-400 text-sm">📅</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-500 text-sm font-body">No upcoming payments — position {investorStatus === 'Paid Out' ? 'paid out' : 'inactive'}</p>
            )}
          </div>

          {/* Notes & Updates */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="font-heading text-navy font-semibold text-sm mb-3">Notes & Updates</p>
            <div className="space-y-0">
              {notes.map((note, i) => (
                <div key={i} className="flex gap-3 pb-4 border-b border-gray-100 last:border-0 last:pb-0">
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-lime mt-1.5 shrink-0" />
                    {i < notes.length - 1 && <div className="w-px bg-gray-200 flex-1 mt-1" />}
                  </div>
                  <div className="flex-1 pb-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-gray-400 text-xs font-body">{note.date}</span>
                      <span className={`${note.tagColor} text-xs font-body px-2 py-0.5 rounded-full`}>{note.tag}</span>
                    </div>
                    <p className="text-gray-600 text-sm font-body">{note.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Contact */}
          <div className="bg-navy text-white rounded-xl p-5">
            <p className="font-heading text-white font-semibold text-sm mb-2">Have a Question?</p>
            <p className="text-gray-400 text-sm font-body mb-3">Contact Michael directly about this investment.</p>
            <a href={`mailto:mfox@foxmortgage.ca?subject=Question about ${dealName}`}
              className="block w-full bg-lime text-navy rounded-lg py-2 text-center font-heading font-semibold text-sm hover:bg-lime/90 transition-colors">
              Contact Support
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
