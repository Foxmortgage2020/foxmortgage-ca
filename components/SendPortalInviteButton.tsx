'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Loader2, CheckCircle2 } from 'lucide-react'

interface SendPortalInviteButtonProps {
  partnerId: string
  /** Initial label — "Send Portal Invite" for first issue, "Resend Portal Invite" otherwise. */
  label: string
}

// Sibling of SendOnboardingLinkButton (which is investor-only). Posts
// to /api/admin/partners/{id}/send-portal-invite — the partner flow
// that handles FP / Realtor / Lawyer. The button does not know the
// partner's kind; the server resolves that from Zoho's Partner_Type
// and picks the right metadata key / portal URL.
export default function SendPortalInviteButton({
  partnerId,
  label,
}: SendPortalInviteButtonProps) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const handleClick = async () => {
    setBusy(true)
    setError(null)
    setSentTo(null)
    try {
      const res = await fetch(`/api/admin/partners/${partnerId}/send-portal-invite`, {
        method: 'POST',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || data.message || 'Send failed. Please try again.')
        return
      }
      setSentTo(data.email ?? null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed.')
    } finally {
      setBusy(false)
    }
  }

  if (sentTo) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2 bg-lime/20 text-navy font-heading font-bold text-sm px-4 py-2 rounded-lg">
          <CheckCircle2 className="w-4 h-4" />
          Portal invite sent to {sentTo}
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
