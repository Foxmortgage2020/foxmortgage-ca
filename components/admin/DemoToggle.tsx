'use client'

// Settings-page control for demo mode. Three states:
//   - !available            → explanatory disabled state (env flag unset)
//   - available && !active   → two-tap "Enter demo" (house confirm pattern)
//   - available && active    → single-tap "Exit demo"
//
// Entering swaps the entire command center to fictional fixtures, so it
// takes a deliberate second tap (a 4s disarm window) exactly like the
// approvals desk's final actions.

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MonitorPlay } from 'lucide-react'

const DISARM_MS = 4000

export default function DemoToggle({
  active,
  available,
}: {
  active: boolean
  available: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [armed, setArmed] = useState(false)
  const disarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const post = useCallback(
    async (action: 'enter' | 'exit') => {
      if (busy) return
      setBusy(true)
      try {
        await fetch('/api/portal/admin/demo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        })
      } catch {
        // Fall through to refresh; the server re-reads the cookie truth.
      } finally {
        setBusy(false)
        setArmed(false)
        router.refresh()
      }
    },
    [busy, router],
  )

  if (!available) {
    return (
      <div className="rounded-lg border border-navy/15 bg-navy/[0.02] p-4">
        <div className="flex items-center gap-2 font-heading font-bold text-navy">
          <MonitorPlay className="h-4 w-4" aria-hidden="true" />
          Demo mode
        </div>
        <p className="mt-1 text-sm text-navy/60">
          Set <code className="rounded bg-navy/10 px-1 py-0.5 text-xs">DEMO_MODE_ENABLED</code> to
          use demo mode. It swaps the command center to bundled fictional data with no real reads
          or writes.
        </p>
      </div>
    )
  }

  if (active) {
    return (
      <div className="rounded-lg border border-lime/40 bg-lime/10 p-4">
        <div className="flex items-center gap-2 font-heading font-bold text-navy">
          <MonitorPlay className="h-4 w-4" aria-hidden="true" />
          Demo mode is on
        </div>
        <p className="mt-1 text-sm text-navy/70">
          Every screen shows fictional fixtures. Real data resumes the moment you exit.
        </p>
        <button
          type="button"
          onClick={() => post('exit')}
          disabled={busy}
          className="mt-3 rounded-md bg-navy px-3 py-1.5 text-sm font-heading font-bold text-lime transition-colors hover:bg-navy/90 disabled:opacity-60"
        >
          {busy ? 'Exiting…' : 'Exit demo'}
        </button>
      </div>
    )
  }

  const arm = () => {
    setArmed(true)
    if (disarmTimer.current) clearTimeout(disarmTimer.current)
    disarmTimer.current = setTimeout(() => setArmed(false), DISARM_MS)
  }

  return (
    <div className="rounded-lg border border-navy/15 bg-navy/[0.02] p-4">
      <div className="flex items-center gap-2 font-heading font-bold text-navy">
        <MonitorPlay className="h-4 w-4" aria-hidden="true" />
        Demo mode
      </div>
      <p className="mt-1 text-sm text-navy/60">
        Swaps the command center to bundled fictional data — zero real reads, zero writes. Useful
        for recruiting and walkthroughs.
      </p>
      <button
        type="button"
        onClick={() => (armed ? post('enter') : arm())}
        disabled={busy}
        className={
          armed
            ? 'mt-3 rounded-md bg-lime px-3 py-1.5 text-sm font-heading font-bold text-navy transition-colors hover:bg-lime-dark disabled:opacity-60'
            : 'mt-3 rounded-md border border-navy/25 bg-white px-3 py-1.5 text-sm font-heading font-bold text-navy transition-colors hover:bg-navy/5 disabled:opacity-60'
        }
      >
        {busy ? 'Entering…' : armed ? 'Tap again to confirm' : 'Enter demo'}
      </button>
    </div>
  )
}
