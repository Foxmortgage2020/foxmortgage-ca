'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserCog, Loader2 } from 'lucide-react'

interface ImpersonateButtonProps {
  partnerId: string
  role: 'investor' | 'fp'
  /** Default redirect lands the admin on the impersonated user's home. */
  redirectTo?: string
}

// Calls the existing /api/admin/impersonate POST handler with the
// partner id + role and redirects to the impersonated user's home on
// success. Surfaces server errors inline (rare — the impersonate route
// is well-defended) rather than crashing the page.
export default function ImpersonateButton({ partnerId, role, redirectTo }: ImpersonateButtonProps) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClick = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, partnerId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.message || data.error || 'Impersonation failed.')
        return
      }
      const target = redirectTo ?? (role === 'investor' ? '/portal/investor/dashboard' : '/portal/fp/dashboard')
      router.push(target)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impersonation failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={busy}
        className="bg-lime text-navy font-heading font-bold text-sm px-4 py-2 rounded-lg hover:bg-lime-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCog className="w-4 h-4" />}
        {busy ? 'Switching…' : 'Impersonate'}
      </button>
      {error && (
        <p className="text-red-600 text-xs font-body max-w-xs text-right">{error}</p>
      )}
    </div>
  )
}
