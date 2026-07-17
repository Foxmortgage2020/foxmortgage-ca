import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requirePermission } from '@/lib/authz'
import { getPartner, getPartnerDocuments } from '@/lib/zoho'
import DocumentUploader from '@/components/DocumentUploader'
import StatusChip, { type ChipTone } from '@/components/admin/ds/StatusChip'
import { CELL_REF } from '@/components/admin/ds/table'

// Tell Next.js not to attempt SSG on this dynamic admin page. We hit
// Zoho server-side on every load and the data is per-partner; no
// caching benefit, just confusing build-time errors if we let it try.
export const dynamic = 'force-dynamic'

// Same date-only timezone fix as the partner detail page — parse
// YYYY-MM-DD strings as local components so they don't render one day
// earlier in Eastern timezone.
function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  const d = dateOnlyMatch
    ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
    : new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

function statusBadge(status: string | null): { label: string; tone: ChipTone } {
  switch (status) {
    case 'Approved':  return { label: 'Approved',  tone: 'green' }
    case 'Submitted': return { label: 'Submitted', tone: 'gray' }
    case 'Pending':   return { label: 'Pending',   tone: 'amber' }
    case 'Rejected':  return { label: 'Rejected',  tone: 'red' }
    case 'Expired':   return { label: 'Expired',   tone: 'amber' }
    default:          return { label: status ?? '—', tone: 'gray' }
  }
}

export default async function AdminPartnerDocumentsPage({
  params,
}: {
  params: { partnerId: string }
}) {
  // Server-side admin gate. A non-admin hitting this URL gets bounced
  // straight to /portal — never sees the form or partner data.
  // Session 8: permission key, not a role literal.
  await requirePermission('partners.provision')

  const { partnerId } = params
  const partner = await getPartner(partnerId)
  if (!partner) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <h1 className="font-heading text-navy text-xl font-bold mb-2">Partner Not Found</h1>
        <p className="font-ui text-cool-500">No Partners record with ID {partnerId}.</p>
        <Link href="/portal/admin" className="text-navy font-semibold text-sm underline decoration-cool-300 hover:decoration-navy mt-4 inline-block">
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
        className="inline-flex items-center gap-1.5 text-cool-400 text-sm font-ui hover:text-navy mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Admin
      </Link>

      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-navy">Documents</h1>
        <p className="font-ui text-cool-500 text-sm mt-0.5">
          {partner.name ?? 'Partner'} · {partner.partnerType ?? '—'} ·{' '}
          <span className={CELL_REF}>{partnerId}</span>
        </p>
      </div>

      <div className="mb-6">
        <DocumentUploader partnerId={partnerId} />
      </div>

      <div className="bg-white rounded-[9px] border border-cool-200 p-6">
        <h2 className="font-heading text-lg font-bold text-navy mb-4">
          Documents on file
          <span className="ml-2 text-cool-400 text-sm font-ui font-normal">{documents.length}</span>
        </h2>

        {documents.length === 0 ? (
          <p className="font-ui text-cool-500 text-sm py-6 text-center">
            No documents yet. Use the form above to upload the first one.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="font-heading text-[11px] font-semibold tracking-[0.05em] text-cool-600 text-left">
                  <th className="pb-3">Name</th>
                  <th className="pb-3">Type</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Uploaded</th>
                  <th className="pb-3">Expires</th>
                  <th className="pb-3">Download</th>
                </tr>
              </thead>
              <tbody className="font-ui">
                {documents.map((doc) => {
                  const badge = statusBadge(doc.documentStatus)
                  return (
                    <tr key={doc.id} className="border-t border-cool-100">
                      <td className="py-3 text-navy font-medium">{doc.name}</td>
                      <td className="py-3 text-cool-700">{doc.documentType ?? '—'}</td>
                      <td className="py-3">
                        <StatusChip tone={badge.tone}>{badge.label}</StatusChip>
                      </td>
                      <td className="py-3 text-cool-500 tabular-nums">{formatDate(doc.uploadedDate)}</td>
                      <td className="py-3 text-cool-500 tabular-nums">{formatDate(doc.expiryDate)}</td>
                      <td className="py-3">
                        <a
                          href={`/api/portal/investor/documents/${doc.id}`}
                          className="text-navy font-semibold text-sm underline decoration-cool-300 hover:decoration-navy"
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
