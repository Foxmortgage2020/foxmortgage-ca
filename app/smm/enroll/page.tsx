'use client'

import Link from 'next/link'
import { useState } from 'react'

const PROVINCES = [
  'Ontario',
  'British Columbia',
  'Alberta',
  'Quebec',
  'Manitoba',
  'Saskatchewan',
  'Nova Scotia',
  'New Brunswick',
  'Newfoundland and Labrador',
  'Prince Edward Island',
  'Northwest Territories',
  'Yukon',
  'Nunavut',
]

const PROPERTY_TYPES = [
  { value: 'primary', label: 'Primary Residence', icon: '🏠' },
  { value: 'rental', label: 'Rental Property', icon: '🏘️' },
  { value: 'vacation', label: 'Vacation / Cottage', icon: '🏖️' },
] as const

const RATE_TYPES = [
  { value: 'fixed', label: 'Fixed' },
  { value: 'variable', label: 'Variable' },
  { value: 'adjustable', label: 'Adjustable' },
  { value: 'unsure', label: 'Not sure' },
] as const

const MORTGAGE_AMOUNTS = [
  'Under $300K',
  '$300K–$500K',
  '$500K–$750K',
  '$750K–$1M',
  'Over $1M',
]

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const RENEWAL_YEARS = ['2025', '2026', '2027', '2028', '2029', '2030']

const REFERRAL_SOURCES = [
  'Google',
  'Friend referral',
  'Realtor referral',
  'Social media',
  'Other',
]

interface FormData {
  firstName: string
  lastName: string
  email: string
  phone: string
  propertyType: string
  city: string
  province: string
  currentLender: string
  currentRate: string
  rateType: string
  mortgageAmount: string
  renewalMonth: string
  renewalYear: string
  referralSource: string
  referralName: string
}

const emptyForm: FormData = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  propertyType: '',
  city: '',
  province: 'Ontario',
  currentLender: '',
  currentRate: '',
  rateType: '',
  mortgageAmount: '',
  renewalMonth: '',
  renewalYear: '',
  referralSource: '',
  referralName: '',
}

const INPUT =
  'w-full px-4 py-3 rounded-xl border border-gray-200 font-body text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime focus:border-transparent bg-white'

const SELECT =
  'w-full px-4 py-3 rounded-xl border border-gray-200 font-body text-navy focus:outline-none focus:ring-2 focus:ring-lime focus:border-transparent bg-white'

