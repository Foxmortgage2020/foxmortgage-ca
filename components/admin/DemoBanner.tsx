'use client'

// Persistent, unmissable banner shown across the whole command center while
// demo mode is on. High-contrast lime-on-navy so it reads at a glance and
// can never be mistaken for a real screen. Rendered as the first row of the
// admin shell's sticky top chrome (the shell provides the stickiness, so the
// banner stacks above the nav bar and stays visible on scroll without two
// sticky elements fighting for top:0), with an always-available exit.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'

export default function DemoBanner({ active }: { active: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  if (!active) return null

  async function exit() {
    if (busy) return
    setBusy(true)
    try {
      await fetch('/api/portal/admin/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'exit' }),
      })
    } catch {
      // Even if the network hiccups, refresh so the server re-reads the
      // cookie state; the banner reflects the truth on the next render.
    } finally {
      setBusy(false)
      router.refresh()
    }
  }

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 bg-caution px-4 py-2 text-white shadow-md"
    >
      <div className="flex items-center gap-2 text-sm font-heading font-bold">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Demo mode · fictional data — nothing here is a real client</span>
      </div>
      <button
        type="button"
        onClick={exit}
        disabled={busy}
        className="shrink-0 rounded-md bg-navy px-3 py-1 text-xs font-heading font-bold text-white transition-colors hover:bg-navy/90 disabled:opacity-60"
      >
        {busy ? 'Exiting…' : 'Exit demo'}
      </button>
    </div>
  )
}
