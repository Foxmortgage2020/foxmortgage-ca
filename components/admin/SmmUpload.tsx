'use client'

// Uploads the Strategic Mortgage Monitoring CSV. Persist-first on the server:
// raw rows land in FOXCA before parsing. Shows the batch summary (counts,
// collapse, placeholders, parse failures, unmapped lenders, the sign-check
// result) and reloads the board on success.

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

interface Summary {
  rawRows: number
  mortgages: number
  collapsed: number
  placeholders: number
  parseFailures: { householdId: string; fileRef: string; reasons: string[] }[]
  unmappedLenders: string[]
  sign: { ok: boolean; violations: { householdId: string; reason: string }[] }
}

export default function SmmUpload() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)

  async function onFile(file: File) {
    setBusy(true)
    setError(null)
    setSummary(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/portal/admin/opportunities/upload', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.message ?? 'The upload did not process.')
      } else {
        setSummary(data.summary as Summary)
        router.refresh()
      }
    } catch {
      setError('Network error; the upload did not process.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-heading font-bold text-navy text-base">Upload the monitoring export</h2>
          <p className="text-xs font-body text-gray-500 mt-0.5">
            The monthly CSV. Every raw row is captured before parsing; a new upload supersedes the
            prior month&apos;s analysis and nothing is deleted.
          </p>
        </div>
        <label className="shrink-0">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            disabled={busy}
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) void onFile(f)
            }}
          />
          <span className={`inline-flex items-center rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white cursor-pointer ${busy ? 'opacity-60' : 'hover:bg-navy/90'}`}>
            {busy ? 'Processing…' : 'Choose CSV'}
          </span>
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-red-600 font-body">{error}</p>}

      {summary && (
        <div className="mt-3 border-t border-gray-100 pt-3 text-xs font-body text-gray-600 space-y-1.5">
          <p className="text-navy font-semibold">
            Captured {summary.rawRows} raw rows → {summary.mortgages} mortgages ({summary.collapsed} co-borrower
            rows collapsed), {summary.placeholders} placeholder.
          </p>
          {!summary.sign.ok && (
            <p className="text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
              Sign-convention check tripped on {summary.sign.violations.length} row
              {summary.sign.violations.length === 1 ? '' : 's'} (a low rate showing large positive savings). Review
              before trusting the recommendations.
            </p>
          )}
          {summary.parseFailures.length > 0 && (
            <div className="text-amber-800">
              <p className="font-semibold">{summary.parseFailures.length} parse failure{summary.parseFailures.length === 1 ? '' : 's'}:</p>
              {summary.parseFailures.slice(0, 5).map(f => (
                <p key={f.householdId} className="pl-2">
                  {f.fileRef || f.householdId}: {f.reasons.join('; ')}
                </p>
              ))}
            </div>
          )}
          {summary.unmappedLenders.length > 0 && (
            <p className="text-amber-800">
              Unmapped lender strings (add to config/smm-lender-aliases.ts): {summary.unmappedLenders.join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
