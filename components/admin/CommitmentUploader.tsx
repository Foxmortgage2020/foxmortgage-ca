'use client'

// Commitment / amendment dropzone (Phase B2 defect fix, 2026-07-14). The B2
// upload ROUTE + gate existed but no control ever rendered in the room; the
// empty states instructed "upload the commitment" with nothing to click. This
// is that control. It reads the file, base64s it, mints the gates token, and
// POSTs to the existing /api/portal/admin/commitments/[dealId]/upload route —
// extraction on the workbench mints PENDING conditions only, so nothing here
// makes a checklist.
//
// A retired synthetic/rejected document must NEVER count as "a commitment is
// present" and suppress this control; the parent computes hasRealCommitment on
// provenance and passes the right `kind` (a bare 'commitment' dropzone only
// when no real commitment exists; 'amendment' once one does).

import { useRouter } from 'next/navigation'
import { useCallback, useRef, useState } from 'react'
import { GATES_TOKEN_HEADER, useGatesToken } from '@/lib/gates-token'

const ACCEPT = '.pdf,.docx,.doc,.txt'
const MAX_BYTES = 3_145_728 // matches the route's decoded ceiling

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const s = String(reader.result)
      const comma = s.indexOf(',')
      resolve(comma >= 0 ? s.slice(comma + 1) : s) // strip the data: URL prefix
    }
    reader.onerror = () => reject(new Error('file read failed'))
    reader.readAsDataURL(file)
  })
}

export default function CommitmentUploader({
  dealId,
  kind,
  title,
  hint,
  compact = false,
}: {
  dealId: string
  kind: 'commitment' | 'amendment'
  title: string
  hint: string
  compact?: boolean
}) {
  const router = useRouter()
  const mintGatesToken = useGatesToken()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [dragging, setDragging] = useState(false)

  const upload = useCallback(
    async (file: File) => {
      setError('')
      setOk('')
      const ext = (file.name.split('.').pop() ?? '').toLowerCase()
      if (!['pdf', 'docx', 'doc', 'txt'].includes(ext)) {
        setError('Unsupported file type. Accepted: PDF, DOCX, DOC, TXT.')
        return
      }
      if (file.size > MAX_BYTES) {
        setError('3 MB limit (for a larger document, use local ingest).')
        return
      }
      setBusy(true)
      try {
        const content_base64 = await fileToBase64(file)
        const token = await mintGatesToken()
        const res = await fetch(`/api/portal/admin/commitments/${dealId}/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { [GATES_TOKEN_HEADER]: token } : {}) },
          body: JSON.stringify({ file_name: file.name, kind, content_base64 }),
        })
        const json = await res.json().catch(() => null)
        if (json?.ok) {
          const drafted = json?.extraction?.drafted
          setOk(
            typeof drafted === 'number' && drafted > 0
              ? `Uploaded. ${drafted} condition${drafted === 1 ? '' : 's'} drafted, awaiting your approval below.`
              : json?.note ?? 'Uploaded. Refreshing the file…',
          )
          router.refresh()
          return
        }
        setError(json?.message ?? `Upload failed (HTTP ${res.status}).`)
      } catch {
        setError('Could not reach the server. Check your connection and retry.')
      } finally {
        setBusy(false)
      }
    },
    [dealId, kind, mintGatesToken, router],
  )

  const onPick = () => inputRef.current?.click()

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label={title}
        onClick={onPick}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onPick()
          }
        }}
        onDragOver={e => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault()
          setDragging(false)
          const f = e.dataTransfer.files?.[0]
          if (f) void upload(f)
        }}
        className={`w-full cursor-pointer rounded-lg border border-dashed text-center font-ui transition-colors ${
          compact ? 'px-3 py-3' : 'px-4 py-6'
        } ${
          dragging
            ? 'border-navy bg-navy/5'
            : 'border-cool-300 bg-cool-50 hover:border-navy hover:bg-navy/5'
        } ${busy ? 'pointer-events-none opacity-60' : ''}`}
      >
        <p className={`font-heading font-semibold text-navy ${compact ? 'text-sm' : 'text-base'}`}>
          {busy ? 'Uploading…' : title}
        </p>
        <p className="mt-1 text-xs text-cool-500">{hint}</p>
        {!compact && <p className="mt-1 text-[11px] text-cool-500">Drag a file here, or click to browse. PDF, DOCX, DOC, TXT (3 MB).</p>}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) void upload(f)
            e.target.value = '' // allow re-picking the same file
          }}
        />
      </div>
      {error && <p className="mt-2 text-xs font-ui text-red-700">{error}</p>}
      {ok && <p className="mt-2 text-xs font-ui text-green-700">{ok}</p>}
    </div>
  )
}
