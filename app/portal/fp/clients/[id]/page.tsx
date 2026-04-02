'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  ChevronLeft,
  Phone,
  Mail,
  MessageSquare,
  CheckCircle2,
  Clock,
} from 'lucide-react'

// 9-stage mortgage progress tracker
const STAGES = [
  { id: 1, label: 'Referral Received' },
  { id: 2, label: 'Initial Consultation' },
  { id: 3, label: 'Application Submitted' },
  { id: 4, label: 'Documents Collected' },
  { id: 5, label: 'Lender Submitted' },
  { id: 6, label: 'Approval Received' },
  { id: 7, label: 'Conditions Satisfied' },
  { id: 8, label: 'Commitment Signed' },
  { id: 9, label: 'Funded' },
]

// Mock client data keyed by ID
const mockClients: Record<string, {
  name: string
  email: string
  phone: string
  status: string
  currentStage: number
  mortgageBalance: string
  currentRate: string
  estimatedEquity: string
  propertyAddress: string
  mortgageType: string
  renewalDate: string
  lender: string
  savingsIdentified: string
  notes: string
  timeline: { date: string; event: string }[]
  messages: { from: string; body: string; date: string }[]
}> = {
  c001: {
    name: 'Amanda Reyes',
    email: 'amanda.reyes@email.com',
    phone: '416-555-0101',
    status: 'Active',
    currentStage: 9,
    mortgageBalance: '$612,000',
    currentRate: '5.14%',
    estimatedEquity: '$188,000',
    propertyAddress: '45 Maple St, Toronto, ON',
    mortgageType: '5yr Fixed',
    renewalDate: 'Oct 1, 2026',
    lender: 'TD Bank',
    savingsIdentified: '$290/mo',
    notes: 'Client is open to switching lenders at renewal. Prefers email contact.',
    timeline: [
      { date: 'Apr 1, 2026', event: 'Rate hold confirmed at 4.79% — renewal strategy reviewed' },
      { date: 'Feb 10, 2026', event: 'Strategic Mortgage Monitoring activated' },
      { date: 'Jan 15, 2026', event: 'Mortgage file opened' },
    ],
    messages: [
      { from: 'Michael Fox', body: 'Hi Amanda, just a heads up — your renewal is coming up in October. I\'ll reach out next month with rate options.', date: 'Apr 1, 2026' },
    ],
  },
  c002: {
    name: 'Ben Kowalski',
    email: 'ben.kowalski@email.com',
    phone: '647-555-0202',
    status: 'Onboarding',
    currentStage: 3,
    mortgageBalance: '$485,000',
    currentRate: '—',
    estimatedEquity: '$115,000',
    propertyAddress: '120 Oak Ave, Mississauga, ON',
    mortgageType: 'Purchase — 5yr Fixed',
    renewalDate: '—',
    lender: 'Pending',
    savingsIdentified: '—',
    notes: 'First-time buyer. Referred by financial planner for purchase mortgage.',
    timeline: [
      { date: 'Mar 31, 2026', event: 'Application submitted to Michael' },
      { date: 'Mar 28, 2026', event: 'Initial consultation completed' },
    ],
    messages: [],
  },
  c003: {
    name: 'Priya Sharma',
    email: 'priya.sharma@email.com',
    phone: '905-555-0303',
    status: 'Savings Found',
    currentStage: 9,
    mortgageBalance: '$738,000',
    currentRate: '5.89%',
    estimatedEquity: '$262,000',
    propertyAddress: '88 Birchwood Cres, Brampton, ON',
    mortgageType: '3yr Variable',
    renewalDate: 'Jun 1, 2026',
    lender: 'RBC',
    savingsIdentified: '$410/mo',
    notes: 'High savings potential. Renewal in June. Client wants to lock into fixed.',
    timeline: [
      { date: 'Mar 28, 2026', event: 'Savings alert issued — $410/mo identified by switching to 4.49% fixed' },
      { date: 'Mar 1, 2026', event: 'Rate review completed' },
    ],
    messages: [
      { from: 'You', body: 'Has Priya had a chance to review the savings analysis? She mentioned she\'d think about it.', date: 'Mar 29, 2026' },
      { from: 'Michael Fox', body: 'Yes — she\'s interested. I\'ll confirm her availability for a call this week.', date: 'Mar 30, 2026' },
    ],
  },
  c004: {
    name: 'Carlos Mendes',
    email: 'carlos.mendes@email.com',
    phone: '416-555-0404',
    status: 'Closed',
    currentStage: 9,
    mortgageBalance: '$685,000',
    currentRate: '4.54%',
    estimatedEquity: '$215,000',
    propertyAddress: '330 Elmwood Dr, Burlington, ON',
    mortgageType: '5yr Fixed',
    renewalDate: 'Mar 25, 2031',
    lender: 'Scotiabank',
    savingsIdentified: '—',
    notes: 'Funded Mar 25. Renewal in 2031. Excellent rate achieved.',
    timeline: [
      { date: 'Mar 25, 2026', event: 'Mortgage funded — $685,000 at 4.54% 5yr fixed' },
      { date: 'Mar 10, 2026', event: 'Commitment signed' },
      { date: 'Feb 28, 2026', event: 'Approval received from Scotiabank' },
    ],
    messages: [],
  },
  c005: {
    name: 'Jordan Lee',
    email: 'jordan.lee@email.com',
    phone: '289-555-0505',
    status: 'Active',
    currentStage: 9,
    mortgageBalance: '$540,000',
    currentRate: '4.99%',
    estimatedEquity: '$160,000',
    propertyAddress: '71 Willow Blvd, Hamilton, ON',
    mortgageType: '5yr Fixed',
    renewalDate: 'Sep 20, 2026',
    lender: 'CIBC',
    savingsIdentified: '$180/mo',
    notes: 'Renewal in September. Monitoring for rate dips.',
    timeline: [
      { date: 'Mar 20, 2026', event: 'Strategic Mortgage Monitoring report sent' },
    ],
    messages: [],
  },
  c006: {
    name: 'Sarah Okonkwo',
    email: 'sarah.okonkwo@email.com',
    phone: '416-555-0606',
    status: 'Referred',
    currentStage: 1,
    mortgageBalance: '—',
    currentRate: '—',
    estimatedEquity: '—',
    propertyAddress: '—',
    mortgageType: '—',
    renewalDate: '—',
    lender: '—',
    savingsIdentified: '—',
    notes: 'New referral — awaiting initial consultation.',
    timeline: [
      { date: 'Apr 2, 2026', event: 'Referral submitted by financial planner' },
    ],
    messages: [],
  },
}

