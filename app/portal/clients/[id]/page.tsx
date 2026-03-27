'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock,
  User,
  Home,
  Calendar,
  FileText,
  Send,
  AlertTriangle,
} from 'lucide-react'

const steps = [
  { number: 1, label: 'Referral Received' },
  { number: 2, label: 'Initial Consult' },
  { number: 3, label: 'Application' },
  { number: 4, label: 'Document Collection' },
  { number: 5, label: 'Lender Submission' },
  { number: 6, label: 'Approval' },
  { number: 7, label: 'Conditions' },
  { number: 8, label: 'Closing' },
  { number: 9, label: 'Funded' },
]

const currentStep = 6

const clientInfo = {
  name: 'Sarah Johnson',
  email: 'sarah.johnson@email.com',
  phone: '(416) 555-0192',
  referredBy: 'John Smith — Smith Financial Planning',
  referralDate: 'Jan 15, 2026',
}

const mortgageDetails = {
  address: '142 Maple Drive, Toronto, ON M5V 2T6',
  purchasePrice: '$620,000',
  mortgageAmount: '$482,000',
  downPayment: '$138,000 (22.3%)',
  rate: '4.89% — 5-year fixed',
  lender: 'TD Bank',
  closingDate: 'Apr 30, 2026',
  term: '5 years',
  amortization: '25 years',
}

const timeline = [
  {
    date: 'Mar 25, 2026',
    title: 'Rate hold confirmed at 4.89%',
    description:
      'TD Bank confirmed the rate hold for 120 days. Client is protected against any rate increases until closing.',
    icon: CheckCircle2,
    color: 'text-lime',
  },
  {
    date: 'Mar 20, 2026',
    title: 'Appraisal completed — $625,000',
    description:
      'Property appraised at $625,000, exceeding the purchase price. No issues flagged.',
    icon: FileText,
    color: 'text-blue-500',
  },
  {
    date: 'Mar 12, 2026',
    title: 'Conditional approval received',
    description:
      'Lender issued conditional approval. Outstanding conditions: proof of insurance, signed commitment letter.',
    icon: Clock,
    color: 'text-amber-500',
  },
]

const actionItems = [
  {
    label: 'Client to provide proof of home insurance',
    priority: 'High',
    dueDate: 'Apr 5, 2026',
  },
  {
    label: 'Signed commitment letter needed from client',
    priority: 'High',
    dueDate: 'Apr 5, 2026',
  },
  {
    label: 'Schedule lawyer for closing — recommend client book by Apr 10',
    priority: 'Medium',
    dueDate: 'Apr 10, 2026',
  },
]

const priorityColors: Record<string, string> = {
  High: 'bg-red-100 text-red-700',
  Medium: 'bg-amber-100 text-amber-700',
  Low: 'bg-green-100 text-green-700',
}

