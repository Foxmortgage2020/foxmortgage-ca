'use client'

import { useClerk, useSignIn } from '@clerk/nextjs'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function SignInPage() {
  const { signIn, isLoaded } = useSignIn()
  const { setActive } = useClerk()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [mode, setMode] = useState<'signin' | 'forgot' | 'reset'>('signin')
  const [resetEmail, setResetEmail] = useState('')
  const [resetCode, setResetCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState('')
  const [resetSuccess, setResetSuccess] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isLoaded) return
    setLoading(true)
    setError('')

    try {
      const result = await signIn.create({
        identifier: email,
        password,
      })

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId })
        router.push('/portal')
      } else {
        setError('Sign-in could not be completed. Please check your credentials and try again.')
      }
    } catch (err: unknown) {
      const clerkErr = err as { errors?: { message?: string }[] }
      const msg = clerkErr.errors?.[0]?.message || 'Invalid email or password'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isLoaded) return
    setResetLoading(true)
    setResetError('')
    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: resetEmail,
      })
      setMode('reset')
      setResetSuccess('Check your email for a reset code.')
    } catch (err: unknown) {
      const clerkErr = err as { errors?: { message?: string }[] }
      setResetError(clerkErr.errors?.[0]?.message || 'Could not send reset email')
    } finally {
      setResetLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isLoaded) return
    setResetLoading(true)
    setResetError('')
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: resetCode,
        password: newPassword,
      })
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId })
        router.push('/portal')
      }
    } catch (err: unknown) {
      const clerkErr = err as { errors?: { message?: string }[] }
      setResetError(clerkErr.errors?.[0]?.message || 'Invalid code or password')
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* LEFT PANEL — Dark with background image */}
      <div
        className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1200&q=80')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-navy/85" />

        {/* Top — Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <span className="font-heading font-bold text-white text-2xl">Fox</span>
            <span className="font-heading font-bold text-lime text-2xl">Mortgage</span>
          </div>
          <p className="text-gray-400 text-sm mt-1 font-body">
            Strategic Mortgage Monitoring
          </p>
        </div>

        {/* Center — Headline + trust bullets */}
        <div className="relative z-10">
          <div className="inline-block bg-lime/20 border border-lime/30 rounded-full px-4 py-1.5 mb-6">
            <span className="text-lime text-xs font-body font-semibold uppercase tracking-widest">
              Partner &amp; Investor Portal
            </span>
          </div>
          <h1 className="font-heading text-white text-4xl font-bold leading-tight mb-4">
            Welcome Back.
          </h1>
          <p className="text-gray-300 font-body text-lg leading-relaxed mb-8">
            Access your dedicated dashboard to monitor client mortgages, track investments, and unlock real-time opportunities.
          </p>

          <div className="space-y-3">
            {[
              'Real-time mortgage monitoring',
              'Live investment portfolio tracking',
              'Direct line to Michael Fox',
            ].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-lime/20 border border-lime/40 flex items-center justify-center flex-shrink-0">
                  <svg className="w-3 h-3 text-lime" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-gray-300 font-body text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom — Compliance */}
        <div className="relative z-10">
          <p className="text-gray-500 text-xs font-body">
            Michael Fox · Mortgage Agent, Level 2<br />
            BRX Mortgage · FSRA #13463
          </p>
        </div>
      </div>

      {/* RIGHT PANEL — Clean white form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-8 sm:px-16 lg:px-20 py-12 bg-white">

        {/* Mobile logo */}
        <div className="flex items-center gap-1 mb-10 lg:hidden">
          <span className="font-heading font-bold text-navy text-xl">Fox</span>
          <span className="font-heading font-bold text-lime text-xl">Mortgage</span>
        </div>

        <div className="max-w-sm w-full mx-auto">

          {/* MODE: SIGN IN */}
          {mode === 'signin' && (
            <>
              <div className="mb-8">
                <h2 className="font-heading text-navy text-3xl font-bold mb-2">Sign In</h2>
                <p className="text-gray-500 font-body text-sm">Enter your credentials to access your portal</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-body font-medium text-gray-700 mb-1.5">Email Address</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl font-body text-sm text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime/50 focus:border-lime transition-colors bg-gray-50 hover:border-gray-300" />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-sm font-body font-medium text-gray-700">Password</label>
                    <button type="button" onClick={() => { setMode('forgot'); setResetEmail(email) }} className="text-xs text-lime font-body font-medium hover:underline">Forgot password?</button>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" required className="w-full pl-10 pr-12 py-3 border border-gray-200 rounded-xl font-body text-sm text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime/50 focus:border-lime transition-colors bg-gray-50 hover:border-gray-300" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600">
                      {showPassword ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" /></svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                    <p className="text-red-600 text-sm font-body">{error}</p>
                  </div>
                )}

                <button type="submit" disabled={loading || !isLoaded} className="w-full bg-lime text-navy py-3.5 rounded-xl font-heading font-bold text-sm tracking-wide hover:bg-lime/90 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2">
                  {loading ? (<><div className="w-4 h-4 border-2 border-navy/30 border-t-navy rounded-full animate-spin" />Signing in...</>) : 'Sign In →'}
                </button>
              </form>
            </>
          )}

          {/* MODE: FORGOT PASSWORD */}
          {mode === 'forgot' && (
            <div>
              <div className="mb-8">
                <button onClick={() => { setMode('signin'); setResetError('') }} className="text-gray-400 text-sm font-body hover:text-navy flex items-center gap-1 mb-4">← Back to sign in</button>
                <h2 className="font-heading text-navy text-3xl font-bold mb-2">Reset Password</h2>
                <p className="text-gray-500 font-body text-sm">Enter your email and we&apos;ll send you a reset code.</p>
              </div>
              <form onSubmit={handleForgotPassword} className="space-y-5">
                <div>
                  <label className="block text-sm font-body font-medium text-gray-700 mb-1.5">Email Address</label>
                  <input type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} placeholder="you@example.com" required className="w-full px-4 py-3 border border-gray-200 rounded-xl font-body text-sm text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime/50 focus:border-lime transition-colors bg-gray-50" />
                </div>
                {resetError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                    <p className="text-red-600 text-sm font-body">{resetError}</p>
                  </div>
                )}
                <button type="submit" disabled={resetLoading} className="w-full bg-lime text-navy py-3.5 rounded-xl font-heading font-bold text-sm tracking-wide hover:bg-lime/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  {resetLoading ? (<><div className="w-4 h-4 border-2 border-navy/30 border-t-navy rounded-full animate-spin" />Sending...</>) : 'Send Reset Code →'}
                </button>
              </form>
            </div>
          )}

          {/* MODE: ENTER RESET CODE */}
          {mode === 'reset' && (
            <div>
              <div className="mb-8">
                <h2 className="font-heading text-navy text-3xl font-bold mb-2">Enter Reset Code</h2>
                <p className="text-gray-500 font-body text-sm">Check your email for a 6-digit code, then set your new password.</p>
              </div>
              {resetSuccess && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-5">
                  <p className="text-green-700 text-sm font-body">{resetSuccess}</p>
                </div>
              )}
              <form onSubmit={handleResetPassword} className="space-y-5">
                <div>
                  <label className="block text-sm font-body font-medium text-gray-700 mb-1.5">Reset Code</label>
                  <input type="text" value={resetCode} onChange={(e) => setResetCode(e.target.value)} placeholder="6-digit code from email" required className="w-full px-4 py-3 border border-gray-200 rounded-xl font-body text-sm text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime/50 focus:border-lime transition-colors bg-gray-50" />
                </div>
                <div>
                  <label className="block text-sm font-body font-medium text-gray-700 mb-1.5">New Password</label>
                  <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password" required className="w-full px-4 py-3 border border-gray-200 rounded-xl font-body text-sm text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime/50 focus:border-lime transition-colors bg-gray-50" />
                </div>
                {resetError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                    <p className="text-red-600 text-sm font-body">{resetError}</p>
                  </div>
                )}
                <button type="submit" disabled={resetLoading} className="w-full bg-lime text-navy py-3.5 rounded-xl font-heading font-bold text-sm tracking-wide hover:bg-lime/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  {resetLoading ? (<><div className="w-4 h-4 border-2 border-navy/30 border-t-navy rounded-full animate-spin" />Resetting...</>) : 'Reset Password →'}
                </button>
              </form>
            </div>
          )}

          {/* Footer — always visible */}
          <div className="mt-8 pt-6 border-t border-gray-100 text-center">
            <p className="text-gray-400 text-xs font-body">🔒 Secure access. Authorized partners and investors only.</p>
            <p className="text-gray-400 text-xs font-body mt-1">
              Need access?{' '}
              <Link href="/contact" className="text-lime hover:underline">Contact Michael</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
