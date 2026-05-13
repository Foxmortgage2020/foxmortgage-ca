'use client'

import { useEffect, useRef, useState } from 'react'
import { HelpCircle } from 'lucide-react'

interface KpiHelpTooltipProps {
  title: string
  body: string
  /**
   * 'light' (default) sits on white card backgrounds — muted gray icon
   * darkens to navy on hover. 'dark' sits on the navy KPI strip — muted
   * gray-300 icon lightens to white on hover. The popover content is
   * always white-on-navy-text for readability.
   */
  variant?: 'light' | 'dark'
}

export default function KpiHelpTooltip({ title, body, variant = 'light' }: KpiHelpTooltipProps) {
  const [open, setOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node
      if (popoverRef.current?.contains(target)) return
      if (buttonRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const iconClasses = variant === 'dark'
    ? 'text-gray-300 hover:text-white'
    : 'text-gray-400 hover:text-navy'

  return (
    <span className="relative inline-flex items-center">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label={`More info: ${title}`}
        className={`${iconClasses} transition-colors focus:outline-none focus:ring-2 focus:ring-lime/40 rounded-full`}
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div
          ref={popoverRef}
          className="absolute z-20 top-full left-0 mt-2 w-72 bg-white border border-gray-200 rounded-lg shadow-lg p-3"
          role="dialog"
        >
          <p className="font-heading text-navy text-sm font-semibold mb-1">{title}</p>
          <p className="text-gray-600 text-xs font-body leading-relaxed whitespace-pre-line">
            {body}
          </p>
        </div>
      )}
    </span>
  )
}
