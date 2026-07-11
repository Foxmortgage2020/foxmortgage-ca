'use client'

import { useEffect, useState } from 'react'
import { Download, Share, X } from 'lucide-react'

const DISMISS_KEY = 'fox_install_dismissed_v1'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const mm =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches
  // iOS Safari exposes navigator.standalone rather than the media query.
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean })
    .standalone === true
  return Boolean(mm || iosStandalone)
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export default function InstallHint({
  variant = 'admin',
}: {
  variant?: 'admin' | 'partner'
}) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [show, setShow] = useState(false)
  const [iosHint, setIosHint] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isStandalone()) return

    let dismissed = false
    try {
      dismissed = window.localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      dismissed = false
    }
    if (dismissed) return

    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setIosHint(false)
      setShow(true)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)

    // iOS never fires beforeinstallprompt; offer the Share-sheet path instead.
    if (isIos()) {
      setIosHint(true)
      setShow(true)
    }

    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  const dismiss = () => {
    setShow(false)
    try {
      window.localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // ignore storage failures; the hint simply reappears next session.
    }
  }

  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    try {
      await deferred.userChoice
    } catch {
      // ignore
    }
    setDeferred(null)
    dismiss()
  }

  if (!show) return null

  const placement =
    variant === 'partner'
      ? 'border-lime/40 bg-white'
      : 'border-navy/10 bg-white'

  return (
    <div
      role="region"
      aria-label="Install Fox Mortgage"
      className={`flex items-center gap-3 border-b px-4 py-2.5 font-body text-sm text-navy ${placement}`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-navy text-lime">
        {iosHint ? (
          <Share className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Download className="h-4 w-4" aria-hidden="true" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-heading font-semibold leading-tight">
          Install Fox Mortgage
        </p>
        <p className="truncate text-navy/70">
          {iosHint
            ? 'Add to your home screen: tap Share, then “Add to Home Screen”.'
            : 'Add to your home screen for one-tap access.'}
        </p>
      </div>

      {!iosHint && deferred ? (
        <button
          type="button"
          onClick={install}
          className="shrink-0 rounded-md bg-lime px-3 py-1.5 font-heading text-xs font-semibold text-navy transition-colors hover:bg-lime-dark"
        >
          Install
        </button>
      ) : null}

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss install hint"
        className="shrink-0 rounded-md p-1.5 text-navy/50 transition-colors hover:bg-navy/5 hover:text-navy"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}
