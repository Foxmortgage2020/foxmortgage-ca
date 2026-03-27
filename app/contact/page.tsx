'use client'

import Nav from '@/components/nav'
import Footer from '@/components/footer'
import { useState } from 'react'

export default function Contact() {
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '', interest: 'General Inquiry' })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      setSubmitted(true)
    } catch {
      setSubmitted(true)
    } finally {
      setLoading(false)
    }
  }

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }))

  return (
    <main className="min-h-screen">
      <Nav />
      <div className="pt-24">
        <section className="py-16 bg-navy text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="font-body text-lime text-sm uppercase tracking-wider mb-4">Contact</p>
              <h1 className="font-heading font-bold text-4xl mb-4">Let's talk mortgages.</h1>
              <p className="font-body text-gray-300 text-lg">Book a free consultation, ask a question, or start the process. Michael responds within 1 business day.</p>
            </div>
          </div>
        </section>

        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
              {/* Form */}
              <div>
                {submitted ? (
                  <div className="bg-lime/10 border border-lime/30 rounded-2xl p-10 text-center">
                    <div className="text-4xl mb-4">✅</div>
                    <h3 className="font-heading font-bold text-navy text-xl mb-2">Message received!</h3>
                    <p className="font-body text-gray-600 text-sm">Michael will be in touch within 1 business day.</p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label className="font-body text-sm font-medium text-navy block mb-2">Name *</label>
                        <input type="text" required value={form.name} onChange={update('name')} placeholder="Your full name" className="w-full px-4 py-3 rounded-xl border border-gray-200 font-body text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime" />
                      </div>
                      <div>
                        <label className="font-body text-sm font-medium text-navy block mb-2">Email *</label>
                        <input type="email" required value={form.email} onChange={update('email')} placeholder="you@email.com" className="w-full px-4 py-3 rounded-xl border border-gray-200 font-body text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime" />
                      </div>
                    </div>
                    <div>
                      <label className="font-body text-sm font-medium text-navy block mb-2">Phone</label>
                      <input type="tel" value={form.phone} onChange={update('phone')} placeholder="(519) 000-0000" className="w-full px-4 py-3 rounded-xl border border-gray-200 font-body text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime" />
                    </div>
                    <div>
                      <label className="font-body text-sm font-medium text-navy block mb-2">I'm interested in</label>
                      <select value={form.interest} onChange={update('interest')} className="w-full px-4 py-3 rounded-xl border border-gray-200 font-body text-navy focus:outline-none focus:ring-2 focus:ring-lime">
                        <option>General Inquiry</option>
                        <option>Purchase Mortgage</option>
                        <option>Renewal / Refinance</option>
                        <option>Strategic Mortgage Monitoring</option>
                        <option>Self-Employed Mortgage</option>
                        <option>Investment Property</option>
                        <option>Private Lending</option>
                        <option>Realtor Partnership</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-body text-sm font-medium text-navy block mb-2">Message</label>
                      <textarea value={form.message} onChange={update('message')} rows={4} placeholder="Tell me a bit about your situation..." className="w-full px-4 py-3 rounded-xl border border-gray-200 font-body text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime resize-none" />
                    </div>
                    <button type="submit" disabled={loading} className="w-full bg-lime text-navy font-heading font-bold py-4 rounded-xl hover:bg-lime-dark transition-colors disabled:opacity-60">
                      {loading ? 'Sending…' : 'Send Message'}
                    </button>
                  </form>
                )}
              </div>

              {/* Info */}
              <div className="space-y-8">
                <div>
                  <h3 className="font-heading font-bold text-navy text-xl mb-4">What to expect</h3>
                  <ul className="space-y-3 font-body text-sm text-gray-600">
                    {['Response within 1 business day', 'No obligation consultation', 'Straightforward advice — no pressure', 'Full market comparison before any recommendation'].map((p) => (
                      <li key={p} className="flex items-start gap-3">
                        <span className="text-lime mt-0.5">✓</span>{p}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
                  <h3 className="font-heading font-bold text-navy text-sm uppercase tracking-wider mb-3">Michael Fox</h3>
                  <p className="font-body text-sm text-gray-600">Mortgage Agent, Level 2</p>
                  <p className="font-body text-sm text-gray-500">BRX Mortgage · FSRA #13463</p>
                  <p className="font-body text-sm text-gray-500 mt-2">Fergus · Guelph · Wellington County</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
      <Footer />
    </main>
  )
}
