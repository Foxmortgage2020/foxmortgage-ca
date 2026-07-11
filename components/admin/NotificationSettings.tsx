'use client'

// Notification preferences (Session 9, Part 2). The settings-page owner
// mounts <NotificationSettings/> under an id="notifications" section. It
// fetches the caller's visible categories + prefs from the notifications
// API and renders a per-category toggle; flipping one POSTs set_pref. This
// controls which categories BADGE in the bell — existing email flows are
// untouched.

import { useCallback, useEffect, useState } from 'react'

interface CategoryMeta {
  key: string
  label: string
  description: string
}

interface Payload {
  ok: boolean
  categories: CategoryMeta[]
  prefs: { category: string; enabled: boolean }[]
}

export default function NotificationSettings() {
  const [categories, setCategories] = useState<CategoryMeta[]>([])
  const [enabled, setEnabled] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/portal/admin/notifications', { cache: 'no-store' })
      if (!res.ok) {
        setError(true)
        return
      }
      const data = (await res.json()) as Payload
      const disabled = new Set(data.prefs.filter(p => p.enabled === false).map(p => p.category))
      const map: Record<string, boolean> = {}
      for (const c of data.categories) map[c.key] = !disabled.has(c.key)
      setCategories(data.categories)
      setEnabled(map)
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const toggle = useCallback(async (key: string, next: boolean) => {
    setEnabled(prev => ({ ...prev, [key]: next }))
    try {
      await fetch('/api/portal/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_pref', category: key, enabled: next }),
      })
    } catch {
      // Revert on failure; the value the server holds is the truth.
      setEnabled(prev => ({ ...prev, [key]: !next }))
    }
  }, [])

  return (
    <section id="notifications" className="scroll-mt-24">
      <h2 className="font-heading text-lg font-bold text-navy">Notifications</h2>
      <p className="mt-1 font-body text-sm text-navy/60">
        Choose which categories badge the bell. This controls in-portal notifications only;
        existing email flows are untouched.
      </p>

      {error ? (
        <div className="mt-4 rounded-lg border border-navy/10 bg-white p-4">
          <p className="font-body text-sm text-navy/70">Could not load notification settings.</p>
          <button
            type="button"
            onClick={load}
            className="mt-2 rounded-md bg-navy px-3 py-1.5 text-xs font-body text-white hover:bg-navy/90"
          >
            Try again
          </button>
        </div>
      ) : loading ? (
        <p className="mt-4 font-body text-sm text-navy/50">Loading…</p>
      ) : categories.length === 0 ? (
        <p className="mt-4 font-body text-sm text-navy/50">
          No notification categories are available to your role.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-navy/10 rounded-lg border border-navy/10 bg-white">
          {categories.map(c => {
            const on = enabled[c.key] !== false
            return (
              <li key={c.key} className="flex items-start justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="font-body text-sm font-semibold text-navy">{c.label}</p>
                  <p className="mt-0.5 font-body text-xs text-navy/60">{c.description}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`${on ? 'Disable' : 'Enable'} ${c.label}`}
                  onClick={() => toggle(c.key, !on)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full motion-safe:transition-colors ${
                    on ? 'bg-lime' : 'bg-navy/20'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow motion-safe:transition-transform ${
                      on ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
