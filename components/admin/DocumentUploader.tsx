'use client'

// General borrower-document dropzone (document-pull session, 2026-07-14). The
// reading engine, the matcher, and the analysis layer all exist and sit idle
// because no borrower document could physically enter the workbench — this is
// the control that lets one in. Pick a document kind and the borrower it
// belongs to, then drop the file: it stores (source='upload'), indexes, and the
// matching condition moves toward obtained on its own. Mirrors CommitmentUploader
// (base64 + gates token + POST); the workbench does the storing and matching.

import { useRouter } from 'next/navigation'
import { useCallback, useRef, useState } from 'react'
import { GATES_TOKEN_HEADER, useGatesToken } from '@/lib/gates-token'

const ACCEPT = '.pdf,.docx,.doc,.txt'
const MAX_BYTES = 3_145_728

// The closed document-type vocabulary the matcher keys on (mirrors the
// workbench DOC_KINDS / the conditions checklist).
const DOC_KIND_OPTIONS = [
  'letter_of_employment', 'pay_stub', 't4_noa', 'void_cheque', 'fire_insurance_binder',
  'gift_letter', 'aps', 'appraisal', 'id', 'signed_commitment', 'disclosure',
  'sale_confirmation', 'mortgage_statement', 'property_tax', 'payout_statement', 'ccb',
  'product_assessment_form', 'term_portion_amendment', 'other',
] as const
const label = (s: string) => s.replace(/_/g, ' ')

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const s = String(reader.result)
      const comma = s.indexOf(',')
      resolve(comma >= 0 ? s.slice(comma + 1) : s)
    }
    reader.onerror = () => reject(new Error('file read failed'))
    reader.readAsDataURL(file)
  })
}

export default function DocumentUploader({
  dealId,
  borrowers,
}: {
  dealId: string
  borrowers: { id: string; fullName: string }[]
}) {
  const router = useRouter()
  const mintGatesToken = useGatesToken()
  const inputRef = useRef<HTMLInputElement>(null)
  const [docKind, setDocKind] = useState<string>('')
  const [borrowerId, setBorrowerId] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [dragging, setDragging] = useState(false)

  const upload = useCallback(
    async (file: File) => {
      setError('')
      setOk('')
      if (!docKind) {
        setError('Pick the document kind first.')
        return
      }
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
        const res = await fetch(`/api/portal/admin/gates/deals/${dealId}/documents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { [GATES_TOKEN_HEADER]: token } : {}) },
          body: JSON.stringify({ file_name: file.name, doc_kind: docKind, borrower_id: borrowerId || null, content_base64 }),
        })
        const json = await res.json().catch(() => null)
        if (json?.ok) {
          // The route returns a GateResult: the payload lives under json.data.
          const d = json.data ?? {}
          if (d.dupOf) {
            setOk('That document is already on this file.')
          } else {
            const moved = typeof d.presence?.updated === 'number' ? d.presence.updated : 0
            setOk(moved > 0 ? `Uploaded and indexed. ${moved} condition${moved === 1 ? '' : 's'} moved.` : 'Uploaded and indexed.')
          }
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
    [dealId, docKind, borrowerId, mintGatesToken, router],
  )

  const onPick = () => inputRef.current?.click()

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="text-xs font-semibold font-body text-navy mb-2">Upload a document</p>
      <div className="flex flex-wrap gap-2 items-end mb-2">
        <label className="text-[11px] font-body text-gray-500">
          Document kind
          <select
            value={docKind}
            onChange={e => setDocKind(e.target.value)}
            className="ml-1 block text-xs font-body border border-gray-200 rounded px-1.5 py-1"
          >
            <option value="">choose…</option>
            {DOC_KIND_OPTIONS.map(k => <option key={k} value={k}>{label(k)}</option>)}
          </select>
        </label>
        <label className="text-[11px] font-body text-gray-500">
          Borrower
          <select
            value={borrowerId}
            onChange={e => setBorrowerId(e.target.value)}
            className="ml-1 block text-xs font-body border border-gray-200 rounded px-1.5 py-1"
          >
            <option value="">General</option>
            {borrowers.map(b => <option key={b.id} value={b.id}>{b.fullName}</option>)}
          </select>
        </label>
      </div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload a document"
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
        className={`w-full cursor-pointer rounded-lg border border-dashed text-center font-body transition-colors px-3 py-3 ${
          dragging ? 'border-navy bg-navy/5' : 'border-gray-300 bg-gray-50 hover:border-navy hover:bg-navy/5'
        } ${busy ? 'pointer-events-none opacity-60' : ''}`}
      >
        <p className="font-heading font-semibold text-navy text-sm">{busy ? 'Uploading…' : 'Drop a file, or click to browse'}</p>
        <p className="mt-1 text-[11px] text-gray-400">PDF, DOCX, DOC, TXT (3 MB). It is redacted and indexed on upload.</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) void upload(f)
            e.target.value = ''
          }}
        />
      </div>
      {error && <p className="mt-2 text-xs font-body text-red-700">{error}</p>}
      {ok && <p className="mt-2 text-xs font-body text-green-700">{ok}</p>}
    </div>
  )
}
