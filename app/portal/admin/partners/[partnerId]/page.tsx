import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getPortalContext } from '@/lib/auth'
import {
  getPartner,
  getPartnerDocuments,
  getDealsByPartner,
} from '@/lib/zoho'
import {
  fromZohoDeal,
  isIncomeActive,
  interestEarned,
  portfolioIRR,
  deriveStatus,
  statusBadge,
} from '@/lib/investor-calc'
import DocumentUploader from '@/components/DocumentUploader'
import ImpersonateButton from '@/components/ImpersonateButton'

export const dynamic = 'force-dynamic'

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n)

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmt(v: string | null | undefined): string {
  if (v == null) return '—'
  const trimmed = String(v).trim()
  return trimmed.length > 0 ? trimmed : '—'
}

function adminDocStatusBadge(status: string | null): { label: string; cls: string } {
  switch (status) {
    case 'Approved':  return { label: 'Approved',  cls: 'bg-lime/20 text-lime-dark' }
    case 'Submitted': return { label: 'Submitted', cls: 'bg-gray-100 text-gray-700' }
    case 'Pending':   return { label: 'Pending',   cls: 'bg-yellow-100 text-yellow-700' }
    case 'Rejected':  return { label: 'Rejected',  cls: 'bg-red-100 text-red-700' }
    case 'Expired':   return { label: 'Expired',   cls: 'bg-amber-100 text-amber-700' }
    default:          return { label: status ?? '—', cls: 'bg-gray-100 text-gray-600' }
  }
}

// Required documents — must match the list on the investor profile page
// and the picklist values in Zoho.
const REQUIRED_DOC_TYPES = [
  'KYC', 'AML Declaration', 'Accredited Investor', 'Risk Disclosure', 'Void Cheque',
]

