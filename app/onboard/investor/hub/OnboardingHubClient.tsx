'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useClerk } from '@clerk/nextjs'
import { Check, Loader2, LogOut } from 'lucide-react'
import type { OnboardingStep } from '@/lib/onboarding'

interface OnboardingHubClientProps {
  firstName: string
  fullName: string
  partnerId: string
  steps: OnboardingStep[]
  currentStepIndex: number
  lastOnboardingStep: string | null
}

// 8-step shell. Each step renders a placeholder panel with a
// "Mark Complete (placeholder)" button that PATCHes Last_Onboarding_Step
// in Zoho and advances the sidebar. Real form sections ship in
// Commits 2-4 and replace each panel one at a time.
//
// Terminal state: when Last_Onboarding_Step === "Submitted for Review"
// (the completionValue of step 8), the main panel swaps to a
// confirmation card and the sidebar marks all 8 steps complete. This
// state is derived from `lastStep`, so it persists across sign-outs
// — server-side page.tsx reads partner.lastOnboardingStep from Zoho
// on every load and passes it through to this component.
export default function OnboardingHubClient({
  firstName,
  fullName,
  partnerId: _partnerId, // reserved for future use; the API derives partner id from Clerk session
  steps,
  currentStepIndex: initialStepIndex,
  lastOnboardingStep: initialLastStep,
}: OnboardingHubClientProps) {
  const router = useRouter()
  const { signOut } = useClerk()
  const [currentIndex, setCurrentIndex] = useState(initialStepIndex)
  const [lastStep, setLastStep] = useState<string | null>(initialLastStep)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Terminal "Submitted for Review" state. Drives the confirmation
  // panel and the all-complete sidebar treatment. Sourced from
  // lastStep (not currentIndex) so it survives sign-out → sign-in
  // round-trips: page.tsx re-derives both on each load from Zoho.
  const submitted = lastStep === 'Submitted for Review'

  // When submitted, every step in the sidebar shows as complete
  // (including step 8). Otherwise the standard "all idx < current
  // are complete" rule applies.
  const isStepCompleteByIndex = (idx: number): boolean =>
    submitted || idx < currentIndex
  const activeStep = steps[currentIndex]

  const handleMarkComplete = async () => {
    setBusy(true)
    setError(null)
    try {
      const completionValue = steps[currentIndex].completionValue
      const res = await fetch('/api/onboard/advance-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completionValue }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || "Couldn't save your progress. Please try again.")
        return
      }
      setLastStep(completionValue)
      // Advance UI; clamp to last step so the final "Submit for Review"
      // stays on its own panel.
      setCurrentIndex(prev => Math.min(prev + 1, steps.length - 1))
      // Refresh server state so a hard reload reflects the new step.
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your progress.")
    } finally {
      setBusy(false)
    }
  }

  const handleSignOut = async () => {
    await signOut(() => router.push('/portal/sign-in'))
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-navy text-white px-6 py-4 flex items-center justify-between">
        <p className="font-heading text-lime text-base font-bold tracking-wider">
          FOX MORTGAGE
        </p>
        <div className="flex items-center gap-4 text-sm font-body">
          <span className="text-gray-300">{fullName}</span>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 text-gray-300 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex flex-col lg:flex-row max-w-6xl mx-auto w-full p-6 gap-6">
        {/* Sidebar */}
        <aside className="lg:w-64 shrink-0">
          <p className="font-heading text-navy text-sm font-bold mb-3 tracking-wider uppercase">
            Welcome, {firstName}
          </p>
          <nav className="bg-white rounded-xl border border-gray-200 p-2">
            <ol className="space-y-1">
              {steps.map((step, idx) => {
                const complete = isStepCompleteByIndex(idx)
                // Suppress the active highlight when submitted — the
                // user is in a terminal state, all 8 read as complete.
                const active = !submitted && idx === currentIndex
                return (
                  <li key={step.completionValue}>
                    <button
                      onClick={() => setCurrentIndex(idx)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-body text-left transition-colors ${
                        active
                          ? 'bg-lime text-navy font-semibold'
                          : complete
                          ? 'text-gray-700 hover:bg-gray-50'
                          : 'text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                          complete
                            ? 'bg-lime-dark text-white'
                            : active
                            ? 'bg-navy text-lime'
                            : 'bg-gray-200 text-gray-500'
                        }`}
                      >
                        {complete ? <Check className="w-3 h-3" /> : idx + 1}
                      </span>
                      {step.label}
                    </button>
                  </li>
                )
              })}
            </ol>
          </nav>
        </aside>

        {/* Main panel */}
        <main className="flex-1">
          <div className="bg-white rounded-xl border border-gray-200 p-8">
            {submitted ? (
              // Terminal confirmation card — no buttons. The user is
              // done. Sign-out lives in the header for anyone who wants
              // to leave; clicking sidebar steps is silently a no-op
              // (the panel keeps rendering this confirmation).
              //
              // Out of scope here (per spec): the investor confirmation
              // email and the "new application in review queue" notification
              // to Mike — both ship with the transactional email suite
              // in a later commit.
              <>
                <h1 className="font-heading text-2xl font-bold text-navy mb-3">
                  Thank you, {firstName}.
                </h1>
                <p className="font-body text-gray-700 text-base leading-relaxed mb-4">
                  Your application has been submitted for review. Mike will review your
                  application and follow up within 1-2 business days to discuss next steps.
                </p>
                <p className="font-body text-gray-600 text-sm leading-relaxed">
                  You can sign out anytime. If you need to update anything, just reply to
                  your welcome email or reach out at{' '}
                  <a
                    href="mailto:mfox@foxmortgage.ca"
                    className="text-lime hover:underline font-semibold"
                  >
                    mfox@foxmortgage.ca
                  </a>
                  .
                </p>
              </>
            ) : (
              <>
                <h1 className="font-heading text-2xl font-bold text-navy mb-3">
                  {activeStep.label}
                </h1>
                <p className="font-body text-gray-600 text-base leading-relaxed mb-6">
                  Coming soon. Form for this step ships in a future commit.
                </p>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 font-body text-sm text-red-700 mb-4">
                    {error}
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleMarkComplete}
                    disabled={busy}
                    className="bg-lime text-navy font-heading font-bold text-sm px-5 py-2.5 rounded-lg hover:bg-lime-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                    {busy ? 'Saving…' : 'Mark Complete (placeholder)'}
                  </button>
                  {lastStep && (
                    <span className="text-gray-400 text-xs font-body">
                      Last saved: {lastStep}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 px-6 py-4">
        <p className="text-gray-500 text-xs font-body text-center">
          Need help? Email{' '}
          <a href="mailto:mfox@foxmortgage.ca" className="text-lime hover:underline font-semibold">
            mfox@foxmortgage.ca
          </a>
        </p>
      </footer>
    </div>
  )
}
