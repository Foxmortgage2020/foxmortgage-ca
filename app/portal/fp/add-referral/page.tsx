'use client'

import { useState } from 'react'
import { CheckCircle2, ArrowRight } from 'lucide-react'

type FormData = {
  clientName: string
  clientEmail: string
  clientPhone: string
  propertyType: string
  estimatedValue: string
  closingDate: string
  mortgageType: string
  notes: string
}

const initialForm: FormData = {
  clientName: '',
  clientEmail: '',
  clientPhone: '',
  propertyType: '',
  estimatedValue: '',
  closingDate: '',
  mortgageType: '',
  notes: '',
}

export default function FPAddReferralPage() {
  const [form, setForm] = useState<FormData>(initialForm)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.clientName.trim() || !form.clientEmail.trim()) {
      setError('Client name and email are required.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/portal/fp/referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Submission failed')
      }

      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="w-16 h-16 rounded-full bg-lime/20 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-8 h-8 text-lime" />
        </div>
        <h2 className="font-heading font-bold text-navy text-2xl mb-3">Referral Submitted!</h2>
        <p className="font-body text-gray-600 mb-2">
          <strong className="text-navy">{form.clientName}</strong> has been referred to Michael Fox.
        </p>
        <p className="font-body text-sm text-gray-500 mb-8">
          Michael will reach out to your client within 1 business day. You&apos;ll receive a
          confirmation email, and your client will receive a welcome email introducing Michael.
        </p>
        <button
          onClick={() => {
            setForm(initialForm)
            setSuccess(false)
          }}
          className="inline-flex items-center gap-2 bg-navy text-white font-heading font-bold text-sm px-6 py-3 rounded-lg hover:bg-navy/90 transition-colors"
        >
          Submit Another Referral <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <p className="font-body text-sm text-gray-600 mb-8">
        Fill out the form below to refer a client to Michael Fox, Mortgage Agent, Level 2. Michael
        will follow up with your client within 1 business day.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Client Info */}
        <div className="bg-white border border-gray-100 rounded-xl p-6">
          <h3 className="font-heading font-bold text-navy text-sm mb-4">Client Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-body text-xs font-semibold text-gray-600 mb-1">
                Full Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                name="clientName"
                value={form.clientName}
                onChange={handleChange}
                placeholder="Jane Doe"
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 font-body text-sm text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime/40"
              />
            </div>
            <div>
              <label className="block font-body text-xs font-semibold text-gray-600 mb-1">
                Email Address <span className="text-red-400">*</span>
              </label>
              <input
                type="email"
                name="clientEmail"
                value={form.clientEmail}
                onChange={handleChange}
                placeholder="jane@email.com"
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 font-body text-sm text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime/40"
              />
            </div>
            <div>
              <label className="block font-body text-xs font-semibold text-gray-600 mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                name="clientPhone"
                value={form.clientPhone}
                onChange={handleChange}
                placeholder="416-555-0100"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 font-body text-sm text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime/40"
              />
            </div>
          </div>
        </div>

        {/* Mortgage Details */}
        <div className="bg-white border border-gray-100 rounded-xl p-6">
          <h3 className="font-heading font-bold text-navy text-sm mb-4">Mortgage Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-body text-xs font-semibold text-gray-600 mb-1">
                Property Type
              </label>
              <select
                name="propertyType"
                value={form.propertyType}
                onChange={handleChange}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 font-body text-sm text-navy focus:outline-none focus:ring-2 focus:ring-lime/40"
              >
                <option value="">Select type</option>
                <option>Purchase</option>
                <option>Refinance</option>
                <option>Renewal</option>
                <option>HELOC</option>
                <option>Investment Property</option>
                <option>Not sure</option>
              </select>
            </div>
            <div>
              <label className="block font-body text-xs font-semibold text-gray-600 mb-1">
                Mortgage Type
              </label>
              <select
                name="mortgageType"
                value={form.mortgageType}
                onChange={handleChange}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 font-body text-sm text-navy focus:outline-none focus:ring-2 focus:ring-lime/40"
              >
                <option value="">Select type</option>
                <option>Fixed Rate</option>
                <option>Variable Rate</option>
                <option>Adjustable Rate</option>
                <option>Not sure</option>
              </select>
            </div>
            <div>
              <label className="block font-body text-xs font-semibold text-gray-600 mb-1">
                Estimated Property Value
              </label>
              <input
                type="text"
                name="estimatedValue"
                value={form.estimatedValue}
                onChange={handleChange}
                placeholder="e.g. $800,000"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 font-body text-sm text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime/40"
              />
            </div>
            <div>
              <label className="block font-body text-xs font-semibold text-gray-600 mb-1">
                Target Closing / Renewal Date
              </label>
              <input
                type="date"
                name="closingDate"
                value={form.closingDate}
                onChange={handleChange}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 font-body text-sm text-navy focus:outline-none focus:ring-2 focus:ring-lime/40"
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white border border-gray-100 rounded-xl p-6">
          <h3 className="font-heading font-bold text-navy text-sm mb-4">Additional Notes</h3>
          <textarea
            name="notes"
            value={form.notes}
            onChange={handleChange}
            rows={4}
            placeholder="Any background on the client's situation, goals, or preferences Michael should know..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 font-body text-sm text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime/40 resize-none"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 font-body text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full md:w-auto flex items-center justify-center gap-2 bg-lime text-navy font-heading font-bold text-sm px-8 py-3 rounded-lg hover:bg-lime-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-navy/30 border-t-navy rounded-full animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              Submit Referral <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </div>
  )
}
