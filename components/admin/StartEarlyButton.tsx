'use client'

// "Start underwriting early" (Phase B1): a two-tap workbench room create
// for a file still below Submitted. Arm, then confirm within the window —
// the house confirm pattern. Admin only (underwriting.provision); the
// server enforces, this button merely renders for those who hold it.

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

const ARM_WINDOW_MS = 4000

export default function StartEarlyButton({ zohoId }: { zohoId: string }) {
  const router = useRouter()
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const armedAt = useRef(0)

  const onClick = async () => {
    if (busy) return
    setError(null)
    if (!armed || Date.now() - armedAt.current > ARM_WINDOW_MS) {
      setArmed(true)
      armedAt.current = Date.now()
      setTimeout(() => setArmed(false), ARM_WINDOW_MS)
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/portal/admin/underwriting/sweep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zohoId }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? 'The room could not be created. Try again.')
      } else {
        router.refresh()
      }
    } catch {
      setError('Network problem. Try again.')
    } finally {
      setBusy(false)
      setArmed(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className={`text-[13px] font-ui font-semibold underline decoration-2 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-navy ${
          armed ? 'text-caution decoration-caution' : 'text-ink decoration-hairline hover:decoration-ink-navy'
        } ${busy ? 'opacity-50' : ''}`}
      >
        {busy ? 'Creating room…' : armed ? 'Tap again to confirm' : 'Start underwriting early'}
      </button>
      {error && <span className="text-xs font-ui text-danger">{error}</span>}
    </span>
  )
}
