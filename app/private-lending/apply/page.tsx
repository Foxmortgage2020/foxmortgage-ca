'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'

// Public lead-capture form. Linked from a CTA on /private-lending.
// Submits to /api/onboard/lead-capture which creates a Partner at
// Onboarding_Stage="Lead" and emails Mike. Mike then decides
// whether to send an onboarding link from the admin partner detail
// page.

const VEHICLES = [
  'Personal',
  'Corporation',
  'Trust',
  'Joint',
  'Registered Account',
] as const

const AMOUNTS = [
  'Under $100K',
  '$100K - $250K',
  '$250K - $500K',
  '$500K - $1M',
  'Over $1M',
] as const

const SOURCES = [
  'Google',
  'Referral',
  'Social Media',
  'Event',
  'Existing Client',
  'Other',
] as const

const inputCls =
  'bg-white text-navy rounded-lg px-4 py-3 w-full border border-gray-200 focus:ring-2 focus:ring-lime outline-none font-body text-sm'
const labelCls = 'block text-gray-500 text-xs font-body mb-1'

export default function PrivateLendingApplyPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [investmentVehicle, setInvestmentVehicle] = useState('')
  const [approxAmount, setApproxAmount] = useState('')
  const [referralSource, setReferralSource] = useState('')
  const [message, setMessage] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmedFirstName, setConfirmedFirstName] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/onboard/lead-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          email,
          phone,
          investmentVehicle,
          approxAmount,
          referralSource,
          message,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
        return
      }
      setConfirmedFirstName(data.firstName ?? fullName.split(' ')[0])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  if (confirmedFirstName) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm max-w-xl w-full p-8 sm:p-10">
          <p className="font-heading text-lime text-sm tracking-wider uppercase mb-2">
            Fox Mortgage · Private Lending
          </p>
          <h1 className="font-heading text-navy text-3xl font-bold mb-4">
            Thank you, {confirmedFirstName}.
          </h1>
          <p className="font-body text-gray-700 text-base leading-relaxed mb-6">
            Mike will reach out within 1-2 business days to discuss next steps and, if it&apos;s a fit,
            send you an onboarding link.
          </p>
          <Link
            href="/private-lending"
            className="text-lime font-semibold text-sm hover:underline"
          >
            ← Back to Private Lending
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-start p-6 pt-12">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm max-w-xl w-full p-8 sm:p-10">
        <p className="font-heading text-lime text-sm tracking-wider uppercase mb-2">
          Fox Mortgage · Private Lending
        </p>
        <h1 className="font-heading text-navy text-3xl font-bold mb-3">
          Apply to invest
        </h1>
        <p className="font-body text-gray-700 text-base leading-relaxed mb-8">
          Tell us a bit about you and we&apos;ll be in touch within 1-2 business days.
          All information stays private.
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className={labelCls}>Full name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={busy}
              required
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
                required
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Phone number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={busy}
                required
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Investment vehicle interest</label>
            <select
              value={investmentVehicle}
              onChange={(e) => setInvestmentVehicle(e.target.value)}
              disabled={busy}
              required
              className={inputCls}
            >
              <option value="">Choose one…</option>
              {VEHICLES.map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Approximate amount available to invest</label>
            <select
              value={approxAmount}
              onChange={(e) => setApproxAmount(e.target.value)}
              disabled={busy}
              required
              className={inputCls}
            >
              <option value="">Choose one…</option>
              {AMOUNTS.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>How did you hear about Fox Mortgage?</label>
            <select
              value={referralSource}
              onChange={(e) => setReferralSource(e.target.value)}
              disabled={busy}
              required
              className={inputCls}
            >
              <option value="">Choose one…</option>
              {SOURCES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Brief message (optional)</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={busy}
              maxLength={500}
              rows={4}
              className={inputCls}
            />
            <p className="text-gray-400 text-xs font-body mt-1">{message.length}/500</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 font-body text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            <Link
              href="/private-lending"
              className="text-gray-500 font-body text-sm hover:text-navy"
            >
              ← Cancel
            </Link>
            <button
              type="submit"
              disabled={busy}
              className="bg-lime text-navy font-heading font-bold text-base px-6 py-3 rounded-lg hover:bg-lime-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {busy ? 'Submitting…' : 'Submit application'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