export default function SMMEnrollPage() {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  function set(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function valid(): boolean {
    switch (step) {
      case 1:
        return (
          form.firstName.trim() !== '' &&
          form.lastName.trim() !== '' &&
          form.email.trim() !== ''
        )
      case 2:
        return form.propertyType !== '' && form.city.trim() !== ''
      case 3:
        return (
          form.currentLender.trim() !== '' &&
          form.currentRate.trim() !== '' &&
          form.rateType !== '' &&
          form.mortgageAmount !== ''
        )
      case 4:
        return (
          form.renewalMonth !== '' &&
          form.renewalYear !== '' &&
          form.referralSource !== ''
        )
      default:
        return true
    }
  }

  async function handleSubmit() {
    if (!valid()) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const res = await fetch('/api/smm-enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          source: 'smm-enroll-wizard',
          submittedAt: new Date().toISOString(),
        }),
      })
      if (!res.ok) throw new Error('non-200')
      setStep(5)
    } catch {
      setSubmitError('Something went wrong. Please try again or call us at 519-654-8173.')
    } finally {
      setSubmitting(false)
    }
  }

  const showBack = step > 1 && step < 5

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ── Progress area ── */}
      {step < 5 && (
        <div className="w-full">
          {/* Back button row — above progress bar */}
          <div className="max-w-xl mx-auto px-4 sm:px-6 pt-6 pb-2">
            {showBack ? (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="font-body text-sm text-navy hover:text-lime transition-colors"
              >
                ← Back
              </button>
            ) : (
              <div className="h-5" />
            )}
          </div>

          {/* Full-width lime bar */}
          <div className="h-1.5 bg-gray-200 w-full">
            <div
              className="h-full bg-lime transition-all duration-500 ease-out"
              style={{ width: `${(step / 5) * 100}%` }}
            />
          </div>

          {/* Step label */}
          <div className="max-w-xl mx-auto px-4 sm:px-6 pt-2">
            <span className="font-body text-xs text-gray-400 uppercase tracking-wider">
              Step {step} of 5
            </span>
          </div>
        </div>
      )}

      {/* ── Step content ── */}
      <div className="flex-1 max-w-xl w-full mx-auto px-4 sm:px-6 py-10">

        {/* STEP 1 */}
        {step === 1 && (
          <div>
            <h1 className="font-heading font-bold text-3xl text-navy mb-2">
              Let&apos;s get you set up.
            </h1>
            <p className="font-body text-gray-500 mb-10">
              Takes about 3 minutes. No obligation.
            </p>

            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block font-body text-sm font-medium text-navy mb-1.5">
                    First name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.firstName}
                    onChange={(e) => set('firstName', e.target.value)}
                    className={INPUT}
                    placeholder="Michael"
                  />
                </div>
                <div>
                  <label className="block font-body text-sm font-medium text-navy mb-1.5">
                    Last name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.lastName}
                    onChange={(e) => set('lastName', e.target.value)}
                    className={INPUT}
                    placeholder="Fox"
                  />
                </div>
              </div>
              <div>
                <label className="block font-body text-sm font-medium text-navy mb-1.5">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  className={INPUT}
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="block font-body text-sm font-medium text-navy mb-1.5">
                  Phone{' '}
                  <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  className={INPUT}
                  placeholder="519-654-8173"
                />
              </div>
            </div>

            <button
              onClick={() => valid() && setStep(2)}
              disabled={!valid()}
              className="mt-10 w-full bg-lime text-navy font-heading font-bold py-4 rounded-xl hover:bg-lime-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div>
            <h1 className="font-heading font-bold text-3xl text-navy mb-10">
              Tell us about your property.
            </h1>

            <div className="space-y-6">
              <div>
                <label className="block font-body text-sm font-medium text-navy mb-3">
                  Property type <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {PROPERTY_TYPES.map((pt) => (
                    <button
                      key={pt.value}
                      type="button"
                      onClick={() => set('propertyType', pt.value)}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                        form.propertyType === pt.value
                          ? 'border-lime bg-lime/5'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <span className="text-2xl">{pt.icon}</span>
                      <span className="font-body text-xs font-medium text-navy text-center leading-tight">
                        {pt.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-body text-sm font-medium text-navy mb-1.5">
                  City <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => set('city', e.target.value)}
                  className={INPUT}
                  placeholder="Fergus"
                />
              </div>

              <div>
                <label className="block font-body text-sm font-medium text-navy mb-1.5">
                  Province
                </label>
                <select
                  value={form.province}
                  onChange={(e) => set('province', e.target.value)}
                  className={SELECT}
                >
                  {PROVINCES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={() => valid() && setStep(3)}
              disabled={!valid()}
              className="mt-10 w-full bg-lime text-navy font-heading font-bold py-4 rounded-xl hover:bg-lime-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div>
            <h1 className="font-heading font-bold text-3xl text-navy mb-2">
              About your current mortgage.
            </h1>
            <p className="font-body text-gray-500 mb-10">
              Approximate figures are fine.
            </p>

            <div className="space-y-6">
              <div>
                <label className="block font-body text-sm font-medium text-navy mb-1.5">
                  Current lender <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.currentLender}
                  onChange={(e) => set('currentLender', e.target.value)}
                  className={INPUT}
                  placeholder="e.g. TD, RBC, Scotiabank"
                />
              </div>

              <div>
                <label className="block font-body text-sm font-medium text-navy mb-1.5">
                  Current rate <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="20"
                    value={form.currentRate}
                    onChange={(e) => set('currentRate', e.target.value)}
                    className={INPUT + ' pr-10'}
                    placeholder="5.24"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 font-body text-gray-400 select-none">
                    %
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-body text-sm font-medium text-navy mb-3">
                  Rate type <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {RATE_TYPES.map((rt) => (
                    <button
                      key={rt.value}
                      type="button"
                      onClick={() => set('rateType', rt.value)}
                      className={`px-5 py-2.5 rounded-xl border-2 font-body text-sm font-medium transition-all ${
                        form.rateType === rt.value
                          ? 'border-lime bg-lime/5 text-navy'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {rt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-body text-sm font-medium text-navy mb-1.5">
                  Mortgage amount <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.mortgageAmount}
                  onChange={(e) => set('mortgageAmount', e.target.value)}
                  className={SELECT}
                >
                  <option value="">Select a range</option>
                  {MORTGAGE_AMOUNTS.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={() => valid() && setStep(4)}
              disabled={!valid()}
              className="mt-10 w-full bg-lime text-navy font-heading font-bold py-4 rounded-xl hover:bg-lime-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        )}

        {/* STEP 4 */}
        {step === 4 && (
          <div>
            <h1 className="font-heading font-bold text-3xl text-navy mb-2">
              When does your mortgage renew?
            </h1>
            <p className="font-body text-gray-500 mb-10">
              This is the most important date we monitor.
            </p>

            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block font-body text-sm font-medium text-navy mb-1.5">
                    Renewal month <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.renewalMonth}
                    onChange={(e) => set('renewalMonth', e.target.value)}
                    className={SELECT}
                  >
                    <option value="">Month</option>
                    {MONTHS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-body text-sm font-medium text-navy mb-1.5">
                    Renewal year <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.renewalYear}
                    onChange={(e) => set('renewalYear', e.target.value)}
                    className={SELECT}
                  >
                    <option value="">Year</option>
                    {RENEWAL_YEARS.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-body text-sm font-medium text-navy mb-1.5">
                  How did you hear about us? <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.referralSource}
                  onChange={(e) => set('referralSource', e.target.value)}
                  className={SELECT}
                >
                  <option value="">Select one</option>
                  {REFERRAL_SOURCES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {(form.referralSource === 'Friend referral' ||
                form.referralSource === 'Realtor referral') && (
                <div>
                  <label className="block font-body text-sm font-medium text-navy mb-1.5">
                    Referral name{' '}
                    <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={form.referralName}
                    onChange={(e) => set('referralName', e.target.value)}
                    className={INPUT}
                    placeholder="Who referred you?"
                  />
                </div>
              )}
            </div>

            {submitError && (
              <div className="mt-6 bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="font-body text-sm text-red-600">{submitError}</p>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={!valid() || submitting}
              className="mt-10 w-full bg-lime text-navy font-heading font-bold py-4 rounded-xl hover:bg-lime-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'Enrolling…' : 'Enroll Me →'}
            </button>
          </div>
        )}

        {/* STEP 5 — Confirmation */}
        {step === 5 && (
          <div className="text-center pt-8">
            {/* Checkmark */}
            <div className="w-20 h-20 rounded-full bg-lime/20 flex items-center justify-center mx-auto mb-6">
              <svg
                className="w-10 h-10 text-lime"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h1 className="font-heading font-bold text-3xl text-navy mb-3">
              You&apos;re enrolled. 🎉
            </h1>
            <p className="font-body text-gray-500 mb-10">
              Strategic Mortgage Monitoring is now active on your file.
            </p>

            {/* What happens next */}
            <div className="bg-white rounded-2xl border border-gray-100 p-7 text-left mb-10">
              <h2 className="font-heading font-bold text-base text-navy mb-6">
                What happens next
              </h2>
              <div className="space-y-5">
                {[
                  "I'll reach out within 1 business day to verify your mortgage details.",
                  'Your file enters daily monitoring — rate movements, market shifts, renewal timing.',
                  "I'll contact you when there's a genuine opportunity. Not on a schedule — only when it matters.",
                ].map((text, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="w-7 h-7 rounded-full bg-lime/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="font-heading font-bold text-xs text-lime">
                        {i + 1}
                      </span>
                    </div>
                    <p className="font-body text-sm text-gray-600 leading-relaxed">{text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* CTAs */}
            <Link
              href="/contact"
              className="block w-full sm:w-auto sm:inline-block bg-lime text-navy font-heading font-bold px-10 py-4 rounded-xl hover:bg-lime-dark transition-colors"
            >
              Book a Call
            </Link>
            <div className="mt-4">
              <Link
                href="/"
                className="font-body text-sm text-gray-500 hover:text-navy transition-colors underline underline-offset-2"
              >
                Back to homepage
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
