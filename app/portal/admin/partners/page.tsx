import { redirect } from 'next/navigation'
import { getPortalContext } from '@/lib/auth'
import { listAllPartners, listAllPartnerDocuments } from '@/lib/zoho'
import PartnersFilterTable from '@/components/PartnersFilterTable'

// Force dynamic rendering — we hit Zoho server-side on every load and
// the data is admin-scoped (per-org, not per-user), so SSG/ISR would
// either show stale numbers or confuse the build.
export const dynamic = 'force-dynamic'

export default async function AdminPartnersPage() {
  // Admin gate. Non-admins bounce to /portal.
  const ctx = await getPortalContext()
  if (!ctx || !ctx.actor.roles.includes('admin')) {
    redirect('/portal')
  }

  // Both calls are independently cached for 2 min (lib/cache.ts).
  // Running them in parallel saves one Zoho round-trip on cache miss.
  const [partners, allDocs] = await Promise.all([
    listAllPartners(),
    listAllPartnerDocuments(),
  ])

  // Group document counts by partner id in a single pass so the
  // PartnersFilterTable doesn't need to know about Partner_Documents.
  const docCountByPartner = new Map<string, number>()
  for (const doc of allDocs) {
    if (!doc.partnerId) continue
    docCountByPartner.set(doc.partnerId, (docCountByPartner.get(doc.partnerId) ?? 0) + 1)
  }

  const partnersWithCounts = partners.map(p => ({
    ...p,
    documentCount: docCountByPartner.get(p.id) ?? 0,
  }))

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-navy">Partners</h1>
        <p className="font-body text-gray-500 text-sm mt-0.5">
          Manage investors, financial planners, and realtors
        </p>
      </div>

      <PartnersFilterTable partners={partnersWithCounts} />
    </div>
  )
}
