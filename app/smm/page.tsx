'use client'

import Nav from '@/components/nav'
import Footer from '@/components/footer'
import SMMDashboardCard from '@/components/smm-dashboard-card'
import { useState } from 'react'

export default function SMMPage() {
  const [submitted, setSubmitted] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await fetch('/api/smm-enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, source: 'smm-page' }),
      })
      setSubmitted(true)
    } catch {
      setSubmitted(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen">
      <Nav />
      <div className="pt-24">
        {/* Hero */}
        <section className="py-20 bg-navy text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <div>
                <div className="inline-flex items-center bg-lime/10 border border-lime/20 rounded-full px-4 py-1.5 mb-6">
                  <span className="w-2 h-2 rounded-full bg-lime mr-2 animate-pulse"></span>
                  <span className="font-body text-xs font-medium text-lime">Monitoring Active</span>
                </div>
                <h1 className="font-heading font-bold text-4xl md:text-5xl mb-6 leading-tight">
                  Strategic Mortgage<br /><span className="text-lime">Monitoring</span>
                </h1>
                <p className="font-body text-gray-300 text-lg leading-relaxed mb-8">
                  Most homeowners find out about savings opportunities after they've passed. Strategic Mortgage Monitoring means someone is always watching — so you're always positioned to act.
                </p>
                <div className="flex flex-wrap gap-6 mb-8">
                  {['Daily rate tracking', 'Renewal alerts', 'Savings reports', 'Annual review'].map((f) => (
                    <div key={f} className="flex items-center gap-2">
                      <span className="text-lime">✓</span>
                      <span className="font-body text-sm text-gray-300">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-center">
                <SMMDashboardCard />
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-20 bg-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-14">
              <h2 className="font-heading font-bold text-3xl text-navy mb-4">How it works</h2>
              <p className="font-body text-gray-500">Simple to start. Powerful over time.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { num: '01', title: 'Enroll in 5 minutes', body: 'Tell us your current rate, lender, renewal date, and mortgage balance. That\'s all we need to start.' },
                { num: '02', title: 'We monitor daily', body: 'Every day we check rate movements, market conditions, and your specific renewal window against current opportunities.' },
                { num: '03', title: 'You act when it matters', body: 'We reach out when there\'s a genuine opportunity. No noise, no sales pressure — just timely intelligence.' },
              ].map((s) => (
                <div key={s.num} className="text-center">
                  <div className="w-14 h-14 rounded-full bg-lime flex items-center justify-center mx-auto mb-5">
                    <span className="font-heading font-bold text-navy">{s.num}</span>
                  </div>
                  <h3 className="font-heading font-bold text-navy text-lg mb-3">{s.title}</h3>
                  <p className="font-body text-gray-500 text-sm leading-relaxed">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Enroll CTA */}
        <section className="py-20 bg-gray-50">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="font-heading font-bold text-3xl text-navy mb-4">Start monitoring your mortgage</h2>
            <p className="font-body text-gray-500 mb-10">Takes 5 minutes. Michael will be in touch to confirm your details.</p>
            {submitted ? (
              <div className="bg-lime/10 border border-lime/30 rounded-2xl p-10">
                <div className="text-4xl mb-4">✅</div>
                <h3 className="font-heading font-bold text-navy text-xl mb-2">You're enrolled!</h3>
                <p className="font-body text-gray-600 text-sm">Michael will reach out within 1 business day to confirm your mortgage details and activate monitoring.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <input
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-5 py-4 rounded-xl border border-gray-200 font-body text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime"
                />
                <input
                  type="email"
                  placeholder="Your email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-5 py-4 rounded-xl border border-gray-200 font-body text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-lime text-navy font-heading font-bold py-4 rounded-xl hover:bg-lime-dark transition-colors disabled:opacity-60"
                >
                  {loading ? 'Submitting…' : 'Enroll in Monitoring'}
                </button>
                <p className="font-body text-xs text-gray-400">
                  No obligation. No spam. Just proactive monitoring.
                </p>
              </form>
            )}
          </div>
        </section>
      </div>
      <Footer />
    </main>
  )
}
