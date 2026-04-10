'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import {
  ChevronLeft,
  Mail,
  MessageSquare,
  CheckCircle2,
  Clock,
  Loader2,
  Send,
} from 'lucide-react'

// ─── 9-stage mortgage progress tracker ───────────────────────────────────────

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

// Map Zoho Potentials Stage picklist → milestone 1–9 (0 = closed/lost)
const stageToMilestone: Record<string, number> = {
  'Lead':                      1,
  'Application Started':       2,
  'Collecting Documentation':  3,
  'Underwriting In Progress':  4,
  'Ready to Submit':           5,
  'Submitted to Lender':       5,
  'Conditionally Approved':    6,
  'Broker Complete':           7,
  'Mortgage Funded':           9,
  'Mortgage Lost':             0,
}

function stageToProgress(stage: string): number {
  if (!stage) return 1
  if (stage in stageToMilestone) return stageToMilestone[stage]
  // Graceful fallback for unknown/legacy stage names
  const s = stage.toLowerCase()
  if (s.includes('lost') || s.includes('cancelled') || s.includes('declined')) return 0
  if (s.includes('funded')) return 9
  if (s.includes('complete')) return 7
  if (s.includes('approved')) return 6
  if (s.includes('submitted')) return 5
  if (s.includes('underwriting')) return 4
  if (s.includes('document')) return 3
  if (s.includes('application')) return 2
  return 1
}

function stageToStatus(stage: string, _savingsIdentified: string | null): string {
  const milestone = stageToProgress(stage)
  if (milestone === 0) return 'Closed'
  if (milestone === 9) return 'Funded'
  if (milestone >= 5) return 'Active'
  if (milestone >= 2) return 'Onboarding'
  return 'Referred'
}