export default async function AdminPartnerDetailPage({
  params,
}: {
  params: { partnerId: string }
}) {
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
        <Link href="/portal/admin/partners" className="text-lime font-semibold text-sm hover:underline mt-4 inline-block">
          ← Back to Partners
        </Link>
      </div>
    )
  }

  const partnerTypeLower = (partner.partnerType ?? '').toLowerCase()
  const isInvestor = partnerTypeLower.includes('investor')

  // ── Non-investor placeholder branch ──────────────────────────────────────
  if (!isInvestor) {
    return (
      <div className="max-w-3xl mx-auto">
        <Link href="/portal/admin/partners" className="inline-flex items-center gap-1.5 text-gray-400 text-sm font-body hover:text-navy mb-4">
          <ArrowLeft className="w-4 h-4" /> Partners
        </Link>
        <h1 className="font-heading text-2xl font-bold text-navy mb-1">{partner.name ?? 'Partner'}</h1>
        <p className="font-body text-gray-500 text-sm mb-6">
          {partner.partnerType ?? '—'} · {partner.email ?? '—'}
        </p>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="font-heading text-navy text-lg font-bold mb-2">Detail view coming soon</p>
          <p className="font-body text-gray-500 text-sm mb-4 max-w-md mx-auto">
            FP and Realtor detail pages are deferred to a future commit. For now, you can still upload and review documents via the standalone documents route.
          </p>
          <Link
            href={`/portal/admin/partners/${partnerId}/documents`}
            className="inline-block bg-lime text-navy font-heading font-bold text-sm px-5 py-2.5 rounded-lg hover:bg-lime-dark transition-colors"
          >
            Open Documents →
          </Link>
        </div>
      </div>
    )
  }

  // ── Investor detail branch ──────────────────────────────────────────────
  // Three Zoho calls in parallel: documents, deals, and partner is
  // already fetched. The detail page is admin-only and low-frequency, so
  // we don't cache these individually.
  const [documents, dealsRaw] = await Promise.all([
    getPartnerDocuments(partnerId),
    getDealsByPartner(partnerId),
  ])

  const inputs = (dealsRaw as any[]).map(fromZohoDeal)
  const incomeActive = inputs.filter(i => isIncomeActive(i))
  const totalDeployed = incomeActive.reduce((sum, i) => sum + i.investorAmount, 0)
  const monthlyIncome = incomeActive.reduce((sum, i) => sum + i.paymentAmount, 0)
  const totalInterest = inputs.reduce((sum, i) => sum + interestEarned(i), 0)
  const totalLenderFees = inputs.reduce((sum, i) => sum + i.lenderFee, 0)
  const allTimeCashEarned = totalInterest + totalLenderFees
  const irrValue = portfolioIRR(inputs)
  const irrDisplay = irrValue !== null ? `${(irrValue * 100).toFixed(1)}%` : '—'

  const fundedDeals = dealsRaw as any[]
  const activeDealCount = fundedDeals.filter(d => isIncomeActive(fromZohoDeal(d))).length
  const paidOutDealCount = fundedDeals.filter(d => deriveStatus(fromZohoDeal(d)) === 'paid_out').length

  const approvedRequiredDocs = REQUIRED_DOC_TYPES.filter(reqType =>
    documents.some(d => d.documentStatus === 'Approved' && d.documentType === reqType)
  ).length

  const address = [partner.street, partner.city, partner.province, partner.postalCode].filter(Boolean).join(', ') || '—'

  return (
    <div>
      <Link href="/portal/admin/partners" className="inline-flex items-center gap-1.5 text-gray-400 text-sm font-body hover:text-navy mb-4">
        <ArrowLeft className="w-4 h-4" /> Partners
      </Link>

      {/* Header */}
      <div className="flex justify-between items-start gap-4 mb-6">
        <div>
          <h1 className="font-heading text-2xl font-bold text-navy">{partner.name ?? 'Investor'}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-2 text-sm font-body">
            <span className="bg-navy text-lime text-xs font-semibold px-2 py-0.5 rounded-full">
              Investor
            </span>
            <span className="text-gray-600">{partner.email ?? '—'}</span>
            {partner.phone && <span className="text-gray-400">·</span>}
            {partner.phone && <span className="text-gray-600">{partner.phone}</span>}
            {partner.city && <span className="text-gray-400">·</span>}
            {partner.city && <span className="text-gray-600">{partner.city}</span>}
          </div>
        </div>
        <ImpersonateButton partnerId={partnerId} role="investor" />
      </div>

      {/* Overview KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="font-heading text-2xl text-navy">{formatCurrency(totalDeployed)}</p>
          <p className="text-gray-500 text-sm font-body">Total Deployed</p>
          <p className="text-gray-400 text-xs mt-1 font-body">
            Across {incomeActive.length} active position{incomeActive.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="font-heading text-2xl text-navy">{formatCurrency(allTimeCashEarned)}</p>
          <p className="text-gray-500 text-sm font-body">All-Time Cash Earned</p>
          <p className="text-gray-400 text-xs mt-1 font-body">Interest + lender fees</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="font-heading text-2xl text-navy">{formatCurrency(monthlyIncome)}</p>
          <p className="text-gray-500 text-sm font-body">Monthly Income</p>
          <p className="text-gray-400 text-xs mt-1 font-body">Active positions</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="font-heading text-2xl text-navy">{irrDisplay}</p>
          <p className="text-gray-500 text-sm font-body">Portfolio IRR</p>
          <p className="text-gray-400 text-xs mt-1 font-body">Money-weighted, lifetime</p>
        </div>
      </div>

      {/* Documents section */}
      <section className="mb-8">
        <div className="mb-4">
          <h2 className="font-heading text-xl font-bold text-navy">Documents</h2>
          <p className="font-body text-gray-500 text-sm mt-0.5">
            {approvedRequiredDocs} of {REQUIRED_DOC_TYPES.length} required compliance documents uploaded
          </p>
        </div>

        <div className="mb-4">
          <DocumentUploader partnerId={partnerId} />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          {documents.length === 0 ? (
            <p className="font-body text-gray-500 text-sm py-6 text-center">No documents uploaded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400 text-xs uppercase tracking-wider text-left">
                    <th className="pb-3 font-medium">Document</th>
                    <th className="pb-3 font-medium">Type</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Date</th>
                    <th className="pb-3 font-medium">Reviewer Notes</th>
                    <th className="pb-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="font-body">
                  {documents.map((doc) => {
                    const badge = adminDocStatusBadge(doc.documentStatus)
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
                        <td className="py-3 text-gray-500 max-w-xs truncate">{doc.reviewerNotes ?? '—'}</td>
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
      </section>

      {/* Deals section */}
      <section className="mb-8">
        <div className="mb-4">
          <h2 className="font-heading text-xl font-bold text-navy">Mortgages</h2>
          <p className="font-body text-gray-500 text-sm mt-0.5">
            {activeDealCount} active · {paidOutDealCount} paid out
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          {fundedDeals.length === 0 ? (
            <p className="font-body text-gray-500 text-sm py-6 text-center">No deals on file.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400 text-xs uppercase tracking-wider text-left">
                    <th className="pb-3 font-medium">Property</th>
                    <th className="pb-3 font-medium">Type</th>
                    <th className="pb-3 font-medium">Invested</th>
                    <th className="pb-3 font-medium">Rate</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Maturity</th>
                  </tr>
                </thead>
                <tbody className="font-body">
                  {fundedDeals.map((deal: any) => {
                    const input = fromZohoDeal(deal)
                    const dealStatus = deriveStatus(input)
                    const badge = statusBadge(dealStatus)
                    const property = `${deal.Street ?? ''}${deal.City ? `, ${deal.City}` : ''}` || '—'
                    return (
                      <tr key={deal.id} className="border-b border-gray-50 last:border-0">
                        <td className="py-3 text-navy font-medium">{property}</td>
                        <td className="py-3 text-gray-700">{deal.Mortgage_Type ?? '—'} Mortgage</td>
                        <td className="py-3 text-navy">{formatCurrency(input.investorAmount)}</td>
                        <td className="py-3 text-navy">{input.investorRate}%</td>
                        <td className="py-3">
                          <span className={`${badge.color} text-xs font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1.5`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                            {badge.label}
                          </span>
                        </td>
                        <td className="py-3 text-gray-500">{formatDate(deal.Maturity_Date ?? null)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Profile section */}
      <section className="mb-8">
        <div className="mb-4">
          <h2 className="font-heading text-xl font-bold text-navy">Profile</h2>
          <p className="font-body text-gray-500 text-sm mt-0.5">Personal information on file</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-heading text-base font-bold text-navy mb-4">Personal Information</h3>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-gray-500 text-xs font-body">Name</dt>
                <dd className="text-navy font-medium text-sm font-body mt-0.5">{fmt(partner.name)}</dd>
              </div>
              <div>
                <dt className="text-gray-500 text-xs font-body">Email</dt>
                <dd className="text-navy font-medium text-sm font-body mt-0.5 break-all">{fmt(partner.email)}</dd>
              </div>
              <div>
                <dt className="text-gray-500 text-xs font-body">Phone</dt>
                <dd className="text-navy font-medium text-sm font-body mt-0.5">{fmt(partner.mobile || partner.phone)}</dd>
              </div>
              <div>
                <dt className="text-gray-500 text-xs font-body">Date of Birth</dt>
                <dd className="text-navy font-medium text-sm font-body mt-0.5">{formatDate(partner.dateOfBirth)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-gray-500 text-xs font-body">Residency Status</dt>
                <dd className="text-navy font-medium text-sm font-body mt-0.5">{fmt(partner.residencyStatus)}</dd>
              </div>
            </dl>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-heading text-base font-bold text-navy mb-4">Investor Profile</h3>
            <dl className="space-y-4">
              <div>
                <dt className="text-gray-500 text-xs font-body">Partner Type</dt>
                <dd className="mt-1">
                  {partner.partnerType ? (
                    <span className="inline-block bg-navy text-lime rounded-full px-3 py-1 text-sm font-body font-semibold">
                      {partner.partnerType}
                    </span>
                  ) : (
                    <span className="text-navy font-medium text-sm font-body">—</span>
                  )}
                </dd>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-gray-500 text-xs font-body">Entity Type</dt>
                  <dd className="text-navy font-medium text-sm font-body mt-0.5">{fmt(partner.entityType)}</dd>
                </div>
                <div>
                  <dt className="text-gray-500 text-xs font-body">Risk Profile</dt>
                  <dd className="text-navy font-medium text-sm font-body mt-0.5">{fmt(partner.riskProfile)}</dd>
                </div>
              </div>
              <div>
                <dt className="text-gray-500 text-xs font-body">Investor Preferences</dt>
                <dd className="mt-1">
                  {partner.investorPreferences && partner.investorPreferences.trim().length > 0 ? (
                    <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 max-h-32 overflow-y-auto">
                      <p className="text-navy text-sm font-body whitespace-pre-wrap">{partner.investorPreferences}</p>
                    </div>
                  ) : (
                    <span className="text-navy font-medium text-sm font-body">—</span>
                  )}
                </dd>
              </div>
            </dl>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 lg:col-span-2">
            <h3 className="font-heading text-base font-bold text-navy mb-4">Contact</h3>
            <dl>
              <div>
                <dt className="text-gray-500 text-xs font-body">Mailing Address</dt>
                <dd className="text-navy font-medium text-sm font-body mt-0.5 whitespace-pre-line">
                  {address === '—' ? '—' : (
                    <>
                      {partner.street && <>{partner.street}<br /></>}
                      {(partner.city || partner.province) && (
                        <>
                          {[partner.city, partner.province].filter(Boolean).join(', ')}
                          {partner.postalCode ? `  ${partner.postalCode}` : ''}
                        </>
                      )}
                    </>
                  )}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>
    </div>
  )
}
