'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download, FileText, HelpCircle } from 'lucide-react';

const documents = [
  { name: 'Mortgage Application', file: 'Application_BRXM-F025265.pdf' },
  { name: 'Appraisal Report', file: 'Appraisal_Cambridge_June2025.pdf' },
  { name: 'Plans & Permits', file: 'Cambridge_Permits_Package.pdf' },
  { name: 'Title Search', file: 'TitleSearch_ParcelD123.pdf' },
  { name: 'Credit Bureau Report', file: 'Equifax_BRXM-F025265.pdf' },
  { name: 'Construction Budget', file: 'Budget_RenoPhase2.pdf' },
  { name: 'Proof of Income', file: 'NOA_2024_ClientName.pdf' },
  { name: 'Commitment Letter', file: 'Commitment_BRXM-F025265_Draft.pdf' },
];

export default function OpportunityDetailPage() {
  const params = useParams();
  const id = (params.id as string)?.toUpperCase() || 'BRXM-F025265';
  const [decision, setDecision] = useState<null | 'accepted' | 'declined'>(null);

  return (
    <div>
      <Link
        href="/portal/investor/opportunities"
        className="flex items-center gap-1 text-lime font-body text-sm mb-4 hover:underline"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Opportunities
      </Link>

      <p className="text-gray-400 text-sm mb-4 font-body">
        Dashboard › Investment Opportunities › {id}
      </p>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-heading text-navy text-2xl">
            Complete Investment File: {id}
          </h1>
          <p className="text-gray-500 text-sm font-body mt-1">
            🔒 Confidential information. For approved investors only.
          </p>
        </div>
        <span className="bg-green-100 text-green-700 rounded-full px-3 py-1 text-xs font-medium">
          Active
        </span>
      </div>

      {/* SECTION 1: Investment Overview */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="font-heading text-navy text-lg mb-4">Investment Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-heading text-navy text-sm font-semibold mb-3">Deal Terms</h3>
            {[
              ['Loan Position', '1st Mortgage'],
              ['Loan Amount', '$1,137,500'],
              ['Interest Rate', '13%'],
              ['Monthly Payment', '$13,975'],
              ['Term', '12 Months'],
              ['Payment Frequency', 'Monthly'],
              ['Appraised Value', '$1,750,000'],
              ['LTV', '65%'],
              ['Estimated Funding', 'July 2, 2026'],
              ['Exit Strategy', 'Sale of primary + B-lender refinance'],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between border-b border-gray-100 py-2">
                <span className="text-gray-500 text-xs font-body">{label}</span>
                <span className="text-navy text-sm font-medium font-body">{value}</span>
              </div>
            ))}
          </div>
          <div>
            <h3 className="font-heading text-navy text-sm font-semibold mb-3">
              Borrower & Property Details
            </h3>
            {[
              ['Client Name', 'J. Doe (privacy protected)'],
              ['Credit Score', '612'],
              ['Primary Residence', 'Yes'],
              ['Property Address', '123 Cambridge Road, Cambridge, ON N1R 5S4'],
              ['Property Type', 'Residential'],
              ['Zoning', 'Agricultural'],
              ['Appraiser', 'Cambridge Appraisal Services'],
              ['Recent Financial Events', 'Medical hardship — resolved. Strong recovery trajectory.'],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between border-b border-gray-100 py-2">
                <span className="text-gray-500 text-xs font-body">{label}</span>
                <span
                  className={`text-sm font-medium font-body text-right max-w-[60%] ${
                    label === 'Credit Score' ? 'text-yellow-600' : 'text-navy'
                  }`}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SECTION 2: Risk Assessment & Lender Notes */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="font-heading text-navy text-lg mb-4">⚠️ Risk Assessment & Lender Notes</h2>

        <div className="mb-4">
          <h3 className="font-heading text-navy text-sm font-semibold mb-2">Lender Commentary</h3>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 text-sm text-blue-800 font-body">
            Client requires bridge financing while completing property improvements. Strong exit
            strategy with confirmed B-lender interest upon completion of renovations. Property
            value expected to increase post-renovation.
          </div>
        </div>

        <div className="mb-4">
          <h3 className="font-heading text-navy text-sm font-semibold mb-2">Risk Factors</h3>
          <div className="space-y-2 font-body text-sm text-navy">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0" />
              Below-prime credit score due to recent financial hardship
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0" />
              Renovation timeline dependency for exit strategy
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
              Strong property fundamentals and location
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
              Confirmed B-lender pre-approval interest
            </div>
          </div>
        </div>

        <div>
          <h3 className="font-heading text-navy text-sm font-semibold mb-2">
            Exit Strategy Confidence
          </h3>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800 font-body">
            ✅ 2 B-lenders have expressed conditional interest upon completion. Pre-approval
            discussions initiated — strong exit conviction.
          </div>
        </div>
      </div>

      {/* SECTION 3: Due Diligence Documents */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="font-heading text-navy text-lg mb-4">📁 Due Diligence Documents</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {documents.map((doc) => (
            <div
              key={doc.file}
              className="bg-gray-50 rounded-lg p-3 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                  <FileText className="w-4 h-4 text-red-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-navy font-body">{doc.name}</p>
                  <p className="text-gray-400 text-xs font-body">{doc.file}</p>
                </div>
              </div>
              <button className="text-lime hover:opacity-80">
                <Download className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="text-center mt-4">
          <button
            onClick={() => alert('Downloading all documents as ZIP...')}
            className="border border-gray-300 text-navy px-6 py-2 rounded-lg font-body text-sm hover:bg-gray-50"
          >
            Download All Documents (ZIP)
          </button>
        </div>
      </div>

      {/* SECTION 4: Investment Decision */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="font-heading text-navy text-lg mb-4">Investment Decision</h2>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-800 font-body">
          By accepting this investment, you confirm that you have reviewed all due diligence
          materials and understand the risks involved. Final legal documentation will be prepared
          by our legal team upon acceptance.
        </div>

        {decision === null && (
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setDecision('accepted')}
              className="bg-lime text-navy px-8 py-3 rounded-lg font-heading font-bold"
            >
              ✓ Accept Investment
            </button>
            <button
              onClick={() => setDecision('declined')}
              className="border border-gray-300 text-gray-600 px-8 py-3 rounded-lg font-body"
            >
              ✗ Decline Investment
            </button>
          </div>
        )}

        {decision === 'accepted' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center text-green-700 text-sm font-body">
            ✅ Investment accepted! Michael Fox will prepare your commitment letter and reach out
            within 1 business day to finalize the details. Thank you for your confidence in this
            opportunity.
          </div>
        )}

        {decision === 'declined' && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center text-gray-600 text-sm font-body">
            You have passed on this investment opportunity. This deal will remain available for
            other investors. If you change your mind, please contact Michael directly.
          </div>
        )}

        <div className="text-center mt-4">
          <Link
            href="/portal/investor/support"
            className="text-lime text-sm font-body hover:underline flex items-center justify-center gap-1"
          >
            <HelpCircle className="w-3 h-3" />
            Questions? Contact Support
          </Link>
        </div>
      </div>

      {/* SECTION 5: Admin Notes & Updates */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="font-heading text-navy text-lg mb-4">Admin Notes & Updates</h2>
        <div className="space-y-4">
          <div className="border-l-4 border-lime pl-4">
            <p className="text-navy text-sm font-medium font-body">
              Client has requested to fund by July 5, 2026
            </p>
            <p className="text-gray-400 text-xs font-body mt-1">
              Posted by Michael Fox on June 28, 2025
            </p>
            <p className="text-gray-500 text-xs font-body mt-1">
              Expedited timeline due to renovation schedule.
            </p>
          </div>
          <div className="border-l-4 border-blue-400 pl-4">
            <p className="text-navy text-sm font-medium font-body">
              B-lender pre-review completed
            </p>
            <p className="text-gray-400 text-xs font-body mt-1">
              Posted by Michael Fox on June 25, 2025
            </p>
            <p className="text-gray-500 text-xs font-body mt-1">
              Two B-lenders have provided conditional interest. Exit strategy confidence is high.
            </p>
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="text-center text-xs text-gray-400 mt-6 p-4 border-t border-gray-200 font-body">
        This document contains confidential information intended solely for approved investors of
        Fox Mortgage Corporation. Unauthorized distribution, reproduction, or use of this
        information is strictly prohibited. All investment decisions should be made with
        independent legal and financial counsel.
      </div>
    </div>
  );
}
