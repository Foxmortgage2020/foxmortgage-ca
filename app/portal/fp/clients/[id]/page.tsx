'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import {
  ChevronLeft,
  MessageSquare,
  CheckCircle2,
  Clock,
  Loader2,
  Send,
  Phone,
  ArrowRight,
  DollarSign,
  FileText,
  Calendar,
} from 'lucide-react'

// ─── 9-stage mortgage progress tracker ───────────────────────────────────────
// Labels match Zoho Potentials Stage picklist exactly (1:1 with stageToMilestone).

const STAGES = [
  { id: 1, label: 'Lead' },
  { id: 2, label: 'Application Started' },
  { id: 3, label: 'Collecting Documentation' },
  { id: 4, label: 'Underwriting In Progress' },
  { id: 5, label: 'Ready to Submit' },
  { id: 6, label: 'Submitted to Lender' },
  { id: 7, label: 'Conditionally Approved' },
  { id: 8, label: 'Broker Complete' },
  { id: 9, label: 'Mortgage Funded' },
]

const stageToMilestone: Record<string, number> = {
  'Lead':                     1,
  'Application Started':      2,
  'Collecting Documentation': 3,
  'Underwriting In Progress': 4,
  'Ready to Submit':          5,
  'Submitted to Lender':      6,
  'Conditionally Approved':   7,
  'Broker Complete':          8,
  'Mortgage Funded':          9,
  'Mortgage Lost':            0,
}

function stageToProgress(stage: string): number {
  if (!stage) return 1
  if (stage in stageToMilestone) return stageToMilestone[stage]
  const s = stage.toLowerCase()
  if (s.includes('lost') || s.includes('cancelled') || s.includes('declined')) return 0
  if (s.includes('funded')) return 9
  if (s.includes('complete')) return 8
  if (s.includes('approved')) return 7
  if (s.includes('submitted')) return 6
  if (s.includes('ready')) return 5
  if (s.includes('underwriting')) return 4
  if (s.includes('document')) return 3
  if (s.includes('application')) return 2
  return 1
}

function stageToStatus(stage: string): string {
  const milestone = stageToProgress(stage)
  if (milestone === 0) return 'Closed'
  if (milestone === 9) return 'Funded'
  if (milestone >= 3) return 'Active'
  return 'Onboarding'
}

function nextStageLabel(currentStage: number): string | null {
  if (currentStage <= 0 || currentStage >= 9) return null
  return STAGES[currentStage]?.label ?? null // STAGES is 0-indexed, currentStage is 1-indexed so [currentStage] = next
}

function formatAmount(amount: number | null | undefined): string {
  if (amount == null || isNaN(amount)) return '—'
  return '$' + Math.round(amount).toLocaleString('en-CA')
}