function formatAmount(amount: number | null): string {
  if (!amount) return '—'
  return '$' + amount.toLocaleString('en-CA')
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface FPNote {
  id: string
  body: string
  createdTime: string
  createdBy: string
  noteType: string | null
}

interface FPClientDetail {
  id: string
  dealName: string
  contactName: string
  amount: number | null
  mortgageRate: string | null
  stage: string
  city: string | null
  province: string | null
  mortgageType: string | null
  termYears: string | null
  closingDate: string | null
  nextReviewDate: string | null
  savingsIdentified: string | null
  description: string | null
  messages: FPNote[]
  timeline: FPNote[]
}

const statusColors: Record<string, string> = {
  Active: 'bg-lime/20 text-lime-dark',
  Onboarding: 'bg-blue-100 text-blue-700',
  Funded: 'bg-emerald-100 text-emerald-700',
  'Savings Found': 'bg-amber-100 text-amber-700',
  Closed: 'bg-gray-200 text-gray-700',
  Referred: 'bg-purple-100 text-purple-700',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FPClientDetailPage({ params }: { params: { id: string } }) {
  const [client, setClient] = useState<FPClientDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [messageText, setMessageText] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [messageSent, setMessageSent] = useState(false)

  useEffect(() => {
    fetch(`/api/portal/fp/clients/${params.id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setClient(data.client)
      })
      .catch(err => setError(err.message || 'Failed to load client.'))
      .finally(() => setLoading(false))
  }, [params.id])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = messageText.trim()
    if (!text) return
    setSendingMessage(true)
    try {
      const res = await fetch('/api/portal/fp/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text, context: 'client', clientId: params.id }),
      })
      if (!res.ok) throw new Error('Failed to send')
      setMessageSent(true)
      setMessageText('')
    } catch {
      // fail silently — user can retry
    } finally {
      setSendingMessage(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="font-body text-sm">Loading client…</span>
      </div>
    )
  }

  if (error || !client) {
    return (
      <div className="text-center py-20">
        <p className="font-body text-gray-500">{error || 'Client not found.'}</p>
        <Link href="/portal/fp/clients" className="text-lime font-semibold text-sm hover:underline mt-2 inline-block">
          ← Back to Clients
        </Link>
      </div>
    )
  }

  const currentStage = stageToProgress(client.stage)
  const status = stageToStatus(client.stage, client.savingsIdentified)
  const displayName = client.contactName || client.dealName
  const location = [client.city, client.province].filter(Boolean).join(', ')
  const mortgageLabel = [
    client.mortgageType,
    client.termYears ? `${client.termYears}yr` : null,
  ].filter(Boolean).join(' — ')

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
          <h2 className="font-heading font-bold text-navy text-2xl">{displayName}</h2>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span
              className={`inline-block font-body text-xs font-semibold px-3 py-1 rounded-full ${
                statusColors[status] || 'bg-gray-100 text-gray-600'
              }`}
            >
              {status}
            </span>
            {location && (
              <span className="font-body text-xs text-gray-500">{location}</span>
            )}
          </div>
        </div>
      </div>

      {/* 9-Stage Progress Tracker — hidden for Mortgage Lost (milestone 0) */}
      {currentStage === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-6 mb-6 flex items-center justify-between">
          <h3 className="font-heading font-bold text-navy text-sm">Mortgage Progress</h3>
          <span className="inline-block font-body text-xs font-semibold px-3 py-1 rounded-full bg-gray-200 text-gray-700">
            Closed — {client.stage || 'Mortgage Lost'}
          </span>
        </div>
      ) : (
      <div className="bg-white border border-gray-100 rounded-xl p-6 mb-6">
        <h3 className="font-heading font-bold text-navy text-sm mb-4">Mortgage Progress</h3>
        <div className="flex items-center gap-0 overflow-x-auto pb-2">
          {STAGES.map((stage, idx) => {
            const done = stage.id < currentStage
            const current = stage.id === currentStage
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
                      stage.id < currentStage ? 'bg-lime' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
      )}

      {/* Info grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Mortgage Details */}
        <div className="bg-white border border-gray-100 rounded-xl p-6">
          <h3 className="font-heading font-bold text-navy text-sm mb-4">Mortgage Details</h3>
          <dl className="space-y-2">
            {([
              ['Location', location || '—'],
              ['Type', mortgageLabel || client.mortgageType || '—'],
              ['Balance', formatAmount(client.amount)],
              ['Current Rate', client.mortgageRate ? (client.mortgageRate.includes('%') ? client.mortgageRate : client.mortgageRate + '%') : '—'],
              ['Closing Date', formatDate(client.closingDate)],
              ['Next Review', formatDate(client.nextReviewDate)],
              ['Savings Identified', client.savingsIdentified ?? '—'],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-4">
                <dt className="font-body text-xs text-gray-500 w-36 flex-shrink-0">{label}</dt>
                <dd className="font-body text-xs font-medium text-navy text-right">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Notes */}
        <div className="bg-white border border-gray-100 rounded-xl p-6">
          <h3 className="font-heading font-bold text-navy text-sm mb-4">Notes</h3>
          {client.description ? (
            <p className="font-body text-sm text-gray-600 leading-relaxed">{client.description}</p>
          ) : (
            <p className="font-body text-sm text-gray-400">No notes on file.</p>
          )}
        </div>
      </div>

      {/* Activity Timeline */}
      {client.timeline.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl p-6 mb-6">
          <h3 className="font-heading font-bold text-navy text-sm mb-4">Activity Timeline</h3>
          <div className="space-y-3">
            {client.timeline.map((item) => (
              <div key={item.id} className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-lime mt-1.5 flex-shrink-0" />
                <div>
                  <p className="font-body text-sm text-navy">{item.body}</p>
                  <p className="font-body text-xs text-gray-400 mt-0.5">
                    {formatDate(item.createdTime)} · {item.createdBy}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Message thread */}
      <div className="bg-white border border-gray-100 rounded-xl p-6">
        <h3 className="font-heading font-bold text-navy text-sm mb-4 flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          Messages — {displayName}
        </h3>

        {client.messages.length === 0 && !messageSent ? (
          <p className="font-body text-sm text-gray-400 mb-4">
            No messages yet. Start a conversation with Michael below.
          </p>
        ) : (
          <div className="space-y-3 mb-4">
            {client.messages.map((msg) => {
              const isFromFP = msg.createdBy !== 'Michael Fox'
              return (
                <div key={msg.id} className={`flex ${isFromFP ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-sm px-4 py-3 rounded-xl text-sm font-body ${
                      isFromFP ? 'bg-navy text-white' : 'bg-gray-100 text-navy'
                    }`}
                  >
                    <p className="text-[10px] font-semibold mb-1 opacity-70">{msg.createdBy}</p>
                    <p>{msg.body}</p>
                    <p className="text-[10px] mt-1 opacity-50">{formatDate(msg.createdTime)}</p>
                  </div>
                </div>
              )
            })}
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
            placeholder="Send a message about this client…"
            disabled={sendingMessage}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 font-body text-sm text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime/40 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!messageText.trim() || sendingMessage}
            className="bg-lime text-navy font-heading font-bold text-xs px-4 py-2 rounded-lg hover:bg-lime-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {sendingMessage ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Send className="w-3 h-3" />
            )}
            Send
          </button>
        </form>
      </div>
    </div>
  )
}