export default function ClientFilePage() {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')

  return (
    <div>
      {/* Back Link */}
      <Link
        href="/portal/clients"
        className="inline-flex items-center gap-2 text-gray-500 hover:text-navy font-body text-sm mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Clients
      </Link>

      {/* Header */}
      <div className="mb-8">
        <h2 className="font-heading font-bold text-navy text-2xl mb-1">
          Mortgage File for {clientInfo.name}
        </h2>
        <p className="font-body text-sm text-gray-500 mb-1">
          {mortgageDetails.address}
        </p>
        <p className="font-body text-xs text-gray-400">
          Referred {clientInfo.referralDate} &middot; Estimated closing{' '}
          {mortgageDetails.closingDate}
        </p>
      </div>

      {/* 9-Step Progress Tracker */}
      <div className="bg-white border border-gray-100 rounded-xl p-6 mb-8 overflow-x-auto">
        <div className="flex items-center min-w-[700px]">
          {steps.map((step, i) => {
            const completed = step.number < currentStep
            const current = step.number === currentStep
            const future = step.number > currentStep

            return (
              <div key={step.number} className="flex items-center flex-1 last:flex-initial">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-heading font-bold ${
                      completed
                        ? 'bg-lime text-navy'
                        : current
                        ? 'bg-navy text-white ring-4 ring-lime/30'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {completed ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      step.number
                    )}
                  </div>
                  <span
                    className={`font-body text-[10px] mt-1.5 text-center whitespace-nowrap ${
                      completed
                        ? 'text-navy font-semibold'
                        : current
                        ? 'text-navy font-bold'
                        : 'text-gray-400'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-2 mt-[-16px] ${
                      step.number < currentStep ? 'bg-lime' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Client Information */}
        <div className="bg-white border border-gray-100 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <User className="w-5 h-5 text-navy" />
            <h3 className="font-heading font-bold text-navy text-base">
              Client Information
            </h3>
          </div>
          <dl className="space-y-3">
            {[
              ['Name', clientInfo.name],
              ['Email', clientInfo.email],
              ['Phone', clientInfo.phone],
              ['Referred By', clientInfo.referredBy],
              ['Referral Date', clientInfo.referralDate],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <dt className="font-body text-sm text-gray-500">{label}</dt>
                <dd className="font-body text-sm text-navy font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Mortgage Details */}
        <div className="bg-white border border-gray-100 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Home className="w-5 h-5 text-navy" />
            <h3 className="font-heading font-bold text-navy text-base">
              Mortgage Details
            </h3>
          </div>
          <dl className="space-y-3">
            {[
              ['Purchase Price', mortgageDetails.purchasePrice],
              ['Mortgage Amount', mortgageDetails.mortgageAmount],
              ['Down Payment', mortgageDetails.downPayment],
              ['Rate', mortgageDetails.rate],
              ['Lender', mortgageDetails.lender],
              ['Term / Amortization', `${mortgageDetails.term} / ${mortgageDetails.amortization}`],
              ['Closing Date', mortgageDetails.closingDate],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <dt className="font-body text-sm text-gray-500">{label}</dt>
                <dd className="font-body text-sm text-navy font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white border border-gray-100 rounded-xl p-6 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-navy" />
          <h3 className="font-heading font-bold text-navy text-base">Timeline</h3>
        </div>
        <div className="space-y-6">
          {timeline.map((entry, i) => (
            <div key={i} className="flex gap-4">
              <div className="flex flex-col items-center">
                <entry.icon className={`w-5 h-5 ${entry.color}`} />
                {i < timeline.length - 1 && (
                  <div className="w-px flex-1 bg-gray-200 mt-2" />
                )}
              </div>
              <div className="pb-4">
                <p className="font-body text-xs text-gray-400 mb-0.5">
                  {entry.date}
                </p>
                <p className="font-heading font-semibold text-navy text-sm mb-1">
                  {entry.title}
                </p>
                <p className="font-body text-sm text-gray-600">{entry.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action Items */}
      <div className="bg-white border border-gray-100 rounded-xl p-6 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <h3 className="font-heading font-bold text-navy text-base">Action Items</h3>
        </div>
        <div className="space-y-3">
          {actionItems.map((item, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
            >
              <div className="flex items-center gap-3">
                <Circle className="w-4 h-4 text-gray-300" />
                <span className="font-body text-sm text-gray-700">{item.label}</span>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`font-body text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                    priorityColors[item.priority]
                  }`}
                >
                  {item.priority}
                </span>
                <span className="font-body text-xs text-gray-400">{item.dueDate}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Question Form */}
      <div className="bg-white border border-gray-100 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Send className="w-5 h-5 text-navy" />
          <h3 className="font-heading font-bold text-navy text-base">
            Ask a Question
          </h3>
        </div>
        <p className="font-body text-sm text-gray-500 mb-4">
          Have a question about this mortgage file? Send a message to Michael Fox.
        </p>
        <div className="space-y-4">
          <div>
            <label className="block font-body text-sm font-medium text-navy mb-1">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Question about closing timeline"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg font-body text-sm focus:outline-none focus:ring-2 focus:ring-lime/50 focus:border-lime"
            />
          </div>
          <div>
            <label className="block font-body text-sm font-medium text-navy mb-1">
              Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Type your message here..."
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg font-body text-sm focus:outline-none focus:ring-2 focus:ring-lime/50 focus:border-lime resize-none"
            />
          </div>
          <button className="bg-lime text-navy font-heading font-bold text-sm px-6 py-2.5 rounded-lg hover:bg-lime-dark transition-colors flex items-center gap-2">
            <Send className="w-4 h-4" />
            Send Message
          </button>
        </div>
      </div>
    </div>
  )
}
