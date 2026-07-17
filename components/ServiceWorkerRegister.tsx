'use client'

// Registers the service worker (Session 9 PWA) and — B2b Task 8 — watches
// for a newly installed or waiting worker. When one is ready, a quiet toast
// offers Refresh. NEVER auto-reloads: the human presses the button. The
// detection rules are pure in lib/sw-update.ts (unit-tested); this file
// only wires them to the browser events (updatefound → statechange
// 'installed' with an existing controller, a waiting worker found at
// registration, or controllerchange on a page that had a controller).
//
// The toast fix (2026-07-17): those events only fire if something ASKS the
// browser to look. Nothing did — Next's client-side routing never triggers
// the browser's own check, so an idle tab waited up to 24 hours. We now ask
// once after registration settles, every ten minutes, and whenever the tab
// becomes visible. Asking is not reloading: the rules above still decide
// whether the toast appears, and the human still presses Refresh.

import { useEffect, useState } from 'react'
import {
  controllerChangeMeansUpdate,
  installedBehindController,
  scheduleUpdateChecks,
  updateReadyNow,
} from '@/lib/sw-update'

export default function ServiceWorkerRegister() {
  const [updateReady, setUpdateReady] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    let cancelled = false
    let stopChecks: (() => void) | null = null
    const ready = () => {
      if (!cancelled) setUpdateReady(true)
    }
    const hasController = () => Boolean(navigator.serviceWorker.controller)
    const hadControllerAtStart = hasController()

    const watch = (reg: ServiceWorkerRegistration) => {
      if (cancelled) return
      if (updateReadyNow(reg, hasController())) ready()
      reg.addEventListener('updatefound', () => {
        const incoming = reg.installing
        if (!incoming) return
        incoming.addEventListener('statechange', () => {
          if (installedBehindController(incoming.state, hasController())) ready()
        })
      })

      // Ask the browser to look: once now that registration has settled, then
      // on the interval and whenever the tab comes back into view.
      const check = () => {
        reg.update().catch(() => {
          // Offline or the check failed; the next one will do.
        })
      }
      check()
      stopChecks = scheduleUpdateChecks(check, {
        setInterval: (fn, ms) => window.setInterval(fn, ms),
        clearInterval: id => window.clearInterval(id as number),
        addVisibilityListener: fn => document.addEventListener('visibilitychange', fn),
        removeVisibilityListener: fn => document.removeEventListener('visibilitychange', fn),
        isVisible: () => document.visibilityState === 'visible',
      })
    }

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then(watch)
        .catch(() => {
          // Registration failures are non-fatal; the app works without the SW.
        })
    }

    const onControllerChange = () => {
      if (controllerChangeMeansUpdate(hadControllerAtStart)) ready()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    if (document.readyState === 'complete') {
      register()
    } else {
      window.addEventListener('load', register, { once: true })
    }
    return () => {
      cancelled = true
      stopChecks?.()
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      window.removeEventListener('load', register)
    }
  }, [])

  if (!updateReady || dismissed) return null

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-[60] flex w-[92vw] max-w-sm -translate-x-1/2 items-center gap-3 rounded-lg border border-cool-250 bg-white px-4 py-3 shadow-card"
    >
      <p className="flex-1 font-body text-sm text-navy">A new version is ready.</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-md bg-navy px-3 py-1.5 font-body text-sm font-semibold text-white hover:opacity-90"
      >
        Refresh
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="rounded px-1.5 py-1 font-body text-sm text-cool-600 hover:text-navy"
      >
        ✕
      </button>
    </div>
  )
}
