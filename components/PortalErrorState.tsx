'use client'

import { AlertTriangle } from 'lucide-react'

interface PortalErrorStateProps {
  title?: string
  message: string
  onRetry?: () => void
  // Reserved for future telemetry — accepted but not rendered.
  code?: string
}

export default function PortalErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: PortalErrorStateProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-10 flex flex-col items-center text-center max-w-xl mx-auto">
      <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
        <AlertTriangle className="w-6 h-6 text-red-500" />
      </div>
      <h2 className="font-heading text-navy text-xl mb-2">{title}</h2>
      <p className="font-body text-gray-600 text-sm leading-relaxed mb-6 max-w-md">
        {message}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="bg-lime text-navy font-heading font-bold text-sm px-5 py-2.5 rounded-lg hover:bg-lime-dark transition-colors"
        >
          Try Again
        </button>
      )}
    </div>
  )
}
