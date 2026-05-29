'use client'

// ─── Shared referral-partner client file ──────────────────────────────────────
// One state-driven client file for the realtor, lawyer, and financial-planner
// portals. Everything visible is driven by deal STATE, not partner type:
//   • in-progress files  → closing countdown pill, NEXT STEP pill, "Next:" callout,
//                           and a days-in-current-stage badge on the tracker.
//   • funded files       → renewal headline (Renews <Maturity_Date> + countdown),
//                           and the funded DATE on the Mortgage Funded milestone.
// The only per-portal differences are the API base + back-link, derived from
// `kind`. Investor portal is intentionally NOT routed through here.

import Link from 'next/link'
import { useState, useEffect, useCallback } from 'react'
import PortalErrorState from '@/components/PortalErrorState'
import {
  ChevronLeft,
  MessageSquare,
  CheckCircle2,
  Clock,
  Loader2,
  Send,
  ArrowRight,
  DollarSign,
  FileText,
  Calendar,
  ShieldCheck,
} from 'lucide-react'

export type PartnerKind = 'realtor' | 'lawyer' | 'fp'

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

function capitalize(s: string | null | undefined): string | null {
  if (!s) return null
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Term_Years / Amortization_Years store MONTHS on existing records (60 → 5yr,
// 300 → 25yr) but YEARS on some. Guard per the brief: values > 40 are months
// (÷12); values ≤ 40 are already years.
function toYears(raw: number | null | undefined): number | null {
  if (raw == null || isNaN(raw) || raw <= 0) return null
  return raw > 40 ? Math.round(raw / 12) : Math.round(raw)
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Zoho returns date-only fields (Closing_Date, Maturity_Date, First_Payment_Date)
// as bare "YYYY-MM-DD" with no timezone. `new Date("2021-10-06")` parses that as
// UTC midnight, which renders as the prior day in Eastern time ("Oct 5"). Format
// date-only values from their literal components so the stored calendar day shows.
// Datetime values (message timestamps) carry an explicit offset and parse safely.
function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (dateOnly) {
    const [, y, m, d] = dateOnly
    return `${MONTHS_SHORT[Number(m) - 1]} ${Number(d)}, ${y}`
  }
  try {
    return new Date(value).toLocaleDateString('en-CA', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return value
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

// LTV is shown consistently on every file. Prefer the lender's stored LTV
// (balance ÷ value) — Zoho stores it as a fraction (0.66), so normalize to a
// percent. When it's absent (common on purchase files), fall back to
// loan ÷ purchase price. Always ×100 and rounded; never a bare ratio.
function computeLtv(c: ClientDetail): { pct: number; basis: string } | null {
  if (c.ltv != null && c.ltv > 0) {
    const pct = c.ltv <= 1.5 ? c.ltv * 100 : c.ltv
    if (pct > 0 && pct < 250) return { pct: Math.round(pct), basis: 'balance ÷ value' }
  }
  const loan = c.totalLoanAmount ?? c.amount
  if (loan != null && loan > 0 && c.purchasePriceValue != null && c.purchasePriceValue > 0) {
    const pct = (loan / c.purchasePriceValue) * 100
    if (pct > 0 && pct < 250) return { pct: Math.round(pct), basis: 'loan ÷ purchase price' }
  }
  return null
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Note {
  id: string
  body: string
  createdTime: string
  createdBy: string
}

interface ClientDetail {
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
  transactionType: string | null
  type: string | null
  termYears: number | null
  amortizationYears: number | null
  termType: string | null
  rateType: string | null
  paymentAmount: number | null
  paymentFrequency: string | null
  downPayment: number | null
  firstPaymentDate: string | null
  lenderName: string | null
  lenderClassification: string | null
  closingDate: string | null
  maturityDate: string | null
  nextReviewDate: string | null
  savingsIdentified: string | null
  ltv: number | null
  totalLoanAmount: number | null
  purchasePriceValue: number | null
  description: string | null
  messages: Note[]
}

const statusColors: Record<string, string> = {
  Active: 'bg-lime/20 text-lime-dark',
  Onboarding: 'bg-blue-100 text-blue-700',
  Funded: 'bg-emerald-100 text-emerald-700',
  Closed: 'bg-gray-200 text-gray-700',
  Referred: 'bg-purple-100 text-purple-700',
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function ReferralPartnerClientFile({ kind, id }: { kind: PartnerKind; id: string }) {
  const apiBase = `/api/portal/${kind}`
  const clientsHref = `/portal/${kind}/clients`

  const [client, setClient] = useState<ClientDetail | null>(null)
  const [messagingEnabled, setMessagingEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [messageText, setMessageText] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [messageSent, setMessageSent] = useState(false)
  const [messageError, setMessageError] = useState('')

  const loadClient = useCallback(() => {
    setLoading(true)
    setError('')
    fetch(`${apiBase}/clients/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setClient(data.client)
        setMessagingEnabled(!!data.messagingEnabled)
      })
      .catch(err => setError(err.message || 'Failed to load client.'))
      .finally(() => setLoading(false))
  }, [apiBase, id])

  useEffect(() => { loadClient() }, [loadClient])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = messageText.trim()
    if (!text) return
    setSendingMessage(true)
    setMessageError('')
    try {
      const res = await fetch(`${apiBase}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text, context: 'client', clientId: id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (data.error === 'ImpersonationReadOnly') {
          setMessageError("You're viewing this portal as a partner. Exit impersonation to take admin actions.")
          return
        }
        throw new Error('Failed to send')
      }
      setMessageSent(true)
      setMessageText('')
    } catch {
      setMessageError('Could not send message. Please try again.')
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

  if (error) {
    return <PortalErrorState message={error} onRetry={loadClient} />
  }

  if (!client) {
    return (
      <div className="text-center py-20">
        <p className="font-body text-gray-500">Client not found.</p>
        <Link
          href={clientsHref}
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
  const isFunded = currentStage === 9
  const displayName = client.contactName || client.dealName

  // Transaction_Type (Purchase) and Mortgage_Type (First) are distinct facts —
  // the "Type" pill reflects the transaction, not the charge position.
  const transactionLabel = capitalize(client.transactionType)
  const mortgageTypeLabel = capitalize(client.mortgageType)
  const typeLabel = transactionLabel || mortgageTypeLabel || client.type || null

  const rateLabel = formatRate(client.mortgageRate)
  const rateWithType = rateLabel
    ? client.rateType ? `${rateLabel} ${client.rateType}` : rateLabel
    : null

  // Payment keeps cents and lower-cases the frequency: "$3,544.72 monthly".
  const paymentLabel =
    client.paymentAmount != null && client.paymentAmount > 0
      ? `$${client.paymentAmount.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` +
        (client.paymentFrequency ? ' ' + client.paymentFrequency.toLowerCase() : '')
      : null

  const termN = toYears(client.termYears)
  const termLabel =
    termN != null ? `${termN} year term${client.termType ? ` (${client.termType})` : ''}` : null
  const amortN = toYears(client.amortizationYears)
  const amortizationLabel = amortN != null ? `${amortN} year amortization` : null

  const todayIso = new Date().toISOString()
  const daysToClose = daysBetween(todayIso, client.closingDate)
  const daysInStage = daysBetween(client.stageModifiedTime, todayIso)
  const daysToRenewal = daysBetween(todayIso, client.maturityDate)

  const nextStage = nextStageLabel(currentStage)
  const ltv = computeLtv(client)

  // Key metrics — only include rows that have meaningful data
  const metrics: { label: string; value: string; hint?: string }[] = []
  if (ltv) metrics.push({ label: 'LTV', value: ltv.pct + '%', hint: ltv.basis })
  if (client.totalLoanAmount != null && client.totalLoanAmount > 0) {
    metrics.push({ label: 'Total Loan Amount', value: formatAmount(client.totalLoanAmount) })
  }
  if (client.downPayment != null && client.downPayment > 0) {
    metrics.push({ label: 'Down Payment', value: formatAmount(client.downPayment) })
  }
  if (client.purchasePriceValue != null && client.purchasePriceValue > 0) {
    metrics.push({ label: 'Purchase Price', value: formatAmount(client.purchasePriceValue) })
  }

  // Mortgage Overview — only show populated rows. The lender carries an optional
  // A/B/Private classification badge (Vendors.BRX_Classification, resolved server-side).
  const overview: { label: string; value: string; badge?: string | null }[] = []
  if (client.lenderName) overview.push({ label: 'Lender', value: client.lenderName, badge: client.lenderClassification })
  if (transactionLabel) overview.push({ label: 'Transaction Type', value: transactionLabel })
  if (mortgageTypeLabel) overview.push({ label: 'Mortgage Type', value: mortgageTypeLabel })
  if (rateWithType) overview.push({ label: 'Rate', value: rateWithType })
  if (paymentLabel) overview.push({ label: 'Payment', value: paymentLabel })
  if (termLabel) overview.push({ label: 'Term', value: termLabel })
  if (amortizationLabel) overview.push({ label: 'Amortization', value: amortizationLabel })
  if (client.firstPaymentDate) overview.push({ label: 'First Payment', value: formatDate(client.firstPaymentDate) })
  if (client.amount != null) overview.push({ label: 'Loan Amount', value: formatAmount(client.amount) })
  if (client.closingDate) overview.push({ label: isFunded ? 'Funded Date' : 'Closing Date', value: formatDate(client.closingDate) })
  if (client.maturityDate) overview.push({ label: 'Maturity Date', value: formatDate(client.maturityDate) })
  if (client.location) overview.push({ label: 'Location', value: client.location })

  // Snapshot pills (state-driven — shared on every file)
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
    pills.push({
      icon: <Calendar className="w-3.5 h-3.5" />,
      label: isFunded ? 'Funded' : 'Closing',
      value: closingValue,
    })
  }
  if (nextStage) {
    pills.push({ icon: <ArrowRight className="w-3.5 h-3.5" />, label: 'Next Step', value: nextStage })
  }

  const renewalCountdown =
    daysToRenewal == null
      ? null
      : daysToRenewal > 0
      ? `${daysToRenewal} ${daysToRenewal === 1 ? 'day' : 'days'} away`
      : daysToRenewal === 0
      ? 'Renews today'
      : 'Renewal date passed'

  return (
    <div>
      {/* Back link */}
      <Link
        href={clientsHref}
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

      {/* ── Renewal headline (funded files) ─────────────────────────────── */}
      {isFunded && client.maturityDate && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 mb-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <p className="font-body text-[11px] font-semibold text-emerald-700 uppercase tracking-wide mb-1">
                Up for Renewal
              </p>
              <p className="font-heading font-bold text-navy text-2xl leading-tight">
                Renews {formatDate(client.maturityDate)}
              </p>
              {renewalCountdown && (
                <p className="font-body text-sm text-emerald-800 mt-1">{renewalCountdown}</p>
              )}
            </div>
            <div className="flex items-center gap-2 bg-white/70 border border-emerald-200 rounded-full px-4 py-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span className="font-body text-xs font-semibold text-emerald-800">
                Monitoring for renewal
              </span>
            </div>
          </div>
          <p className="font-body text-xs text-emerald-800/80 mt-3 leading-relaxed">
            Fox Mortgage is monitoring this mortgage and will reach out ahead of renewal to
            review options and identify savings.
          </p>
        </div>
      )}

      {/* ── Client snapshot bar (state-driven pills) ────────────────────── */}
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

      {/* ── Mortgage progress tracker ───────────────────────────────────── */}
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
                    {/* Funded milestone shows the funded DATE; in-progress stages
                        show days-in-current-stage. */}
                    {current && stage.id === 9 && client.closingDate ? (
                      <div className="text-[10px] font-body text-emerald-600 font-semibold mt-0.5">
                        {formatDate(client.closingDate)}
                      </div>
                    ) : current && daysInStage != null && daysInStage >= 0 ? (
                      <div className="text-[10px] font-body text-lime-dark font-semibold mt-0.5">
                        Day {daysInStage}
                      </div>
                    ) : null}
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

          {/* Next Step callout (state-driven — hidden once funded) */}
          {nextStage && (
            <div className="mt-5 pt-4 border-t border-gray-100 flex items-center gap-2 border-l-2 border-l-navy pl-3 -ml-3">
              <span className="font-body text-xs text-gray-500">Next:</span>
              <span className="font-body text-xs font-semibold text-navy">{nextStage}</span>
              <ArrowRight className="w-3.5 h-3.5 text-navy" />
            </div>
          )}
        </div>
      )}

      {/* ── Mortgage Overview + Key Metrics ─────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-6">
        {/* Card A — Mortgage Overview (60%) */}
        <div className="md:col-span-3 bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
          <h3 className="font-heading font-bold text-navy text-sm mb-4">Mortgage Overview</h3>
          {overview.length === 0 ? (
            <p className="font-body text-sm text-gray-400">No mortgage details on file.</p>
          ) : (
            <dl className="space-y-3">
              {overview.map(({ label, value, badge }) => (
                <div key={label} className="flex items-start justify-between gap-4">
                  <dt className="font-body text-xs text-gray-500 w-36 flex-shrink-0">{label}</dt>
                  <dd className="font-body text-xs font-semibold text-navy text-right flex items-center justify-end gap-2 flex-wrap">
                    <span>{value}</span>
                    {badge && (
                      <span className="inline-flex items-center rounded-full bg-navy/5 border border-navy/10 px-2 py-0.5 text-[10px] font-bold text-navy uppercase tracking-wide">
                        {badge}
                      </span>
                    )}
                  </dd>
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
              {metrics.map(({ label, value, hint }) => (
                <div key={label} className="flex items-start justify-between gap-3">
                  <dt className="font-body text-xs text-gray-500">{label}</dt>
                  <dd className="text-right">
                    <span className="font-body text-xs font-semibold text-navy">{value}</span>
                    {hint && (
                      <span className="block font-body text-[10px] text-gray-400 mt-0.5">{hint}</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>

      {/* ── Messages (single thread — no notes, no call history) ────────── */}
      <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="w-4 h-4 text-navy" />
          <h3 className="font-heading font-bold text-navy text-sm">Messages</h3>
          {client.messages.length > 0 && (
            <span className="bg-gray-100 text-gray-600 text-[10px] rounded-full px-2 py-0.5">
              {client.messages.length}
            </span>
          )}
        </div>

        {/* Thread */}
        {client.messages.length === 0 && !messageSent ? (
          <p className="font-body text-sm text-gray-400 mb-4">
            {messagingEnabled
              ? 'No messages yet. Start a conversation with Michael below.'
              : 'No messages yet.'}
          </p>
        ) : (
          <div className="space-y-3 mb-4">
            {client.messages.map((msg) => {
              const isFromPartner = msg.createdBy !== 'Michael Fox'
              return (
                <div
                  key={msg.id}
                  className={`flex ${isFromPartner ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-sm px-4 py-3 rounded-xl text-sm font-body ${
                      isFromPartner ? 'bg-navy text-white' : 'bg-gray-100 text-navy'
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

        {messagingEnabled ? (
          <>
            {messageError && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2 font-body text-xs text-amber-900">
                {messageError}
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
        ) : (
          <div className="border-t border-gray-100 pt-4 mt-1">
            <p className="font-body text-sm text-gray-500">
              Questions about this file?{' '}
              <span className="font-semibold text-navy">Message Michael</span> and he&apos;ll get
              back to you.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
