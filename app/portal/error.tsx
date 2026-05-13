'use client'

import { useEffect } from 'react'
import PortalErrorState from '@/components/PortalErrorState'

// Next.js App Router error boundary for the /portal segment and below.
// Catches any uncaught exception thrown during rendering or in client
// effects in this segment. API failures that come back as graceful JSON
// responses do NOT land here — they're handled per-page with the same
// PortalErrorState component. This is the backstop for everything else.
export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[portal/error.tsx]', new Date().toISOString(), error)
  }, [error])

  return (
    <div className="py-12 px-4">
      <PortalErrorState
        message="We couldn't load this section right now. Please try again in a moment."
        onRetry={reset}
      />
    </div>
  )
}
