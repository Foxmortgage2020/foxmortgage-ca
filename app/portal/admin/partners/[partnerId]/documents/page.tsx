import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getPortalContext } from '@/lib/auth'
import { getPartner, getPartnerDocuments } from '@/lib/zoho'
import DocumentUploader from '@/components/DocumentUploader'

// Tell Next.js not to attempt SSG on this dynamic admin page. We hit
// Zoho server-side on every load and the data is per-partner; no
// caching benefit, just confusing build-time errors if we let it try.
export const dynamic = 'force-dynamic'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

function statusBadge(status: string | null): { label: string; cls: string } {
  switch (status) {
    case 'Approved':  return { label: 'Approved',  cls: 'bg-lime/20 text-lime-dark' }
    case 'Submitted': return { label: 'Submitted', cls: 'bg-gray-100 text-gray-700' }
    case 'Pending':   return { label: 'Pending',   cls: 'bg-yellow-100 text-yellow-700' }
    case 'Rejected':  return { label: 'Rejected',  cls: 'bg-red-100 text-red-700' }
    case 'Expired':   return { label: 'Expired',   cls: 'bg-amber-100 text-amber-700' }
    default:          return { label: status ?? '—', cls: 'bg-gray-100 text-gray-600' }
  }
}

export default async function AdminPartnerDocumentsPage({
  params,
}: {
  params: { partnerId: string }
}) {
  // Server-side admin gate. A non-admin hitting this URL gets bounced
  // straight to /portal — never sees the form or partner data.
  const ctx = await getPortalContext()
  if (!ctx || !ctx.actor.roles.includes('admin')) {
    redirect('/portal')
  }

  const { partnerId } = params
  const partner = await getPartner(partnerId)
  if (!partner) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <h1 className="font-heading text-navy text-xl font-bold mb-2">Partner Not Found</h1>
        <p className="font-body text-gray-500">No Partners record with ID {partnerId}.</p>
        <Link href="/portal/admin" className="text-lime font-semibold text-sm hover:underline mt-4 inline-block">
          ← Back to Admin
        </Link>
      </div>
    )
  }

  // Admins see every status — Pending and Rejected included.
  const documents = await getPartnerDocuments(partnerId)

  return (
    <div className="max-w-4xl mx-auto">
      <Link
        href="/portal/admin"
        className="inline-flex items-center gap-1.5 text-gray-400 text-sm font-body hover:text-navy mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Admin
      </Link>

      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-navy">Documents</h1>
        <p className="font-body text-gray-500 text-sm mt-0.5">
          {partner.name ?? 'Partner'} · {partner.partnerType ?? '—'} ·{' '}
          <span className="font-mono text-xs">{partnerId}</span>
        </p>
      </div>

      <div className="mb-6">
        <DocumentUploader partnerId={partnerId} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-heading text-lg font-bold text-navy mb-4">
          Documents on file
          <span className="ml-2 text-gray-400 text-sm font-body font-normal">{documents.length}</span>
        </h2>

        {documents.length === 0 ? (
          <p className="font-body text-gray-500 text-sm py-6 text-center">
            No documents yet. Use the form above to upload the first one.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400 text-xs uppercase tracking-wider text-left">
                  <th className="pb-3 font-medium">Name</th>
                  <th className="pb-3 font-medium">Type</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Uploaded</th>
                  <th className="pb-3 font-medium">Expires</th>
                  <th className="pb-3 font-medium">Download</th>
                </tr>
              </thead>
              <tbody className="font-body">
                {documents.map((doc) => {
                  const badge = statusBadge(doc.documentStatus)
                  return (
                    <tr key={doc.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-3 text-navy font-medium">{doc.name}</td>
                      <td className="py-3 text-gray-700">{doc.documentType ?? '—'}</td>
                      <td className="py-3">
                        <span className={`${badge.cls} text-xs font-semibold px-2 py-0.5 rounded-full`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-3 text-gray-500">{formatDate(doc.uploadedDate)}</td>
                      <td className="py-3 text-gray-500">{formatDate(doc.expiryDate)}</td>
                      <td className="py-3">
                        <a
                          href={`/api/portal/investor/documents/${doc.id}`}
                          className="text-lime font-semibold text-sm hover:underline"
                        >
                          Download
                        </a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
