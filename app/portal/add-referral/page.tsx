'use client'

import { useState } from 'react'
import { CheckCircle2, Send } from 'lucide-react'

export default function AddReferralPage() {
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    clientName: '',
    clientEmail: '',
    clientPhone: '',
    propertyType: '',
    estimatedPrice: '',
    closingDate: '',
    mortgageType: '',
    notes: '',
  })

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await fetch('/api/portal/add-referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      setSubmitted(true)
    } catch {
      alert('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto bg-white rounded-xl border border-gray-200 p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="font-heading font-bold text-navy text-2xl mb-2">
          Referral Submitted!
        </h2>
        <p className="font-body text-gray-500 mb-6">
          Your referral for <span className="font-semibold text-navy">{form.clientName}</span> has
          been submitted successfully. We will begin the onboarding process shortly.
        </p>
        <button
          onClick={() => {
            setSubmitted(false)
            setForm({
              clientName: '',
              clientEmail: '',
              clientPhone: '',
              propertyType: '',
              estimatedPrice: '',
              closingDate: '',
              mortgageType: '',
              notes: '',
            })
          }}
          className="bg-navy text-white font-heading font-bold px-6 py-3 rounded-lg hover:bg-navy/90 transition-colors"
        >
          Submit Another Referral
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-xl border border-gray-200 p-8">
      <div className="mb-8">
        <h2 className="font-heading font-bold text-navy text-2xl">Refer a New Client</h2>
        <p className="font-body text-gray-500 mt-1">
          Fill out the form below to submit a new client referral to the Fox Mortgage team.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Client Information */}
        <div>
          <h3 className="font-heading font-semibold text-navy text-lg mb-4">
            Client Information
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block font-body text-sm font-medium text-gray-700 mb-1">
                Client Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="clientName"
                value={form.clientName}
                onChange={handleChange}
                required
                placeholder="Full name"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 font-body text-sm focus:outline-none focus:ring-2 focus:ring-lime/50 focus:border-lime"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-body text-sm font-medium text-gray-700 mb-1">
                  Client Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  name="clientEmail"
                  value={form.clientEmail}
                  onChange={handleChange}
                  required
                  placeholder="email@example.com"
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 font-body text-sm focus:outline-none focus:ring-2 focus:ring-lime/50 focus:border-lime"
                />
              </div>
              <div>
                <label className="block font-body text-sm font-medium text-gray-700 mb-1">
                  Client Phone <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  name="clientPhone"
                  value={form.clientPhone}
                  onChange={handleChange}
                  required
                  placeholder="(416) 555-0123"
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 font-body text-sm focus:outline-none focus:ring-2 focus:ring-lime/50 focus:border-lime"
                />
              </div>
            </div>
            <div>
              <label className="block font-body text-sm font-medium text-gray-700 mb-1">
                Property Type <span className="text-red-500">*</span>
              </label>
              <select
                name="propertyType"
                value={form.propertyType}
                onChange={handleChange}
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-3 font-body text-sm focus:outline-none focus:ring-2 focus:ring-lime/50 focus:border-lime bg-white"
              >
                <option value="">Select property type</option>
                <option value="primary-residence">Primary Residence</option>
                <option value="investment-property">Investment Property</option>
                <option value="rental">Rental</option>
                <option value="commercial">Commercial</option>
                <option value="vacant-land">Vacant Land</option>
              </select>
            </div>
          </div>
        </div>

        {/* Purchase Information */}
        <div>
          <h3 className="font-heading font-semibold text-navy text-lg mb-4">
            Purchase Information
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block font-body text-sm font-medium text-gray-700 mb-1">
                Estimated Purchase Price <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="estimatedPrice"
                value={form.estimatedPrice}
                onChange={handleChange}
                required
                placeholder="$ 500,000"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 font-body text-sm focus:outline-none focus:ring-2 focus:ring-lime/50 focus:border-lime"
              />
            </div>
            <div>
              <label className="block font-body text-sm font-medium text-gray-700 mb-1">
                Expected Closing Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                name="closingDate"
                value={form.closingDate}
                onChange={handleChange}
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-3 font-body text-sm focus:outline-none focus:ring-2 focus:ring-lime/50 focus:border-lime"
              />
            </div>
            <div>
              <label className="block font-body text-sm font-medium text-gray-700 mb-1">
                Mortgage Type Needed
              </label>
              <select
                name="mortgageType"
                value={form.mortgageType}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 font-body text-sm focus:outline-none focus:ring-2 focus:ring-lime/50 focus:border-lime bg-white"
              >
                <option value="">Select mortgage type</option>
                <option value="purchase">Purchase</option>
                <option value="refinance">Refinance</option>
                <option value="renewal">Renewal</option>
                <option value="private">Private</option>
                <option value="not-sure">Not Sure</option>
              </select>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div>
          <h3 className="font-heading font-semibold text-navy text-lg mb-4">
            Notes from Agent
          </h3>
          <textarea
            name="notes"
            value={form.notes}
            onChange={handleChange}
            rows={4}
            placeholder="Any additional context about the client or their situation..."
            className="w-full border border-gray-300 rounded-lg px-4 py-3 font-body text-sm focus:outline-none focus:ring-2 focus:ring-lime/50 focus:border-lime resize-none"
          />
        </div>

        {/* Submit */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="bg-lime text-navy font-heading font-bold px-8 py-4 rounded-lg hover:bg-lime-dark transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              'Submitting...'
            ) : (
              <>
                Submit Referral <Send className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
