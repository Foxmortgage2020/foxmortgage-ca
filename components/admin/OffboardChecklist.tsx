'use client'

// Offboarding checklist (Session 8): the persisted FOXCA record given a
// screen. Items toggle through the narrow function surface with
// updated_by stamped; the record itself never deletes.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Square } from 'lucide-react'
import type { OffboardChecklistItem } from '@/lib/people-store'

export default function OffboardChecklist({
  recordId,
  items,
}: {
  recordId: string
  items: OffboardChecklistItem[]
}) {
  const router = useRouter()
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [local, setLocal] = useState(items)

  const toggle = async (item: OffboardChecklistItem) => {
    setBusyKey(item.key)
    setError(null)
    const next = !item.done
    try {
      const res = await fetch('/api/portal/admin/people/offboard/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: recordId, itemKey: item.key, done: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not update the item.')
        return
      }
      setLocal(prev => prev.map(i => (i.key === item.key ? { ...i, done: next } : i)))
      router.refresh()
    } catch {
      setError('Could not update the item — network error.')
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div>
      {error && (
        <div className="mb-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm font-ui text-red-700">
          {error}
        </div>
      )}
      <ul className="space-y-3">
        {local.map(item => (
          <li
            key={item.key}
            className="bg-white border border-cool-200 rounded-xl p-4 flex items-start gap-3"
            data-testid={`offboard-item-${item.key}`}
          >
            <button
              onClick={() => toggle(item)}
              disabled={busyKey === item.key}
              className="mt-0.5 shrink-0 text-navy disabled:opacity-50"
              aria-label={item.done ? 'Mark not done' : 'Mark done'}
            >
              {busyKey === item.key ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : item.done ? (
                <Check className="w-5 h-5 text-green-600" />
              ) : (
                <Square className="w-5 h-5 text-cool-300" />
              )}
            </button>
            <div>
              <p
                className={`font-ui text-sm font-semibold ${
                  item.done ? 'text-cool-400 line-through' : 'text-navy'
                }`}
              >
                {item.label}
              </p>
              <p className="font-ui text-xs text-cool-500 mt-0.5">{item.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
