// Backfill — match the monitoring export to Zoho and fill EMPTY CRM fields from
// the export, as confirm-cards Michael approves one at a time or all at once.
// The page loads the candidates (rows carrying a maturity or rate that could
// fill a gap); the client panel does the matching in small batches (Zoho rate
// limit + timeout safe) and the writes go through the confirmed-action apply
// route. Conflicts are shown, never proposed. Analysis on monitored data.

import Link from 'next/link'
import { can, requirePermission } from '@/lib/authz'
import { rawRowsForUpload, recentUploads, smmStoreConfigured } from '@/lib/smm-store'
import { collapseCoBorrowers, parseSmmRow } from '@/lib/smm'
import { isDemoMode } from '@/lib/demo'
import BackfillPanel, { type BackfillCandidate } from '@/components/admin/BackfillPanel'

export const dynamic = 'force-dynamic'

export default async function BackfillPage() {
  const user = await requirePermission('opportunities.view')
  const canManage = can(user, 'opportunities.manage') && !isDemoMode()

  if (!smmStoreConfigured()) {
    return (
      <div className="max-w-3xl space-y-4">
        <Header />
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500 font-body">The upload store is not connected.</p>
        </div>
      </div>
    )
  }

  const uploadsR = await recentUploads(5)
  const uploads = uploadsR.configured && uploadsR.ok ? uploadsR.data : []
  const current = uploads.find(u => !u.superseded) ?? uploads[0] ?? null
  if (!current) {
    return (
      <div className="max-w-3xl space-y-4">
        <Header />
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm text-gray-500 font-body">No monitoring export uploaded yet.</p>
        </div>
      </div>
    )
  }

  const rowsR = await rawRowsForUpload(current.id)
  const parsed = (rowsR.configured && rowsR.ok ? rowsR.data : []).map(parseSmmRow)
  const { mortgages } = collapseCoBorrowers(parsed)

  // Candidates: a mortgage carrying a maturity or a rate that could fill a gap,
  // and at least one contact signal to match on.
  const candidates: BackfillCandidate[] = mortgages
    .filter(m => (m.primary.maturityDate || m.primary.rate != null) && (m.primary.email || m.primary.phone || (m.primary.firstName && m.primary.lastName)))
    .map(m => ({
      householdId: m.primary.householdId,
      name: `${m.primary.firstName} ${m.primary.lastName}`.trim() || m.primary.fileRef,
      maturityDate: m.primary.maturityDate,
      rate: m.primary.rate,
      lenderDisplay: m.primary.lender.display,
    }))

  return (
    <div className="max-w-4xl space-y-4">
      <Header />
      <div className="bg-white border border-gray-200 rounded-xl p-4 text-sm font-body text-gray-600">
        <p>
          {candidates.length} of {mortgages.length} monitored files carry a maturity date or rate that could fill an
          empty Zoho field. Scanning matches each to a Zoho contact by email, then phone, then name, and proposes fills
          only where the CRM field is <span className="font-semibold text-navy">empty</span>. Where both hold a value and
          they differ, the conflict is shown for you to resolve in Zoho &mdash; never written automatically.
        </p>
        <p className="mt-2 text-xs text-gray-400">
          Lender name is a Zoho lookup (it needs a lender record, not a text value), so it is reported as a gap rather
          than proposed. Only Maturity date and Mortgage rate are written.
        </p>
      </div>
      {!canManage && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm font-body text-amber-800">
          You can scan and review proposals, but writing backfills to Zoho needs the manage permission.
        </div>
      )}
      <BackfillPanel uploadId={current.id} candidates={candidates} canManage={canManage} />
    </div>
  )
}

function Header() {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-body text-gray-400 mb-1">
        <Link href="/portal/admin/opportunities" className="hover:text-navy">Opportunities</Link>
        <span>/</span>
        <span className="text-gray-500">Backfill</span>
      </div>
      <h1 className="font-heading text-navy text-2xl font-bold">Backfill Zoho from monitoring</h1>
      <p className="text-gray-500 font-body text-sm mt-1">
        Fill the empty maturity dates and rates the monitoring export knows and the CRM does not &mdash; each one a
        confirmation you approve, every write recorded.
      </p>
    </div>
  )
}
