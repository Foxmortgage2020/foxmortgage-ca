// Admin-only popover that opens when an admin clicks a portal pill.
// Fetches /api/admin/partners?role=<role>, lets the admin search and
// select a partner, and invokes onSelect with that partner's data.
//
// Closes on outside-click or Escape. Anchored below the clicked pill via
// the anchorEl's bounding rect. No external popover library — the few
// behaviors we need (positioning, outside-click, key handler) are short.

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Search } from 'lucide-react'

type Role = 'fp' | 'investor' | 'realtor' | 'lawyer' | 'mortgage_agent'

type Partner = {
  userId: string
  name: string
  firm: string | null
  zohoId: string
  email: string
}

type Props = {
  role: Role
  anchorEl: HTMLElement
  onClose: () => void
  onSelect: (partner: Partner) => void
}

const ROLE_LABEL: Record<Role, string> = {
  fp: 'Financial Planner',
  investor: 'investor',
  realtor: 'realtor',
  lawyer: 'lawyer',
  mortgage_agent: 'mortgage agent',
}

export default function PartnerPicker({ role, anchorEl, onClose, onSelect }: Props) {
  const [partners, setPartners] = useState<Partner[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const popoverRef = useRef<HTMLDivElement | null>(null)

  // Position the popover under the anchor pill. Recomputed once on mount and
  // when the anchor changes. Anchored absolutely to viewport, not the pill,
  // because the pill lives inside a sticky header.
  const position = useMemo(() => {
    const rect = anchorEl.getBoundingClientRect()
    return {
      top: rect.bottom + window.scrollY + 6,
      left: rect.left + window.scrollX,
    }
  }, [anchorEl])

  // Fetch partners on mount
  useEffect(() => {
    let cancelled = false
    setPartners(null)
    setError(null)
    fetch(`/api/admin/partners?role=${role}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
        return data
      })
      .then((data: { partners: Partner[] }) => {
        if (!cancelled) setPartners(data.partners ?? [])
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load partners')
      })
    return () => {
      cancelled = true
    }
  }, [role])

  // Outside-click and Escape handlers
  const handleClose = useCallback(() => onClose(), [onClose])
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null
      if (!target) return
      if (popoverRef.current?.contains(target)) return
      if (anchorEl.contains(target)) return
      handleClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [anchorEl, handleClose])

  // Filter list by query (substring match against name and firm)
  const filtered = useMemo(() => {
    if (!partners) return []
    const q = query.trim().toLowerCase()
    if (!q) return partners
    return partners.filter((p) => {
      const haystack = `${p.name} ${p.firm ?? ''}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [partners, query])

  return (
    <div
      ref={popoverRef}
      style={{ top: position.top, left: position.left }}
      className="fixed z-50 w-80 max-h-[400px] bg-white rounded-xl shadow-xl border border-gray-200 flex flex-col overflow-hidden"
    >
      {/* Search */}
      <div className="relative border-b border-gray-100 px-3 py-2">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${ROLE_LABEL[role]} partners…`}
          className="w-full pl-8 pr-2 py-1.5 text-sm font-body text-navy placeholder-gray-400 focus:outline-none"
        />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="px-4 py-4 text-sm font-body text-red-600">{error}</div>
        )}

        {!error && partners === null && (
          <div className="flex items-center justify-center gap-2 py-8 text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm font-body">Loading…</span>
          </div>
        )}

        {!error && partners !== null && filtered.length === 0 && (
          <div className="px-4 py-6 text-sm font-body text-gray-500">
            {partners.length === 0
              ? `No ${ROLE_LABEL[role]} partners found. Add one in Clerk to get started.`
              : 'No matches for your search.'}
          </div>
        )}

        {!error && filtered.length > 0 && (
          <ul className="py-1">
            {filtered.map((p) => (
              <li key={p.userId}>
                <button
                  onClick={() => onSelect(p)}
                  className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors"
                >
                  <div className="font-body text-sm font-medium text-navy truncate">
                    {p.name}
                  </div>
                  {p.firm && (
                    <div className="font-body text-xs text-gray-500 truncate mt-0.5">
                      {p.firm}
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