function formatRate(rate: number | null | undefined): string | null {
  if (rate == null || isNaN(rate) || rate === 0) return null
  return rate.toFixed(2) + '%'
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-CA', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function daysBetween(fromIso: string | null | undefined, toIso: string | null | undefined): number | null {
  if (!fromIso || !toIso) return null
  try {
    const from = new Date(fromIso).getTime()
    const to = new Date(toIso).getTime()
    if (isNaN(from) || isNaN(to)) return null
    return Math.round((to - from) / (1000 * 60 * 60 * 24))
  } catch {
    return null
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
  mortgageRate: number | null
  stage: string
  stageModifiedTime: string | null
  city: string | null
  province: string | null
  location: string | null
  mortgageType: string | null
  type: string | null
  termYears: string | null
  closingDate: string | null
  nextReviewDate: string | null
  savingsIdentified: string | null
  ltv: number | null
  totalLoanAmount: number | null
  purchasePriceValue: number | null
  description: string | null
  messages: FPNote[]
  timeline: FPNote[]
}

const statusColors: Record<string, string> = {
  Active: 'bg-lime/20 text-lime-dark',
  Onboarding: 'bg-blue-100 text-blue-700',
  Funded: 'bg-emerald-100 text-emerald-700',
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
  const [activityTab, setActivityTab] = useState<'messages' | 'calls'>('messages')

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
        <Link
          href="/portal/fp/clients"
          className="text-lime font-semibold text-sm hover:underline mt-2 inline-block"
        >
          ← Back to Clients
        </Link>
      </div>
    )
  }

  // ─── Computed values ──────────────────────────────────────────────────────
  const currentStage = stageToProgress(client.stage)
  const status = stageToStatus(client.stage)
  const displayName = client.contactName || client.dealName

  const typeLabel = client.type || client.mortgageType || null
  const rateLabel = formatRate(client.mortgageRate)

  const todayIso = new Date().toISOString()
  const daysToClose = daysBetween(todayIso, client.closingDate)
  const daysInStage = daysBetween(client.stageModifiedTime, todayIso)

  const nextStage = nextStageLabel(currentStage)

  // Key metrics — only include rows that have meaningful data
  const metrics: { label: string; value: string }[] = []
  if (client.ltv != null && client.ltv > 0) {
    metrics.push({ label: 'LTV', value: client.ltv.toFixed(1) + '%' })
  }
  if (client.totalLoanAmount != null && client.totalLoanAmount > 0) {
    metrics.push({ label: 'Total Loan Amount', value: formatAmount(client.totalLoanAmount) })
  }
  if (client.purchasePriceValue != null && client.purchasePriceValue > 0) {
    metrics.push({ label: 'Purchase Price', value: formatAmount(client.purchasePriceValue) })
  }

  // Mortgage Overview — only show populated rows
  const overview: { label: string; value: string }[] = []
  if (client.amount != null) overview.push({ label: 'Loan Amount', value: formatAmount(client.amount) })
  if (typeLabel) overview.push({ label: 'Transaction Type', value: typeLabel })
  if (rateLabel) overview.push({ label: 'Current Rate', value: rateLabel })
  if (client.closingDate) overview.push({ label: 'Closing Date', value: formatDate(client.closingDate) })
  if (client.location) overview.push({ label: 'Location', value: client.location })

  // Snapshot pills
  type Pill = { icon: React.ReactNode; label: string; value: string }
  const pills: Pill[] = []
  if (client.amount != null) {
    pills.push({ icon: <DollarSign className="w-3.5 h-3.5" />, label: 'Loan', value: formatAmount(client.amount) })
  }
  if (typeLabel) {
    pills.push({ icon: <FileText className="w-3.5 h-3.5" />, label: 'Type', value: typeLabel })
  }
  if (client.closingDate) {
    const closingValue =
      daysToClose != null && daysToClose >= 0
        ? `${formatDate(client.closingDate)} (${daysToClose} ${daysToClose === 1 ? 'day' : 'days'})`
        : formatDate(client.closingDate)
    pills.push({ icon: <Calendar className="w-3.5 h-3.5" />, label: 'Closing', value: closingValue })
  }
  if (nextStage) {
    pills.push({ icon: <ArrowRight className="w-3.5 h-3.5" />, label: 'Next Step', value: nextStage })
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
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
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
            {client.location && (
              <span className="font-body text-xs text-gray-500">{client.location}</span>
            )}
          </div>
        </div>
      </div>

      {/* ── CHANGE 1: Client Snapshot Bar ───────────────────────────────── */}
      {pills.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {pills.map((p) => (
            <div
              key={p.label}
              className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-2 shadow-sm"
            >
              <span className="text-gray-400">{p.icon}</span>
              <span className="font-body text-[11px] text-gray-500 uppercase tracking-wide">
                {p.label}
              </span>
              <span className="font-body text-xs font-semibold text-navy">{p.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── CHANGE 2: Actionable Progress ───────────────────────────────── */}
      {currentStage === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-6 mb-6 shadow-sm flex items-center justify-between">
          <h3 className="font-heading font-bold text-navy text-sm">Mortgage Progress</h3>
          <span className="inline-block font-body text-xs font-semibold px-3 py-1 rounded-full bg-gray-200 text-gray-700">
            Closed — {client.stage || 'Mortgage Lost'}
          </span>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-heading font-bold text-navy text-sm">Mortgage Progress</h3>
            <span className="font-body text-xs text-gray-400">
              Stage {currentStage} of 9
            </span>
          </div>

          {/* Steps */}
          <div className="flex items-start gap-0 overflow-x-auto pb-2">
            {STAGES.map((stage, idx) => {
              const done = stage.id < currentStage
              const current = stage.id === currentStage
              return (
                <div key={stage.id} className="flex items-start min-w-0 flex-1">
                  <div className="flex flex-col items-center min-w-0 flex-1">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                        done
                          ? 'bg-lime text-navy'
                          : current
                          ? 'bg-navy text-white ring-4 ring-navy/10'
                          : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {done ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : current ? (
                        <Clock className="w-4 h-4" />
                      ) : (
                        <span className="text-xs font-heading font-bold">{stage.id}</span>
                      )}
                    </div>
                    <div
                      className={`text-[10px] font-body text-center mt-2 leading-tight px-1 ${
                        current
                          ? 'text-navy font-bold'
                          : done
                          ? 'text-gray-400'
                          : 'text-gray-300'
                      }`}
                    >
                      {stage.label}
                    </div>
                    {current && daysInStage != null && daysInStage >= 0 && (
                      <div className="text-[10px] font-body text-lime-dark font-semibold mt-0.5">
                        Day {daysInStage}
                      </div>
                    )}
                  </div>
                  {idx < STAGES.length - 1 && (
                    <div
                      className={`h-0.5 flex-1 mx-1 mt-4 flex-shrink ${
                        stage.id < currentStage ? 'bg-lime' : 'bg-gray-200'
                      }`}
                    />
                  )}
                </div>
              )
            })}
          </div>

          {/* Next Step line */}
          {nextStage && (
            <div className="mt-5 pt-4 border-t border-gray-100 flex items-center gap-2 border-l-2 border-l-navy pl-3 -ml-3">
              <span className="font-body text-xs text-gray-500">Next:</span>
              <span className="font-body text-xs font-semibold text-navy">{nextStage}</span>
              <ArrowRight className="w-3.5 h-3.5 text-navy" />
            </div>
          )}
        </div>
      )}

      {/* ── CHANGE 3: Mortgage Overview + Key Metrics ────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-6">
        {/* Card A — Mortgage Overview (60%) */}
        <div className="md:col-span-3 bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
          <h3 className="font-heading font-bold text-navy text-sm mb-4">Mortgage Overview</h3>
          {overview.length === 0 ? (
            <p className="font-body text-sm text-gray-400">No mortgage details on file.</p>
          ) : (
            <dl className="space-y-3">
              {overview.map(({ label, value }) => (
                <div key={label} className="flex items-start justify-between gap-4">
                  <dt className="font-body text-xs text-gray-500 w-36 flex-shrink-0">{label}</dt>
                  <dd className="font-body text-xs font-semibold text-navy text-right">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {/* Card B — Key Metrics (40%) */}
        <div className="md:col-span-2 bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
          <h3 className="font-heading font-bold text-navy text-sm mb-4">Key Metrics</h3>
          {metrics.length === 0 ? (
            <p className="font-body text-xs text-gray-400 leading-relaxed">
              LTV, total loan, and purchase price will appear here once underwriting is complete.
            </p>
          ) : (
            <dl className="space-y-3">
              {metrics.map(({ label, value }) => (
                <div key={label} className="flex items-start justify-between gap-3">
                  <dt className="font-body text-xs text-gray-500">{label}</dt>
                  <dd className="font-body text-xs font-semibold text-navy text-right">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>

      {/* ── CHANGE 4: Notes ──────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-100 rounded-xl p-6 mb-6 shadow-sm">
        <h3 className="font-heading font-bold text-navy text-sm mb-4">Notes</h3>
        {client.timeline && client.timeline.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {client.timeline.map((note) => (
              <div key={note.id} className="py-3 first:pt-0 last:pb-0">
                <p className="font-body text-[11px] text-gray-400 uppercase tracking-wide mb-1">
                  {formatDate(note.createdTime)}
                </p>
                <p className="font-body text-sm text-navy leading-relaxed whitespace-pre-wrap">
                  {note.body}
                </p>
              </div>
            ))}
          </div>
        ) : client.description ? (
          <p className="font-body text-sm text-navy leading-relaxed">{client.description}</p>
        ) : (
          <p className="font-body text-sm text-gray-400 leading-relaxed">
            No notes yet. Michael will add updates here as your client&apos;s file progresses.
          </p>
        )}
      </div>

      {/* ── CHANGE 5: Activity (Messages + Call History tabs) ───────────── */}
      <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
        <h3 className="font-heading font-bold text-navy text-sm mb-4">
          Activity — {displayName}
        </h3>

        {/* Tabs */}
        <div className="flex items-center gap-6 border-b border-gray-100 mb-5">
          <button
            onClick={() => setActivityTab('messages')}
            className={`flex items-center gap-2 pb-3 -mb-px font-body text-xs font-semibold transition-colors ${
              activityTab === 'messages'
                ? 'text-navy border-b-2 border-navy'
                : 'text-gray-400 hover:text-navy'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Messages
            {client.messages.length > 0 && (
              <span className="bg-gray-100 text-gray-600 text-[10px] rounded-full px-2 py-0.5">
                {client.messages.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActivityTab('calls')}
            className={`flex items-center gap-2 pb-3 -mb-px font-body text-xs font-semibold transition-colors ${
              activityTab === 'calls'
                ? 'text-navy border-b-2 border-navy'
                : 'text-gray-400 hover:text-navy'
            }`}
          >
            <Phone className="w-3.5 h-3.5" />
            Call History
          </button>
        </div>

        {/* Messages tab */}
        {activityTab === 'messages' && (
          <>
            {client.messages.length === 0 && !messageSent ? (
              <p className="font-body text-sm text-gray-400 mb-4">
                No messages yet. Start a conversation with Michael below.
              </p>
            ) : (
              <div className="space-y-3 mb-4">
                {client.messages.map((msg) => {
                  const isFromFP = msg.createdBy !== 'Michael Fox'
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isFromFP ? 'justify-end' : 'justify-start'}`}
                    >
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
          </>
        )}

        {/* Call History tab */}
        {activityTab === 'calls' && (
          <div className="py-8 text-center">
            <Phone className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="font-body text-sm text-gray-400 leading-relaxed max-w-sm mx-auto">
              Call summaries will appear here once Dialpad is connected.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
