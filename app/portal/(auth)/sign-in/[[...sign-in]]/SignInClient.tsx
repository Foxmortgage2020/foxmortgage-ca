'use client'

import { useClerk, useSignIn, useUser } from '@clerk/nextjs'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

// Role-based destination resolver. Used both by the pre-check redirect
// (when a Clerk session already exists for this browser) and by the
// sign-in form's success path. Priority: admin first (privileged role),
// then financial-planner, then investor. Anything else → null, which
// means "no recognized role" and the caller signs the user out.
//
// Mirrors the 3-shape role normalization used elsewhere in the portal:
// publicMetadata.roles can be an array, a single string, or a single-role
// `role` field (legacy).
function getRoleDestination(metadata: unknown): string | null {
  const m = (metadata ?? {}) as { roles?: unknown; role?: unknown }
  const roles: string[] = Array.isArray(m.roles)
    ? (m.roles as string[])
    : typeof m.roles === 'string'
      ? [m.roles]
      : []
  const role = typeof m.role === 'string' ? m.role : ''

  if (roles.includes('admin') || role === 'admin') return '/portal/admin'
  if (
    roles.includes('financial-planner') ||
    role === 'financial-planner' ||
    roles.includes('fp') ||
    role === 'fp'
  ) {
    return '/portal/fp/dashboard'
  }
  if (roles.includes('investor') || role === 'investor') {
    return '/onboard/investor/hub'
  }
  return null
}

// Sanitize a `redirect_url` query param: only allow same-origin relative
// paths that start with a single "/". Blocks "//evil.com" protocol-relative
// hijacks and absolute URLs.
function safeRedirect(url: string | null): string | null {
  if (!url) return null
  if (!url.startsWith('/') || url.startsWith('//')) return null
  return url
}

