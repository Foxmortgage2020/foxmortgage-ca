'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, FileText, Calendar, Clock, HelpCircle } from 'lucide-react';

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
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load deal');
        return res.json();
      })
      .then((data) => setDeal(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

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

  if (!deal) {
    return (
      <div className="text-center py-32">
        <p className="text-gray-500 font-body">Deal not found</p>
      </div>
    );
  }

  // Compute term in months
  const startDate = deal.First_Payment_Date ? new Date(deal.First_Payment_Date) : null;
  const maturityDate = deal.Maturity_Date ? new Date(deal.Maturity_Date) : null;
  let termMonths = 12;
  if (startDate && maturityDate) {
    termMonths =
      (maturityDate.getFullYear() - startDate.getFullYear()) * 12 +
      (maturityDate.getMonth() - startDate.getMonth());
  }

  const termRangeStr =
    startDate && maturityDate
      ? `${startDate.toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })} – ${maturityDate.toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })}`
      : '';

  // Monthly interest
  const investorAmount = deal.Investor_Amount || 0;
  const investorRate = deal.Investor_Rate || 0;
  const monthlyInterest = (investorAmount * (investorRate / 100)) / 12;

  // Generate payment rows from First_Payment_Date to now
  const now = new Date();
  const payments: { date: string; amount: string; type: string; status: 'Paid' | 'Scheduled' }[] = [];
  if (startDate && maturityDate) {
    const cursor = new Date(startDate);
    while (cursor <= maturityDate) {
      const isPaid = cursor <= now;
      payments.push({
        date: cursor.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }),
        amount: formatCurrency(Math.round(monthlyInterest)),
        type: 'Interest',
        status: isPaid ? 'Paid' : 'Scheduled',
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  const paidPayments = payments.filter((p) => p.status === 'Paid');
  const totalInterestEarned = paidPayments.length * monthlyInterest;
  const totalExpected = termMonths * monthlyInterest;
  const roi = investorAmount > 0 ? (totalInterestEarned / investorAmount) * 100 : 0;
  const progressPct = totalExpected > 0 ? Math.round((totalInterestEarned / totalExpected) * 100) : 0;

  const daysRemaining = maturityDate
    ? Math.max(0, Math.ceil((maturityDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  // Next payment date
  const nextPayment = payments.find((p) => p.status === 'Scheduled');

  const address = `${deal.Street || ''}, ${deal.City || ''} ${deal.Province || ''}`.trim();

  const overviewLeft = [
    { label: 'Loan Type', value: deal.Mortgage_Type || '—' },
    { label: 'Property Type', value: deal.Purchase_Price_Value ? 'Residential' : '—' },
    { label: 'Payment Frequency', value: deal.Payment_Frequency || 'Monthly' },
    { label: 'Appraised Value', value: deal.Purchase_Price_Value ? formatCurrency(deal.Purchase_Price_Value) : '—' },
    { label: 'LTV', value: deal.LTV ? `${deal.LTV}%` : '—' },
  ];

  const overviewRight = [
    { label: 'Borrower Type', value: deal.Contact_Name || '—' },
    { label: 'Estimated Funding', value: startDate ? startDate.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—' },
    { label: 'Exit Strategy', value: deal.Exit_Strategy || '—' },
    { label: 'File', value: deal.Deal_Name || '—' },
  ];

  const documents = [
    'Commitment Letter',
    'Appraisal Report',
    'Title Insurance',
    'Legal Package',
    'Property Insurance',
    'Monthly Statement Mar 2026',
  ];

  return (
    <div>
      {/* Back Link */}
      <Link
        href="/portal/investor/portfolio"
        className="inline-flex items-center gap-1 text-gray-500 hover:text-navy text-sm font-body mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        My Investments
      </Link>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="font-heading text-navy text-3xl">Investment Details</h1>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            Active
          </span>
        </div>
        <p className="text-gray-500 font-body">
          {address} · {deal.Mortgage_Type} Mortgage
        </p>
      </div>

      {/* Top 3 Stat Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-gray-500 text-sm font-body">Amount Invested</p>
          <p className="font-heading text-2xl text-navy">{formatCurrency(investorAmount)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-gray-500 text-sm font-body">Annual Interest Rate</p>
          <p className="font-heading text-2xl text-lime">{investorRate}%</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-gray-500 text-sm font-body">Term</p>
          <p className="font-heading text-2xl text-navy">{termMonths} months</p>
          <p className="text-gray-400 text-xs mt-1 font-body">{termRangeStr}</p>
        </div>
      </div>

      {/* Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-2 space-y-6">
          {/* Mortgage Overview */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-heading text-navy text-lg mb-4">Mortgage Overview</h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              <div className="space-y-3">
                {overviewLeft.map((item) => (
                  <div key={item.label} className="flex justify-between">
                    <span className="text-gray-500 text-sm font-body">{item.label}</span>
                    <span className="text-navy text-sm font-medium font-body">{item.value}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                {overviewRight.map((item) => (
                  <div key={item.label} className="flex justify-between">
                    <span className="text-gray-500 text-sm font-body">{item.label}</span>
                    <span className="text-navy text-sm font-medium font-body">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Payment History */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading text-navy text-lg">Payment History</h3>
              <span className="text-lime font-semibold text-sm font-body">
                Total Interest Received: {formatCurrency(Math.round(totalInterestEarned))}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-500 text-xs uppercase tracking-wider">
                    <th className="text-left py-3 font-medium">Date</th>
                    <th className="text-left py-3 font-medium">Amount</th>
                    <th className="text-left py-3 font-medium">Type</th>
                    <th className="text-left py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="font-body">
                  {payments.map((payment, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-3 text-gray-600">{payment.date}</td>
                      <td className="py-3 font-heading text-navy">{payment.amount}</td>
                      <td className="py-3 text-gray-600">{payment.type}</td>
                      <td className="py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            payment.status === 'Paid'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {payment.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Documents */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-heading text-navy text-lg mb-4">Deal Documents</h3>
            <div className="grid grid-cols-2 gap-3">
              {documents.map((doc) => (
                <div
                  key={doc}
                  className="bg-gray-50 rounded-lg p-3 flex items-center gap-3"
                >
                  <FileText className="w-5 h-5 text-red-500 flex-shrink-0" />
                  <span className="text-navy text-sm font-body flex-1">{doc}</span>
                  <button
                    onClick={() => alert(`Downloading ${doc}...`)}
                    className="text-lime text-sm font-semibold hover:underline font-body"
                  >
                    Download
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="lg:col-span-1 space-y-4">
          {/* Performance Snapshot */}
          <div className="bg-navy text-white rounded-xl p-6">
            <p className="text-gray-400 text-xs uppercase tracking-wider font-body mb-1">Interest Earned To Date</p>
            <p className="text-lime text-4xl font-heading">{formatCurrency(Math.round(totalInterestEarned))}</p>
            <div className="border-t border-white/20 pt-4 mb-4 mt-4">
              <p className="text-gray-400 text-xs uppercase tracking-wider font-body mb-1">Cumulative ROI</p>
              <p className="text-lime text-xl font-heading">{roi.toFixed(2)}%</p>
            </div>
            <div className="mb-2">
              <div className="bg-white/20 h-2 rounded-full">
                <div className="bg-lime h-2 rounded-full" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
            <p className="text-gray-400 text-xs font-body mb-4">
              Total Paid Back: {formatCurrency(Math.round(totalInterestEarned))} / {formatCurrency(Math.round(totalExpected))}
            </p>
            <div className="border-t border-white/20 pt-4">
              <p className="text-gray-400 text-xs uppercase tracking-wider font-body mb-1">Days Remaining</p>
              <p className="text-white text-2xl font-heading">{daysRemaining}</p>
            </div>
          </div>

          {/* Upcoming Schedule */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-heading text-navy text-lg mb-4">Upcoming Schedule</h3>
            <div className="space-y-3">
              <div className="bg-lime/5 border border-lime/20 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="w-4 h-4 text-lime" />
                  <span className="text-navy text-sm font-semibold font-body">Next Payment</span>
                </div>
                <p className="text-gray-600 text-sm font-body">
                  {nextPayment ? `${nextPayment.date} · ${nextPayment.amount}` : 'All payments received'}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span className="text-navy text-sm font-semibold font-body">Term Maturity</span>
                </div>
                <p className="text-gray-600 text-sm font-body">
                  {maturityDate
                    ? maturityDate.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
                    : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Notes & Updates */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-heading text-navy text-lg mb-4">Notes &amp; Updates</h3>
            <div className="space-y-4">
              <div className="border-l-2 border-lime pl-3">
                <p className="text-navy text-sm font-medium font-body">Mar 15, 2026</p>
                <p className="text-gray-500 text-sm font-body">Payment received on time</p>
              </div>
              <div className="border-l-2 border-blue-400 pl-3">
                <p className="text-navy text-sm font-medium font-body">Feb 28, 2026</p>
                <p className="text-gray-500 text-sm font-body">Property inspection completed</p>
              </div>
              <div className="border-l-2 border-gray-300 pl-3">
                <p className="text-navy text-sm font-medium font-body">Jan 15, 2026</p>
                <p className="text-gray-500 text-sm font-body">Borrower indicated renewal intention</p>
              </div>
            </div>
          </div>

          {/* Have a Question? */}
          <div className="bg-navy text-white rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <HelpCircle className="w-5 h-5 text-lime" />
              <h3 className="font-heading text-white text-lg">Have a Question?</h3>
            </div>
            <p className="text-gray-400 text-sm font-body mb-3">
              Our team is here to help with any questions about your investment.
            </p>
            <Link
              href="/portal/investor/support"
              className="block bg-lime text-navy text-center font-semibold py-2.5 rounded-lg w-full font-body hover:bg-lime/90 transition-colors"
            >
              Contact Support
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
