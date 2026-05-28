'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSignIn } from '@clerk/nextjs'
import { Loader2 } from 'lucide-react'

interface OnboardingPartnerWelcomeClientProps {
  firstName: string
  email: string
  partnerId: string
  token: string
  kindLabel: string
}

// Partner-flavored single-screen welcome → password flow. Sibling of
// the investor OnboardingWelcomeClient, with two differences:
//   1. Copy is generic ("Fox Mortgage partner portal"), no investor
//      language.
//   2. Posts to /api/onboard/partner/signup (NOT /api/onboard/signup),
//      which writes the per-type Clerk metadata key from the
//      PARTNER_TYPE_CONFIGS lookup. The investor route is untouched.
//
// After successful signup the partner is redirected to their kind's
// portal dashboard (returned by the signup API).
export default function OnboardingPartnerWelcomeClient({
  firstName,
  email,
  partnerId,
  token,
  kindLabel,
}: OnboardingPartnerWelcomeClientProps) {
  const router = useRouter()
  const { signIn, setActive, isLoaded: signInLoaded } = useSignIn()
  const [phase, setPhase] = useState<'welcome' | 'password'>('welcome')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (!signInLoaded) {
      setError('Sign-in service is still loading. Please try again in a moment.')
      return
    }

    setBusy(true)
    try {
      const res = await fetch('/api/onboard/partner/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId, token, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Account creation failed. Please try again.')
        setBusy(false)
        return
      }

      // Sign in immediately so the redirect lands in an authenticated
      // session.
      const attempt = await signIn.create({
        identifier: email,
        password,
      })
      if (attempt.status === 'complete' && attempt.createdSessionId) {
        await setActive({ session: attempt.createdSessionId })
        // Per-kind destination returned by the signup API — never
        // hardcoded here. If the API omits it, fall back to /portal
        // which will run the role ladder.
        const redirectTo = typeof data.redirectTo === 'string' && data.redirectTo
          ? data.redirectTo
          : '/portal'
        router.push(redirectTo)
        return
      }

      router.push('/portal/sign-in')
    } catch (err) {
      console.error('[OnboardingPartnerWelcomeClient] signup flow error', err)
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm max-w-xl w-full p-8 sm:p-10">
        <p className="font-heading text-lime text-sm tracking-wider uppercase mb-2">
          Fox Mortgage · {kindLabel} Portal
        </p>
        <h1 className="font-heading text-navy text-3xl font-bold mb-3">
          Welcome, {firstName}
        </h1>

        {phase === 'welcome' && (
          <>
            <p className="font-body text-gray-700 text-base leading-relaxed mb-6">
              Thanks for partnering with Fox Mortgage. Your portal gives
              you a real-time view of every client mortgage file you&apos;ve
              referred or that you&apos;re working on with us — stage updates,
              messages, and document handoffs in one place.
            </p>
            <p className="font-body text-gray-700 text-base leading-relaxed mb-8">
              To get started, you&apos;ll create a secure account with a password of your choosing.
            </p>
            <button
              onClick={() => setPhase('password')}
              className="bg-lime text-navy font-heading font-bold text-base px-6 py-3 rounded-lg hover:bg-lime-dark transition-colors"
            >
              Create my account
            </button>
          </>
        )}

        {phase === 'password' && (
          <form onSubmit={submit}>
            <p className="font-body text-gray-700 text-base leading-relaxed mb-6">
              Pick a secure password. We&apos;ll use this for sign-in on future visits.
            </p>

            <div className="mb-4">
              <label className="block text-gray-500 text-xs font-body mb-1">Email</label>
              <input
                type="email"
                value={email}
                disabled
                readOnly
                className="bg-gray-100 text-gray-600 rounded-lg px-4 py-3 w-full font-body text-sm"
              />
            </div>

            <div className="mb-4">
              <label className="block text-gray-500 text-xs font-body mb-1">Password (minimum 8 characters)</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                autoComplete="new-password"
                className="bg-white text-navy rounded-lg px-4 py-3 w-full border border-gray-200 focus:ring-2 focus:ring-lime outline-none font-body text-sm"
              />
            </div>

            <div className="mb-6">
              <label className="block text-gray-500 text-xs font-body mb-1">Confirm password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={busy}
                autoComplete="new-password"
                className="bg-white text-navy rounded-lg px-4 py-3 w-full border border-gray-200 focus:ring-2 focus:ring-lime outline-none font-body text-sm"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 font-body text-sm text-red-700 mb-4">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setPhase('welcome')}
                disabled={busy}
                className="text-gray-500 font-body text-sm hover:text-navy"
              >
                ← Back
              </button>
              <button
                type="submit"
                disabled={busy}
                className="bg-lime text-navy font-heading font-bold text-base px-6 py-3 rounded-lg hover:bg-lime-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {busy ? 'Creating account…' : 'Create account'}
              </button>
            </div>
          </form>
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