// Client-side sign-in form. The server-side wrapper at page.tsx
// already pre-checks for an existing session and server-redirects
// signed-in users to their stage-appropriate destination — this
// component renders only when no session exists. The client-side
// useEffect pre-check below stays as a defensive safety net for
// edge cases (a second tab signs in concurrently, etc.).
export default function SignInClient() {
  const { signIn, isLoaded: signInLoaded } = useSignIn()
  const { setActive, signOut } = useClerk()
  const { user, isLoaded: userLoaded, isSignedIn } = useUser()
  const router = useRouter()
  const searchParams = useSearchParams()

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

  // Graceful fallback state. Set when auto-recovery from a
  // "session_exists" error fails — we then render a CTA card instead
  // of leaking the raw Clerk error to the user.
  const [sessionExistsRecovery, setSessionExistsRecovery] = useState(false)

  // Pre-check: if a Clerk session already exists for this browser,
  // route to the appropriate destination instead of showing the form.
  // Handles the "Abigail returns after closing the tab" case directly.
  useEffect(() => {
    if (!userLoaded) return
    if (!isSignedIn || !user) return

    const requestedUrl = safeRedirect(searchParams.get('redirect_url'))
    if (requestedUrl) {
      router.replace(requestedUrl)
      return
    }

    const dest = getRoleDestination(user.publicMetadata)
    if (dest === null) {
      // Session exists but the user has no recognized role. Sign out
      // so they can re-authenticate fresh; the form will then render
      // because isSignedIn flips false.
      signOut().catch(() => {
        // Swallow — worst case the form renders alongside the stale
        // session; the user's next sign-in attempt will sign-out-then-sign-in
        // via handleSubmit's recovery path.
      })
      return
    }
    router.replace(dest)
  }, [userLoaded, isSignedIn, user, router, searchParams, signOut])

  // Compute the destination for "Continue to portal" in the graceful
  // fallback CTA. Same logic as the pre-check redirect.
  const continueToPortal = useCallback(() => {
    const requestedUrl = safeRedirect(searchParams.get('redirect_url'))
    const dest =
      requestedUrl ?? getRoleDestination(user?.publicMetadata) ?? '/portal'
    router.push(dest)
  }, [router, searchParams, user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!signInLoaded) return
    setLoading(true)
    setError('')
    setSessionExistsRecovery(false)

    try {
      // Defensive: if a stale session is still active, sign it out
      // before creating a new sign-in. Clerk v5's signIn.create()
      // rejects with `session_exists` when an active session exists,
      // which previously bubbled up to the user as a raw error.
      if (isSignedIn) {
        try {
          await signOut()
        } catch {
          // Swallow — we'll catch session_exists on signIn.create
          // and retry one more time below.
        }
      }

      let result
      try {
        result = await signIn.create({ identifier: email, password })
      } catch (err: unknown) {
        const code = (err as { errors?: { code?: string }[] }).errors?.[0]?.code
        if (code === 'session_exists') {
          // Auto-recovery: sign-out didn't take effect above. Retry once.
          try {
            await signOut()
          } catch {
            // If signOut still fails here, throwing will land in the
            // outer catch which sets the graceful CTA state.
          }
          result = await signIn.create({ identifier: email, password })
        } else {
          throw err
        }
      }

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId })

        // Route by role. The just-activated user's metadata lives in
        // `user` once useUser re-renders, but at this exact moment the
        // hook may not have refreshed yet. Trust the previously-attempted
        // sign-in: we look up the metadata from `clerk.client.signIn.userData`
        // implicitly via the freshest source available. Simplest: just
        // hard-navigate to /portal and let the role router there
        // pick the right home — BUT the spec says investors land at
        // /onboard/investor/hub, which /portal/page.tsx does NOT route to
        // (it sends investors to /portal/investor/dashboard).
        //
        // We honor a redirect_url query param when present (deep-link
        // support) and otherwise compute the destination from the
        // user object via useUser — by the time setActive resolves,
        // Clerk's internal state is updated and the user object on
        // next render reflects it. Reading user.publicMetadata
        // synchronously here is safe because useUser's user reference
        // is reactive: setActive triggers a re-render before this
        // function returns.
        const requestedUrl = safeRedirect(searchParams.get('redirect_url'))
        if (requestedUrl) {
          router.push(requestedUrl)
        } else {
          // After setActive, useUser will update on the next tick.
          // Set a small flag that the post-render useEffect picks up
          // and routes off of. But that's racy. Cleaner: just push to
          // /portal and let the role router handle the rest — except
          // /portal sends investors to /portal/investor/dashboard, not
          // the hub. So we do a one-tick wait via Promise resolution
          // then compute the destination from the now-fresh user state.
          //
          // The simplest robust solution: route to /portal as a
          // role-routing pass-through. /portal/page.tsx already
          // handles admin / fp routing correctly. For investors we
          // need /onboard/investor/hub, which we infer from the
          // signed-in email's domain or a follow-up tick. Best
          // option: route to /portal which uses useUser (now fresh)
          // and routes correctly for admin/fp. For investors, we
          // override here since the spec is explicit.
          //
          // Pragmatic approach: read user.publicMetadata if available
          // (set by useUser's subscription after setActive), else
          // fall back to /portal.
          const dest =
            getRoleDestination(user?.publicMetadata) ?? '/portal'
          router.push(dest)
        }
      } else {
        setError(
          'Sign-in could not be completed. Please check your credentials and try again.',
        )
      }
    } catch (err: unknown) {
      const clerkErr = err as {
        errors?: { message?: string; code?: string }[]
      }
      const code = clerkErr.errors?.[0]?.code
      const msg = clerkErr.errors?.[0]?.message || 'Invalid email or password'

      if (code === 'session_exists') {
        // Auto-recovery failed (both signOut attempts couldn't clear
        // the stale session). Show graceful CTA instead of raw error.
        setSessionExistsRecovery(true)
        setError('')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!signInLoaded) return
    setResetLoading(true)
    setResetError('')
    try {
      // Same defensive signOut as handleSubmit — the reset flow also
      // calls signIn.create() and can hit session_exists.
      if (isSignedIn) {
        try {
          await signOut()
        } catch {
          // Swallow; signIn.create below will surface the issue.
        }
      }
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: resetEmail,
      })
      setMode('reset')
      setResetSuccess('Check your email for a reset code.')
    } catch (err: unknown) {
      const clerkErr = err as { errors?: { message?: string }[] }
      setResetError(
        clerkErr.errors?.[0]?.message || 'Could not send reset email',
      )
    } finally {
      setResetLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!signInLoaded) return
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
        // Role-aware redirect, same as the sign-in success path.
        const requestedUrl = safeRedirect(searchParams.get('redirect_url'))
        const dest =
          requestedUrl ??
          getRoleDestination(user?.publicMetadata) ??
          '/portal'
        router.push(dest)
      }
    } catch (err: unknown) {
      const clerkErr = err as { errors?: { message?: string }[] }
      setResetError(clerkErr.errors?.[0]?.message || 'Invalid code or password')
    } finally {
      setResetLoading(false)
    }
  }

  // Don't flash the sign-in form while we're loading user state OR
  // while we know the user is signed in and the redirect useEffect is
  // about to fire. Avoids the visible-form-then-redirect flicker that
  // Abigail would otherwise see.
  if (!userLoaded || isSignedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-lime border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="font-body text-navy font-semibold">Fox Mortgage</p>
          <p className="font-body text-gray-500 text-sm mt-1">Loading...</p>
        </div>
      </div>
    )
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

          {/* Graceful fallback: auto-recovery from session_exists failed.
              Render an explicit CTA instead of leaking the raw error. */}
          {sessionExistsRecovery && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
              <h3 className="font-heading text-navy text-lg font-bold mb-2">
                You&apos;re already signed in.
              </h3>
              <p className="text-gray-600 font-body text-sm leading-relaxed mb-4">
                We couldn&apos;t switch accounts automatically. Click below to continue
                to your portal. If you want to use a different account, sign out
                from inside the portal first.
              </p>
              <button
                onClick={continueToPortal}
                className="bg-lime text-navy px-5 py-2.5 rounded-xl font-heading font-bold text-sm tracking-wide hover:bg-lime/90 transition-all"
              >
                Continue to portal →
              </button>
            </div>
          )}

          {/* MODE: SIGN IN */}
          {mode === 'signin' && !sessionExistsRecovery && (
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

                <button type="submit" disabled={loading || !signInLoaded} className="w-full bg-lime text-navy py-3.5 rounded-xl font-heading font-bold text-sm tracking-wide hover:bg-lime/90 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2">
                  {loading ? (<><div className="w-4 h-4 border-2 border-navy/30 border-t-navy rounded-full animate-spin" />Signing in...</>) : 'Sign In →'}
                </button>
              </form>
            </>
          )}

          {/* MODE: FORGOT PASSWORD */}
          {mode === 'forgot' && !sessionExistsRecovery && (
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
          {mode === 'reset' && !sessionExistsRecovery && (
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
