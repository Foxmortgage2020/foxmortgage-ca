import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requirePermission } from '@/lib/authz'
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
import SendOnboardingLinkButton from '@/components/SendOnboardingLinkButton'
import SendPortalInviteButton from '@/components/SendPortalInviteButton'
import { isMagicLinkExpired } from '@/lib/onboarding'
import { getPartnerConfigByZohoType } from '@/lib/partner-types'
import PartnerReferralSection from '@/components/admin/PartnerReferralSection'
import { getAllDealsRevenue } from '@/lib/zoho-admin'
import StatusChip, { type ChipTone } from '@/components/admin/ds/StatusChip'

export const dynamic = 'force-dynamic'

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n)

// Date-only strings from Zoho (Uploaded_Date, Expiry_Date, etc.) come
// as bare YYYY-MM-DD and `new Date(iso)` parses them as midnight UTC —
// which renders one day earlier in Eastern timezone. Parse as local
// components so the rendered day matches Zoho.
function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  const d = dateOnlyMatch
    ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
    : new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmt(v: string | null | undefined): string {
  if (v == null) return '—'
  const trimmed = String(v).trim()
  return trimmed.length > 0 ? trimmed : '—'
}

function adminDocStatusBadge(status: string | null): { label: string; tone: ChipTone } {
  switch (status) {
    case 'Approved':  return { label: 'Approved',  tone: 'green' }
    case 'Submitted': return { label: 'Submitted', tone: 'gray' }
    case 'Pending':   return { label: 'Pending',   tone: 'amber' }
    case 'Rejected':  return { label: 'Rejected',  tone: 'red' }
    case 'Expired':   return { label: 'Expired',   tone: 'amber' }
    default:          return { label: status ?? '—', tone: 'gray' }
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
  // Session 8: permission key, not a role literal.
  await requirePermission('partners.provision')

  const { partnerId } = params
  const partner = await getPartner(partnerId)
  if (!partner) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <h1 className="font-heading text-navy text-xl font-bold mb-2">Partner Not Found</h1>
        <p className="font-ui text-cool-500">No Partners record with ID {partnerId}.</p>
        <Link href="/portal/admin/partners" className="text-navy font-semibold text-sm underline decoration-cool-300 hover:decoration-navy mt-4 inline-block">
          ← Back to Partners
        </Link>
      </div>
    )
  }

  const partnerTypeLower = (partner.partnerType ?? '').toLowerCase()
  const isInvestor = partnerTypeLower.includes('investor')

  // ── Non-investor branch (FP / Realtor / Lawyer) ──────────────────────────
  if (!isInvestor) {
    // Resolve the per-type config so we can decide whether the partner
    // is invite-able through the partner onboarding flow (FP / Realtor
    // / Lawyer) or sits outside the supported set (Lender, Underwriter,
    // Insurance Advisor — no portal today).
    const config = getPartnerConfigByZohoType(partner.partnerType)
    const inviteable = !!config && config.usesPartnerOnboarding

    // Mirror investor stage-gate logic: show the invite button on Lead;
    // on Invited, only show when the prior link is used or expired
    // (so admin can resend) — otherwise hide to avoid double-issuing.
    let inviteControl: React.ReactNode = null
    if (inviteable) {
      const stage = partner.onboardingStage
      if (stage === 'Lead' || !stage) {
        inviteControl = (
          <SendPortalInviteButton partnerId={partnerId} label="Send Portal Invite" />
        )
      } else if (stage === 'Invited') {
        const tokenStale =
          Boolean(partner.magicLinkUsedAt) || isMagicLinkExpired(partner.magicLinkExpiresAt)
        if (tokenStale) {
          inviteControl = (
            <SendPortalInviteButton partnerId={partnerId} label="Resend Portal Invite" />
          )
        }
      }
    }

    // Impersonate button — only for the kinds we have impersonation
    // wired for (fp / realtor / lawyer / mortgage agent). If the type is
    // unsupported, omit the button rather than showing a 400-on-click.
    const impersonateRole: 'fp' | 'realtor' | 'lawyer' | 'mortgage_agent' | null =
      config?.kind === 'fp' ? 'fp'
      : config?.kind === 'realtor' ? 'realtor'
      : config?.kind === 'lawyer' ? 'lawyer'
      : config?.kind === 'mortgage_agent' ? 'mortgage_agent'
      : null

    return (
      <div className="max-w-3xl mx-auto">
        <Link href="/portal/admin/partners" className="inline-flex items-center gap-1.5 text-cool-400 text-sm font-ui hover:text-navy mb-4">
          <ArrowLeft className="w-4 h-4" /> Partners
        </Link>

        <div className="flex justify-between items-start gap-4 mb-6">
          <div>
            <h1 className="font-heading text-2xl font-bold text-navy">{partner.name ?? 'Partner'}</h1>
            <p className="font-ui text-cool-500 text-sm mt-1">
              {partner.partnerType ?? '—'} · {partner.email ?? '—'}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {inviteControl}
            {impersonateRole && (
              <ImpersonateButton partnerId={partnerId} role={impersonateRole} />
            )}
          </div>
        </div>

        <PartnerReferralSection
          partnerId={partnerId}
          partnerType={partner.partnerType}
          email={partner.email}
        />

        {/* Contact details */}
        <div className="bg-white rounded-[9px] border border-cool-200 p-6 mb-6">
          <h3 className="font-heading text-base font-bold text-navy mb-4">Contact</h3>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-cool-500 text-xs font-ui">Email</dt>
              <dd className="text-navy font-medium text-sm font-ui mt-0.5 break-all">{fmt(partner.email)}</dd>
            </div>
            <div>
              <dt className="text-cool-500 text-xs font-ui">Phone</dt>
              <dd className="text-navy font-medium text-sm font-ui mt-0.5">{fmt(partner.mobile || partner.phone)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-cool-500 text-xs font-ui">Address</dt>
              <dd className="text-navy font-medium text-sm font-ui mt-0.5">
                {[partner.street, partner.city, partner.province, partner.postalCode].filter(Boolean).join(', ') || '—'}
              </dd>
            </div>
          </dl>
        </div>

        <Link
          href={`/portal/admin/partners/${partnerId}/documents`}
          className="inline-block bg-navy text-white font-heading font-bold text-sm px-5 py-2.5 rounded-lg hover:bg-navy-light transition-colors"
        >
          Open Documents →
        </Link>
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

  // Investors fund deals rather than referring them, so the referral
  // section renders only when files actually carry this partner as
  // Referral_Partner (possible for a dual-role relationship).
  let investorHasReferrals = false
  try {
    investorHasReferrals = (await getAllDealsRevenue()).some(
      d => d.referralPartnerId === partnerId,
    )
  } catch {
    investorHasReferrals = false
  }

  const address = [partner.street, partner.city, partner.province, partner.postalCode].filter(Boolean).join(', ') || '—'

  return (
    <div>
      <Link href="/portal/admin/partners" className="inline-flex items-center gap-1.5 text-cool-400 text-sm font-ui hover:text-navy mb-4">
        <ArrowLeft className="w-4 h-4" /> Partners
      </Link>

      {/* Header */}
      <div className="flex justify-between items-start gap-4 mb-6">
        <div>
          <h1 className="font-heading text-2xl font-bold text-navy">{partner.name ?? 'Investor'}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-2 text-sm font-ui">
            <span className="bg-navy text-white text-xs font-semibold px-2 py-0.5 rounded-full">
              Investor
            </span>
            <span className="text-cool-600">{partner.email ?? '—'}</span>
            {partner.phone && <span className="text-cool-400">·</span>}
            {partner.phone && <span className="text-cool-600">{partner.phone}</span>}
            {partner.city && <span className="text-cool-400">·</span>}
            {partner.city && <span className="text-cool-600">{partner.city}</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {/* Send / Resend Onboarding Link button. Visible only on Lead
              or on Invited when the previous magic link has been used
              or has expired. Once the investor is In Progress / further,
              this control disappears. */}
          {(() => {
            const stage = partner.onboardingStage
            if (stage === 'Lead') {
              return <SendOnboardingLinkButton partnerId={partnerId} label="Send Onboarding Link" />
            }
            if (stage === 'Invited') {
              const tokenStale =
                Boolean(partner.magicLinkUsedAt) || isMagicLinkExpired(partner.magicLinkExpiresAt)
              if (tokenStale) {
                return <SendOnboardingLinkButton partnerId={partnerId} label="Resend Onboarding Link" />
              }
            }
            return null
          })()}
          <ImpersonateButton partnerId={partnerId} role="investor" />
        </div>
      </div>

      {/* Overview KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-[9px] border border-cool-200 p-5">
          <p className="font-heading text-2xl text-navy tabular-nums">{formatCurrency(totalDeployed)}</p>
          <p className="text-cool-500 text-sm font-ui">Total Deployed</p>
          <p className="text-cool-400 text-xs mt-1 font-ui">
            Across {incomeActive.length} active position{incomeActive.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="bg-white rounded-[9px] border border-cool-200 p-5">
          <p className="font-heading text-2xl text-navy tabular-nums">{formatCurrency(allTimeCashEarned)}</p>
          <p className="text-cool-500 text-sm font-ui">All-Time Cash Earned</p>
          <p className="text-cool-400 text-xs mt-1 font-ui">Interest + lender fees</p>
        </div>
        <div className="bg-white rounded-[9px] border border-cool-200 p-5">
          <p className="font-heading text-2xl text-navy tabular-nums">{formatCurrency(monthlyIncome)}</p>
          <p className="text-cool-500 text-sm font-ui">Monthly Income</p>
          <p className="text-cool-400 text-xs mt-1 font-ui">Active positions</p>
        </div>
        <div className="bg-white rounded-[9px] border border-cool-200 p-5">
          <p className="font-heading text-2xl text-navy tabular-nums">{irrDisplay}</p>
          <p className="text-cool-500 text-sm font-ui">Portfolio IRR</p>
          <p className="text-cool-400 text-xs mt-1 font-ui">Money-weighted, lifetime</p>
        </div>
      </div>

      {investorHasReferrals && (
        <PartnerReferralSection
          partnerId={partnerId}
          partnerType={partner.partnerType}
          email={partner.email}
        />
      )}

      {/* Documents section */}
      <section className="mb-8">
        <div className="mb-4">
          <h2 className="font-heading text-xl font-bold text-navy">Documents</h2>
          <p className="font-ui text-cool-500 text-sm mt-0.5">
            {approvedRequiredDocs} of {REQUIRED_DOC_TYPES.length} required compliance documents uploaded
          </p>
        </div>

        <div className="mb-4">
          <DocumentUploader partnerId={partnerId} />
        </div>

        <div className="bg-white rounded-[9px] border border-cool-200 p-6">
          {documents.length === 0 ? (
            <p className="font-ui text-cool-500 text-sm py-6 text-center">No documents uploaded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="font-heading text-[11px] font-semibold tracking-[0.05em] text-cool-600 text-left">
                    <th className="pb-3">Document</th>
                    <th className="pb-3">Type</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Date</th>
                    <th className="pb-3">Reviewer Notes</th>
                    <th className="pb-3">Action</th>
                  </tr>
                </thead>
                <tbody className="font-ui">
                  {documents.map((doc) => {
                    const badge = adminDocStatusBadge(doc.documentStatus)
                    return (
                      <tr key={doc.id} className="border-t border-cool-100">
                        <td className="py-3 text-navy font-medium">{doc.name}</td>
                        <td className="py-3 text-cool-700">{doc.documentType ?? '—'}</td>
                        <td className="py-3">
                          <StatusChip tone={badge.tone}>{badge.label}</StatusChip>
                        </td>
                        <td className="py-3 text-cool-500 tabular-nums">{formatDate(doc.uploadedDate)}</td>
                        <td className="py-3 text-cool-500 max-w-xs truncate">{doc.reviewerNotes ?? '—'}</td>
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
      </section>

      {/* Deals section */}
      <section className="mb-8">
        <div className="mb-4">
          <h2 className="font-heading text-xl font-bold text-navy">Mortgages</h2>
          <p className="font-ui text-cool-500 text-sm mt-0.5">
            {activeDealCount} active · {paidOutDealCount} paid out
          </p>
        </div>
        <div className="bg-white rounded-[9px] border border-cool-200 p-6">
          {fundedDeals.length === 0 ? (
            <p className="font-ui text-cool-500 text-sm py-6 text-center">No deals on file.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="font-heading text-[11px] font-semibold tracking-[0.05em] text-cool-600 text-left">
                    <th className="pb-3">Property</th>
                    <th className="pb-3">Type</th>
                    <th className="pb-3">Invested</th>
                    <th className="pb-3">Rate</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Maturity</th>
                  </tr>
                </thead>
                <tbody className="font-ui">
                  {fundedDeals.map((deal: any) => {
                    const input = fromZohoDeal(deal)
                    const dealStatus = deriveStatus(input)
                    const badge = statusBadge(dealStatus)
                    const property = `${deal.Street ?? ''}${deal.City ? `, ${deal.City}` : ''}` || '—'
                    return (
                      <tr key={deal.id} className="border-t border-cool-100">
                        <td className="py-3 text-navy font-medium">{property}</td>
                        <td className="py-3 text-cool-700">{deal.Mortgage_Type ?? '—'} Mortgage</td>
                        <td className="py-3 text-navy tabular-nums">{formatCurrency(input.investorAmount)}</td>
                        <td className="py-3 text-navy tabular-nums">{input.investorRate}%</td>
                        <td className="py-3">
                          <span className={`${badge.color} text-xs font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1.5`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                            {badge.label}
                          </span>
                        </td>
                        <td className="py-3 text-cool-500 tabular-nums">{formatDate(deal.Maturity_Date ?? null)}</td>
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
          <p className="font-ui text-cool-500 text-sm mt-0.5">Personal information on file</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-[9px] border border-cool-200 p-6">
            <h3 className="font-heading text-base font-bold text-navy mb-4">Personal Information</h3>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-cool-500 text-xs font-ui">Name</dt>
                <dd className="text-navy font-medium text-sm font-ui mt-0.5">{fmt(partner.name)}</dd>
              </div>
              <div>
                <dt className="text-cool-500 text-xs font-ui">Email</dt>
                <dd className="text-navy font-medium text-sm font-ui mt-0.5 break-all">{fmt(partner.email)}</dd>
              </div>
              <div>
                <dt className="text-cool-500 text-xs font-ui">Phone</dt>
                <dd className="text-navy font-medium text-sm font-ui mt-0.5">{fmt(partner.mobile || partner.phone)}</dd>
              </div>
              <div>
                <dt className="text-cool-500 text-xs font-ui">Date of Birth</dt>
                <dd className="text-navy font-medium text-sm font-ui mt-0.5">{formatDate(partner.dateOfBirth)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-cool-500 text-xs font-ui">Residency Status</dt>
                <dd className="text-navy font-medium text-sm font-ui mt-0.5">{fmt(partner.residencyStatus)}</dd>
              </div>
            </dl>
          </div>

          <div className="bg-white rounded-[9px] border border-cool-200 p-6">
            <h3 className="font-heading text-base font-bold text-navy mb-4">Investor Profile</h3>
            <dl className="space-y-4">
              <div>
                <dt className="text-cool-500 text-xs font-ui">Partner Type</dt>
                <dd className="mt-1">
                  {partner.partnerType ? (
                    <span className="inline-block bg-navy text-white rounded-full px-3 py-1 text-sm font-ui font-semibold">
                      {partner.partnerType}
                    </span>
                  ) : (
                    <span className="text-navy font-medium text-sm font-ui">—</span>
                  )}
                </dd>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-cool-500 text-xs font-ui">Entity Type</dt>
                  <dd className="text-navy font-medium text-sm font-ui mt-0.5">{fmt(partner.entityType)}</dd>
                </div>
                <div>
                  <dt className="text-cool-500 text-xs font-ui">Risk Profile</dt>
                  <dd className="text-navy font-medium text-sm font-ui mt-0.5">{fmt(partner.riskProfile)}</dd>
                </div>
              </div>
              <div>
                <dt className="text-cool-500 text-xs font-ui">Investor Preferences</dt>
                <dd className="mt-1">
                  {partner.investorPreferences && partner.investorPreferences.trim().length > 0 ? (
                    <div className="bg-cool-50 border border-cool-100 rounded-lg p-3 max-h-32 overflow-y-auto">
                      <p className="text-navy text-sm font-ui whitespace-pre-wrap">{partner.investorPreferences}</p>
                    </div>
                  ) : (
                    <span className="text-navy font-medium text-sm font-ui">—</span>
                  )}
                </dd>
              </div>
            </dl>
          </div>

          <div className="bg-white rounded-[9px] border border-cool-200 p-6 lg:col-span-2">
            <h3 className="font-heading text-base font-bold text-navy mb-4">Contact</h3>
            <dl>
              <div>
                <dt className="text-cool-500 text-xs font-ui">Mailing Address</dt>
                <dd className="text-navy font-medium text-sm font-ui mt-0.5 whitespace-pre-line">
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
