'use client'

// Notification center bell (Session 9, Part 2). Self-contained: takes no
// props, the shell owner drops <NotificationBell/> into the top bar. Fetches
// GET /api/portal/admin/notifications on mount and every 60s, shows an
// unread count badge, and opens a dropdown (desktop) / full-width sheet
// (mobile). Each item links to its href and marks itself read on click.
// Motion-safe: transitions only when the viewer allows motion.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell, Check, Settings, X } from 'lucide-react'

interface Item {
  id: string
  dedupKey: string
  category: string
  title: string
  body: string
  href: string
  createdAt: string
  read: boolean
}

interface CategoryMeta {
  key: string
  label: string
  description: string
}

interface Payload {
  ok: boolean
  configured: boolean
  unread: number
  items: Item[]
  categories: CategoryMeta[]
}

function relativeTime(iso: string): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const secs = Math.round((Date.now() - then) / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-CA')
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [payload, setPayload] = useState<Payload | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const rootRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/portal/admin/notifications', { cache: 'no-store' })
      if (!res.ok) {
        setError(true)
        return
      }
      const data = (await res.json()) as Payload
      setPayload(data)
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [load])

  // Close the desktop dropdown on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const post = useCallback(async (body: Record<string, unknown>) => {
    try {
      await fetch('/api/portal/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch {
      /* best effort; the next poll reconciles */
    }
  }, [])

  const markRead = useCallback(
    (id: string) => {
      setPayload(p =>
        p
          ? {
              ...p,
              items: p.items.map(i => (i.id === id ? { ...i, read: true } : i)),
              unread: Math.max(0, p.unread - (p.items.find(i => i.id === id && !i.read) ? 1 : 0)),
            }
          : p,
      )
      post({ action: 'read', id })
    },
    [post],
  )

  const markAll = useCallback(() => {
    setPayload(p => (p ? { ...p, items: p.items.map(i => ({ ...i, read: true })), unread: 0 } : p))
    post({ action: 'read_all' })
  }, [post])

  const unread = payload?.unread ?? 0
  const items = payload?.items ?? []
  const categories = payload?.categories ?? []
  const catLabel = (key: string) => categories.find(c => c.key === key)?.label ?? key

  // Group items by category, preserving the categories order.
  const groups = categories
    .map(c => ({ meta: c, rows: items.filter(i => i.category === c.key) }))
    .filter(g => g.rows.length > 0)

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white motion-safe:transition-colors"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[0.65rem] font-bold leading-4 text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Mobile scrim */}
          <div
            className="fixed inset-0 z-40 bg-navy/40 sm:hidden"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-label="Notifications"
            className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] rounded-t-2xl bg-white shadow-2xl sm:absolute sm:inset-auto sm:right-0 sm:top-11 sm:bottom-auto sm:w-96 sm:max-h-[70vh] sm:rounded-xl"
          >
            <div className="flex items-center justify-between border-b border-navy/10 px-4 py-3">
              <h2 className="font-heading text-sm font-bold text-navy">Notifications</h2>
              <div className="flex items-center gap-1">
                {items.some(i => !i.read) && (
                  <button
                    type="button"
                    onClick={markAll}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-body text-navy/70 hover:bg-navy/5 hover:text-navy"
                  >
                    <Check className="h-3.5 w-3.5" /> Mark all read
                  </button>
                )}
                <Link
                  href="/portal/admin/settings#notifications"
                  aria-label="Notification settings"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-navy/60 hover:bg-navy/5 hover:text-navy"
                >
                  <Settings className="h-4 w-4" />
                </Link>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-navy/60 hover:bg-navy/5 hover:text-navy sm:hidden"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="max-h-[calc(80vh-3rem)] overflow-y-auto sm:max-h-[calc(70vh-3rem)]">
              {error ? (
                <div className="px-4 py-8 text-center">
                  <p className="font-body text-sm text-navy/70">
                    Could not load notifications.
                  </p>
                  <button
                    type="button"
                    onClick={load}
                    className="mt-2 rounded-md bg-navy px-3 py-1.5 text-xs font-body text-white hover:bg-navy/90"
                  >
                    Try again
                  </button>
                </div>
              ) : loading && !payload ? (
                <div className="px-4 py-8 text-center font-body text-sm text-navy/50">Loading…</div>
              ) : groups.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <p className="font-body text-sm text-navy/70">You&rsquo;re all caught up.</p>
                </div>
              ) : (
                groups.map(g => (
                  <div key={g.meta.key}>
                    <p className="sticky top-0 bg-navy/[0.03] px-4 py-1.5 font-body text-[0.7rem] font-semibold uppercase tracking-wide text-navy/50">
                      {g.meta.label}
                    </p>
                    <ul>
                      {g.rows.map(item => (
                        <li key={item.id} className="border-b border-navy/5 last:border-b-0">
                          <Link
                            href={item.href}
                            onClick={() => {
                              markRead(item.id)
                              setOpen(false)
                            }}
                            className="block px-4 py-3 hover:bg-navy/[0.03]"
                          >
                            <div className="flex items-start gap-2">
                              <span
                                aria-hidden
                                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                                  item.read ? 'bg-transparent' : 'bg-lime'
                                }`}
                              />
                              <div className="min-w-0 flex-1">
                                <p
                                  className={`font-body text-sm ${
                                    item.read ? 'text-navy/70' : 'font-semibold text-navy'
                                  }`}
                                >
                                  {item.title}
                                </p>
                                {item.body && (
                                  <p className="mt-0.5 font-body text-xs text-navy/60">{item.body}</p>
                                )}
                                <p className="mt-1 font-body text-[0.7rem] text-navy/40">
                                  {relativeTime(item.createdAt) || catLabel(item.category)}
                                </p>
                              </div>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
              {payload && payload.configured === false && !error && (
                <p className="px-4 py-3 font-body text-[0.7rem] text-navy/40">
                  The notification store is not connected yet. Signals will appear once it is
                  configured.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
