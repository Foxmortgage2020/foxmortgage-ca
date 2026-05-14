'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'

interface ExpiredOnboardingClientProps {
  refToken: string
  partnerName: string | null
  partnerEmail: string | null
}

// Single-screen client: shows the expired-link message, lets the
// investor request a new link, then shows the confirmation message.
// The investor never sees an error state — the flow stays warm.
//
// NOTE: prop is named `refToken` rather than `ref` because `ref` is
// a reserved React prop and can't be passed from a Server Component
// to a Client Component (React 19 / Next 14 rule).
export default function ExpiredOnboardingClient({
  refToken,
  partnerName,
  partnerEmail,
}: ExpiredOnboardingClientProps) {
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requestNewLink = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/onboard/request-new-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: refToken }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Something went wrong. Please try again.')
        return
      }
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm max-w-xl w-full p-8 sm:p-10">
        <p className="font-heading text-lime text-sm tracking-wider uppercase mb-2">
          Fox Mortgage · Investor Onboarding
        </p>

        {sent ? (
          <>
            <h1 className="font-heading text-navy text-3xl font-bold mb-4">
              Got it.
            </h1>
            <p className="font-body text-gray-700 text-base leading-relaxed">
              Mike will reach out within one business day with a fresh onboarding link.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-heading text-navy text-3xl font-bold mb-4">
              This onboarding link has expired.
            </h1>
            <p className="font-body text-gray-700 text-base leading-relaxed mb-8">
              To request a new link, click below and Mike will be in touch within one business day.
            </p>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 font-body text-sm text-red-700 mb-4">
                {error}
              </div>
            )}

            <button
              onClick={requestNewLink}
              disabled={busy}
              className="bg-lime text-navy font-heading font-bold text-base px-6 py-3 rounded-lg hover:bg-lime-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {busy ? 'Sending request…' : 'Request a new link'}
            </button>

            {/* Surfacing partner name/email only when we already
                resolved it server-side — never as a leak channel. */}
            {partnerName && (
              <p className="text-gray-500 text-xs font-body mt-6">
                Linked to {partnerName}{partnerEmail ? ` (${partnerEmail})` : ''}.
              </p>
            )}
          </>
        )}
      </div>

      <p className="text-gray-500 text-xs font-body mt-6">
        Questions? Email{' '}
        <a href="mailto:mfox@foxmortgage.ca" className="text-lime hover:underline font-semibold">
          mfox@foxmortgage.ca
        </a>
      </p>
    </div>
  )
}
