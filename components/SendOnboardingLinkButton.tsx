'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Loader2, CheckCircle2 } from 'lucide-react'

interface SendOnboardingLinkButtonProps {
  partnerId: string
  /** Initial label — "Send Onboarding Link" for first issue, "Resend Onboarding Link" otherwise. */
  label: string
}

export default function SendOnboardingLinkButton({ partnerId, label }: SendOnboardingLinkButtonProps) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const handleClick = async () => {
    setBusy(true)
    setError(null)
    setSentTo(null)
    try {
      const res = await fetch(`/api/admin/partners/${partnerId}/send-onboarding-link`, {
        method: 'POST',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Send failed. Please try again.')
        return
      }
      setSentTo(data.email ?? null)
      // Refresh the server-rendered detail page so the button label
      // updates (Lead → Invited, button now shows "Resend").
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed.')
    } finally {
      setBusy(false)
    }
  }

  // Success toast persists until next click — gives admin time to read it.
  if (sentTo) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2 bg-lime/20 text-navy font-heading font-bold text-sm px-4 py-2 rounded-lg">
          <CheckCircle2 className="w-4 h-4" />
          Onboarding link sent to {sentTo}
        </div>
        <button
          onClick={() => setSentTo(null)}
          className="text-gray-400 text-xs hover:text-navy font-body"
        >
          Send again
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={busy}
        className="bg-lime text-navy font-heading font-bold text-sm px-4 py-2 rounded-lg hover:bg-lime-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
        {busy ? 'Sending…' : label}
      </button>
      {error && (
        <p className="text-red-600 text-xs font-body max-w-xs text-right">{error}</p>
      )}
    </div>
  )
}
