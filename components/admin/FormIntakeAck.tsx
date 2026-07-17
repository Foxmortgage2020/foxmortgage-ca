'use client'

// Triage control for unacknowledged zoho_failed form submissions on the
// Status page. Acknowledge marks a row as triaged (who and when recorded
// on the row); it never hides fresh failures because the panel counts
// only unacknowledged rows.

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { FormIntakeFailureRow } from '@/lib/status'

function fmtWhen(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('en-CA', {
    timeZone: 'America/Toronto',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function FormIntakeAck({ failures }: { failures: FormIntakeFailureRow[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [done, setDone] = useState<Record<string, boolean>>({})

  const acknowledge = async (id: string) => {
    setBusy(b => ({ ...b, [id]: true }))
    setErrors(e => ({ ...e, [id]: '' }))
    try {
      const res = await fetch('/api/portal/admin/status/form-intake/ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const json = await res.json().catch(() => null)
      if (res.ok && json?.ok) {
        setDone(d => ({ ...d, [id]: true }))
        router.refresh()
      } else {
        setErrors(e => ({ ...e, [id]: json?.message ?? `Failed (HTTP ${res.status}).` }))
      }
    } catch {
      setErrors(e => ({ ...e, [id]: 'Could not reach the server. Retry.' }))
    } finally {
      setBusy(b => ({ ...b, [id]: false }))
    }
  }

  if (failures.length === 0) return null

  return (
    <div className="pt-2 border-t border-cool-100 mt-2 space-y-2">
      <p className="text-cool-500 text-xs">
        Unacknowledged failures (rows captured, Zoho lead missing). Acknowledge once triaged;
        who and when are recorded on the row.
      </p>
      {failures.map(f => (
        <div key={f.id} className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-navy font-ui">
              {f.source} at {fmtWhen(f.createdAt)}
            </p>
            {f.errorDetail && (
              <p className="text-[11px] text-cool-400 truncate">{f.errorDetail}</p>
            )}
            {errors[f.id] && <p className="text-[11px] text-red-600">{errors[f.id]}</p>}
          </div>
          <button
            onClick={() => acknowledge(f.id)}
            disabled={Boolean(busy[f.id]) || Boolean(done[f.id])}
            className="shrink-0 min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold font-ui bg-white border border-cool-300 text-navy hover:bg-cool-50 disabled:opacity-50"
          >
            {done[f.id] ? 'Acknowledged' : busy[f.id] ? 'Working…' : 'Acknowledge'}
          </button>
        </div>
      ))}
    </div>
  )
}
