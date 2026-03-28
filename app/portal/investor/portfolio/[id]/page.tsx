'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, FileText, Calendar, Clock, HelpCircle } from 'lucide-react';

const investmentData: Record<string, {
  address: string;
  mortgageType: string;
  invested: string;
  rate: string;
  term: string;
  termRange: string;
  propertyType: string;
  paymentFreq: string;
  appraisedValue: string;
  ltv: string;
  borrowerType: string;
  estFunding: string;
  exitStrategy: string;
  appraiser: string;
  file: string;
  totalInterest: string;
  cumulativeROI: string;
  totalPaidBack: string;
  totalExpected: string;
  progressWidth: string;
  daysRemaining: number;
  payments: { date: string; amount: string; type: string; status: 'Paid' | 'Scheduled' }[];
}> = {
  '1': {
    address: '142 Wellington St, Kitchener ON',
    mortgageType: '1st Mortgage',
    invested: '$500,000',
    rate: '10.5%',
    term: '12 months',
    termRange: 'Dec 2025 – Dec 2026',
    propertyType: 'Residential',
    paymentFreq: 'Monthly',
    appraisedValue: '$725,000',
    ltv: '69%',
    borrowerType: 'Individual',
    estFunding: 'Dec 15, 2025',
    exitStrategy: 'A-lender refinance',
    appraiser: 'Kitchener Appraisal Services',
    file: 'BRXM-F025201',
    totalInterest: '$43,750',
    cumulativeROI: '8.75%',
    totalPaidBack: '$43,750',
    totalExpected: '$52,500',
    progressWidth: 'w-[83%]',
    daysRemaining: 245,
    payments: [
      { date: 'Jul 1, 2025', amount: '$4,375', type: 'Interest', status: 'Paid' },
      { date: 'Aug 1, 2025', amount: '$4,375', type: 'Interest', status: 'Paid' },
      { date: 'Sep 1, 2025', amount: '$4,375', type: 'Interest', status: 'Paid' },
      { date: 'Oct 1, 2025', amount: '$4,375', type: 'Interest', status: 'Paid' },
      { date: 'Nov 1, 2025', amount: '$4,375', type: 'Interest', status: 'Paid' },
      { date: 'Dec 1, 2025', amount: '$4,375', type: 'Interest', status: 'Paid' },
      { date: 'Jan 1, 2026', amount: '$4,375', type: 'Interest', status: 'Paid' },
      { date: 'Feb 1, 2026', amount: '$4,375', type: 'Interest', status: 'Paid' },
      { date: 'Mar 1, 2026', amount: '$4,375', type: 'Interest', status: 'Paid' },
      { date: 'Apr 1, 2026', amount: '$4,375', type: 'Interest', status: 'Scheduled' },
    ],
  },
  '2': {
    address: '88 King Street, Guelph ON',
    mortgageType: '2nd Mortgage',
    invested: '$250,000',
    rate: '13.0%',
    term: '12 months',
    termRange: 'Jun 2025 – Jun 2026',
    propertyType: 'Commercial Retail',
    paymentFreq: 'Monthly',
    appraisedValue: '$410,000',
    ltv: '78%',
    borrowerType: 'Corporation',
    estFunding: 'Jun 10, 2025',
    exitStrategy: 'Sale of property',
    appraiser: 'Guelph Valuation Group',
    file: 'BRXM-F025267',
    totalInterest: '$24,375',
    cumulativeROI: '9.75%',
    totalPaidBack: '$24,375',
    totalExpected: '$32,500',
    progressWidth: 'w-[75%]',
    daysRemaining: 62,
    payments: [
      { date: 'Jul 1, 2025', amount: '$2,708', type: 'Interest', status: 'Paid' },
      { date: 'Aug 1, 2025', amount: '$2,708', type: 'Interest', status: 'Paid' },
      { date: 'Sep 1, 2025', amount: '$2,708', type: 'Interest', status: 'Paid' },
      { date: 'Oct 1, 2025', amount: '$2,708', type: 'Interest', status: 'Paid' },
      { date: 'Nov 1, 2025', amount: '$2,708', type: 'Interest', status: 'Paid' },
      { date: 'Dec 1, 2025', amount: '$2,708', type: 'Interest', status: 'Paid' },
      { date: 'Jan 1, 2026', amount: '$2,708', type: 'Interest', status: 'Paid' },
      { date: 'Feb 1, 2026', amount: '$2,708', type: 'Interest', status: 'Paid' },
      { date: 'Mar 1, 2026', amount: '$2,708', type: 'Interest', status: 'Paid' },
      { date: 'Apr 1, 2026', amount: '$2,708', type: 'Interest', status: 'Scheduled' },
    ],
  },
};

export default function InvestmentDetail() {
  const params = useParams();
  const id = params.id as string;
  const data = investmentData[id] || investmentData['1'];

  const documents = [
    'Commitment Letter',
    'Appraisal Report',
    'Title Insurance',
    'Legal Package',
    'Property Insurance',
    'Monthly Statement Mar 2026',
  ];

  const overviewLeft = [
    { label: 'Loan Type', value: data.mortgageType },
    { label: 'Property Type', value: data.propertyType },
    { label: 'Payment Frequency', value: data.paymentFreq },
    { label: 'Appraised Value', value: data.appraisedValue },
    { label: 'LTV', value: data.ltv },
  ];

  const overviewRight = [
    { label: 'Borrower Type', value: data.borrowerType },
    { label: 'Estimated Funding', value: data.estFunding },
    { label: 'Exit Strategy', value: data.exitStrategy },
    { label: 'Appraiser', value: data.appraiser },
    { label: 'File', value: data.file },
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
          {data.address} · {data.mortgageType}
        </p>
      </div>

      {/* Top 3 Stat Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-gray-500 text-sm font-body">Amount Invested</p>
          <p className="font-heading text-2xl text-navy">{data.invested}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-gray-500 text-sm font-body">Annual Interest Rate</p>
          <p className="font-heading text-2xl text-lime">{data.rate}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-gray-500 text-sm font-body">Term</p>
          <p className="font-heading text-2xl text-navy">{data.term}</p>
          <p className="text-gray-400 text-xs mt-1 font-body">{data.termRange}</p>
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
                Total Interest Received: {data.totalInterest}
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
                  {data.payments.map((payment, i) => (
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
            <p className="text-lime text-4xl font-heading mb-4">{data.totalInterest}</p>
            <div className="border-t border-white/20 pt-4 mb-4">
              <p className="text-gray-400 text-xs uppercase tracking-wider font-body mb-1">Cumulative ROI</p>
              <p className="text-lime text-xl font-heading">{data.cumulativeROI}</p>
            </div>
            <div className="mb-2">
              <div className="bg-white/20 h-2 rounded-full">
                <div className={`bg-lime h-2 rounded-full ${data.progressWidth}`} />
              </div>
            </div>
            <p className="text-gray-400 text-xs font-body mb-4">
              Total Paid Back: {data.totalPaidBack} / {data.totalExpected}
            </p>
            <div className="border-t border-white/20 pt-4">
              <p className="text-gray-400 text-xs uppercase tracking-wider font-body mb-1">Days Remaining</p>
              <p className="text-white text-2xl font-heading">{data.daysRemaining}</p>
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
                <p className="text-gray-600 text-sm font-body">May 1, 2026 · $4,375</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span className="text-navy text-sm font-semibold font-body">Term Maturity</span>
                </div>
                <p className="text-gray-600 text-sm font-body">Dec 15, 2026</p>
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
