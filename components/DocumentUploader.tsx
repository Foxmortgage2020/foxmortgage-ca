'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Loader2 } from 'lucide-react'

interface DocumentUploaderProps {
  partnerId: string
}

// Picklist values must match the actual_value list set in Zoho.
// Update both this list and the ALLOWED_DOCUMENT_TYPES set in the
// upload route if these ever change.
const DOCUMENT_TYPES = [
  'KYC',
  'AML Declaration',
  'Accredited Investor',
  'Risk Disclosure',
  'Source of Funds',
  'Investor Agreement',
  'Void Cheque',
  'Government ID Front',
  'Government ID Back',
  'Proof of Address',
  'Subscription Agreement',
  'T5 Slip',
  'Mortgage Statement',
  'Compliance Package',
  'Other',
]

const MAX_FILE_MB = 10
const ACCEPT_MIME = 'application/pdf,image/jpeg,image/png'

export default function DocumentUploader({ partnerId }: DocumentUploaderProps) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [documentType, setDocumentType] = useState<string>('')
  const [expiryDate, setExpiryDate] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!file) { setError('Please choose a file.'); return }
    if (!documentType) { setError('Please choose a document type.'); return }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`File too large. Max ${MAX_FILE_MB} MB.`)
      return
    }

    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('documentType', documentType)
      if (expiryDate) form.append('expiryDate', expiryDate)
      if (notes) form.append('notes', notes)

      const res = await fetch(`/api/admin/partners/${partnerId}/documents`, {
        method: 'POST',
        body: form,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Upload failed. Please try again.')
        return
      }
      // Reset + reload server data so the new doc appears in the list.
      setFile(null)
      setDocumentType('')
      setExpiryDate('')
      setNotes('')
      // <input type="file"> doesn't reset by clearing state — find the
      // form and reset it.
      ;(e.target as HTMLFormElement).reset()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="font-heading text-lg font-bold text-navy mb-1">Upload Document</h2>
      <p className="text-gray-500 text-sm font-body mb-4">
        PDF, JPG, or PNG. Max {MAX_FILE_MB} MB. Status defaults to Approved (admin uploads are presumed reviewed).
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="text-gray-500 text-xs font-body block mb-1">File</label>
          <input
            type="file"
            accept={ACCEPT_MIME}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={uploading}
            className="block w-full text-sm font-body text-navy file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-lime file:text-navy file:font-heading file:font-bold hover:file:bg-lime-dark cursor-pointer"
          />
        </div>

        <div>
          <label className="text-gray-500 text-xs font-body block mb-1">Document Type</label>
          <select
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            disabled={uploading}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 font-body text-sm text-navy focus:outline-none focus:ring-2 focus:ring-lime/40"
          >
            <option value="">Choose one…</option>
            {DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-gray-500 text-xs font-body block mb-1">Expiry Date (optional)</label>
          <input
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            disabled={uploading}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 font-body text-sm text-navy focus:outline-none focus:ring-2 focus:ring-lime/40"
          />
        </div>

        <div className="md:col-span-2">
          <label className="text-gray-500 text-xs font-body block mb-1">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={uploading}
            maxLength={2000}
            rows={3}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 font-body text-sm text-navy focus:outline-none focus:ring-2 focus:ring-lime/40"
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 font-body text-sm text-red-700 mt-4">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={uploading}
        className="mt-4 bg-lime text-navy font-heading font-bold text-sm px-5 py-2.5 rounded-lg hover:bg-lime-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {uploading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Uploading…
          </>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            Upload
          </>
        )}
      </button>
    </form>
  )
}