const statusColors: Record<string, string> = {
  Active: 'bg-lime/20 text-lime-dark',
  Onboarding: 'bg-blue-100 text-blue-700',
  'Savings Found': 'bg-amber-100 text-amber-700',
  Closed: 'bg-gray-100 text-gray-600',
  Referred: 'bg-purple-100 text-purple-700',
}

export default function FPClientDetailPage({ params }: { params: { id: string } }) {
  const client = mockClients[params.id]
  const [messageText, setMessageText] = useState('')
  const [messageSent, setMessageSent] = useState(false)

  if (!client) {
    return (
      <div className="text-center py-20">
        <p className="font-body text-gray-500">Client not found.</p>
        <Link href="/portal/fp/clients" className="text-lime font-semibold text-sm hover:underline mt-2 inline-block">
          ← Back to Clients
        </Link>
      </div>
    )
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!messageText.trim()) return
    setMessageSent(true)
    setMessageText('')
  }

  return (
    <div>
      {/* Back link */}
      <Link
        href="/portal/fp/clients"
        className="inline-flex items-center gap-1 text-sm font-body text-gray-500 hover:text-navy mb-6 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to Clients
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="font-heading font-bold text-navy text-2xl">{client.name}</h2>
          <div className="flex items-center gap-3 mt-2">
            <span
              className={`inline-block font-body text-xs font-semibold px-3 py-1 rounded-full ${
                statusColors[client.status] || 'bg-gray-100 text-gray-600'
              }`}
            >
              {client.status}
            </span>
            <a
              href={`mailto:${client.email}`}
              className="flex items-center gap-1 text-xs font-body text-gray-500 hover:text-navy transition-colors"
            >
              <Mail className="w-3 h-3" />
              {client.email}
            </a>
            <a
              href={`tel:${client.phone}`}
              className="flex items-center gap-1 text-xs font-body text-gray-500 hover:text-navy transition-colors"
            >
              <Phone className="w-3 h-3" />
              {client.phone}
            </a>
          </div>
        </div>
      </div>

      {/* 9-Stage Progress Tracker */}
      <div className="bg-white border border-gray-100 rounded-xl p-6 mb-6">
        <h3 className="font-heading font-bold text-navy text-sm mb-4">Mortgage Progress</h3>
        <div className="flex items-center gap-0 overflow-x-auto pb-2">
          {STAGES.map((stage, idx) => {
            const done = stage.id < client.currentStage
            const current = stage.id === client.currentStage
            return (
              <div key={stage.id} className="flex items-center min-w-0">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                      done
                        ? 'bg-lime text-navy'
                        : current
                        ? 'bg-navy text-white ring-2 ring-navy ring-offset-2'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {done ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : current ? (
                      <Clock className="w-3 h-3" />
                    ) : (
                      <span className="text-xs font-heading font-bold">{stage.id}</span>
                    )}
                  </div>
                  <span
                    className={`text-[9px] font-body text-center mt-1 leading-tight max-w-[56px] ${
                      current ? 'text-navy font-semibold' : done ? 'text-gray-500' : 'text-gray-400'
                    }`}
                  >
                    {stage.label}
                  </span>
                </div>
                {idx < STAGES.length - 1 && (
                  <div
                    className={`h-0.5 w-6 mx-1 flex-shrink-0 mb-5 ${
                      stage.id < client.currentStage ? 'bg-lime' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Mortgage Details */}
        <div className="bg-white border border-gray-100 rounded-xl p-6">
          <h3 className="font-heading font-bold text-navy text-sm mb-4">Mortgage Details</h3>
          <dl className="space-y-2">
            {[
              ['Property', client.propertyAddress],
              ['Type', client.mortgageType],
              ['Balance', client.mortgageBalance],
              ['Current Rate', client.currentRate],
              ['Equity Est.', client.estimatedEquity],
              ['Lender', client.lender],
              ['Renewal Date', client.renewalDate],
              ['Savings Identified', client.savingsIdentified],
            ].map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-4">
                <dt className="font-body text-xs text-gray-500 w-32 flex-shrink-0">{label}</dt>
                <dd className="font-body text-xs font-medium text-navy text-right">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Notes */}
        <div className="bg-white border border-gray-100 rounded-xl p-6">
          <h3 className="font-heading font-bold text-navy text-sm mb-4">Notes</h3>
          <p className="font-body text-sm text-gray-600 leading-relaxed">{client.notes}</p>
        </div>
      </div>

      {/* Activity Timeline */}
      <div className="bg-white border border-gray-100 rounded-xl p-6 mb-6">
        <h3 className="font-heading font-bold text-navy text-sm mb-4">Activity Timeline</h3>
        <div className="space-y-3">
          {client.timeline.map((item, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-lime mt-1.5 flex-shrink-0" />
              <div>
                <p className="font-body text-sm text-navy">{item.event}</p>
                <p className="font-body text-xs text-gray-400 mt-0.5">{item.date}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Message thread */}
      <div className="bg-white border border-gray-100 rounded-xl p-6">
        <h3 className="font-heading font-bold text-navy text-sm mb-4 flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          Messages — {client.name}
        </h3>

        {client.messages.length === 0 && !messageSent ? (
          <p className="font-body text-sm text-gray-400 mb-4">
            No messages yet. Start a conversation with Michael below.
          </p>
        ) : (
          <div className="space-y-3 mb-4">
            {client.messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.from === 'You' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-sm px-4 py-3 rounded-xl text-sm font-body ${
                    msg.from === 'You'
                      ? 'bg-navy text-white'
                      : 'bg-gray-100 text-navy'
                  }`}
                >
                  <p className="text-[10px] font-semibold mb-1 opacity-70">{msg.from}</p>
                  <p>{msg.body}</p>
                  <p className="text-[10px] mt-1 opacity-50">{msg.date}</p>
                </div>
              </div>
            ))}
            {messageSent && (
              <div className="flex justify-end">
                <div className="max-w-sm px-4 py-3 rounded-xl text-sm font-body bg-navy text-white">
                  <p className="text-[10px] font-semibold mb-1 opacity-70">You</p>
                  <p>Message sent. Michael will respond shortly.</p>
                  <p className="text-[10px] mt-1 opacity-50">Just now</p>
                </div>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSendMessage} className="flex gap-2">
          <input
            type="text"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="Send a message about this client..."
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 font-body text-sm text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime/40"
          />
          <button
            type="submit"
            disabled={!messageText.trim()}
            className="bg-lime text-navy font-heading font-bold text-xs px-4 py-2 rounded-lg hover:bg-lime-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  )
}
