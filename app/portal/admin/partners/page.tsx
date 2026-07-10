// Partners (Session 7): the relationship layer, ranked for Monday
// attention. Every referral partner with their referral recency, trailing
// twelve months, conversion to funded, attributed volume and revenue
// (actuals where recorded, comp-model estimates labeled), portal sign-in
// recency read server-side through Clerk, and a health chip from
// config/partner-tiers.ts. Sorted health first, volume second. The
// management surface (invites, documents, view-as) lives on the detail
// pages, unchanged.

import { redirect } from 'next/navigation'
import { getPortalContext } from '@/lib/auth'
import { listAllPartners, listAllPartnerDocuments } from '@/lib/zoho'
import { getAllDealsRevenue } from '@/lib/zoho-admin'
import { getPartnerEngagementMap } from '@/lib/partner-engagement'
import { COMP_MODEL } from '@/config/comp'
import { isFundedStage } from '@/config/pipeline'
import {
  comparePartnersForAttention,
  partnerReferralStats,
  partnerTier,
} from '@/lib/partners-health'
import { torontoTodayYMD } from '@/lib/dates'
import type { RevenueDeal } from '@/lib/revenue'
import PartnersHealthTable, {
  type PartnerHealthRowView,
} from '@/components/admin/PartnersHealthTable'

export const dynamic = 'force-dynamic'

export default async function AdminPartnersPage() {
  const ctx = await getPortalContext()
  if (!ctx || !ctx.actor.roles.includes('admin')) {
    redirect('/portal')
  }

  const todayYMD = torontoTodayYMD()
  const [partners, allDocs] = await Promise.all([listAllPartners(), listAllPartnerDocuments()])
  let deals: RevenueDeal[] = []
  let dealsOk = true
  try {
    deals = await getAllDealsRevenue()
  } catch {
    dealsOk = false
  }
  const engagement = await getPartnerEngagementMap(
    partners.map(p => ({ id: p.id, email: p.email })),
  )

  const docCountByPartner = new Map<string, number>()
  for (const doc of allDocs) {
    if (!doc.partnerId) continue
    docCountByPartner.set(doc.partnerId, (docCountByPartner.get(doc.partnerId) ?? 0) + 1)
  }
  const dealsByPartner = new Map<string, RevenueDeal[]>()
  for (const d of deals) {
    if (!d.referralPartnerId) continue
    const list = dealsByPartner.get(d.referralPartnerId) ?? []
    list.push(d)
    dealsByPartner.set(d.referralPartnerId, list)
  }

  const rows: PartnerHealthRowView[] = partners
    .map(p => {
      const attributed = dealsByPartner.get(p.id) ?? []
      const stats = partnerReferralStats(attributed, todayYMD, COMP_MODEL, isFundedStage)
      const eng = engagement.map.get(p.id)
      return {
        id: p.id,
        name: p.name,
        email: p.email,
        partnerType: p.partnerType,
        documentCount: docCountByPartner.get(p.id) ?? 0,
        tier: partnerTier(p.partnerType, stats.lastReferral, todayYMD),
        lastReferral: stats.lastReferral,
        referralsT12: stats.referralsT12,
        referralsTotal: stats.referralsTotal,
        fundedCount: stats.fundedCount,
        fundedVolume: stats.fundedVolume,
        conversionPct: stats.conversionPct,
        revenueActual: stats.revenueActual,
        revenueModeled: stats.revenueModeled,
        hasAccount: engagement.ok ? Boolean(eng?.hasAccount) : null,
        lastSignInAt: eng?.lastSignInAt ?? null,
      }
    })
    .sort(comparePartnersForAttention)

  return (
    <div>
      <div className="mb-4">
        <h1 className="font-heading text-2xl font-bold text-navy">Partners</h1>
        <p className="font-body text-gray-500 text-sm mt-0.5">
          Ranked for Monday attention: health first, attributed volume second. Tap a partner for
          their files, cadence, documents, and invites.
        </p>
      </div>

      {/* The attribution caveat, stated once. */}
      <p className="text-[11px] text-gray-500 font-body bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-4">
        Pre-conversion attribution is structurally incomplete: the Zoho Leads module has no
        partner fields (the known gap from the Jul 9 form-intake hotfix, schema fix pending), so
        every number here counts from conversion onward, when Referral_Partner is linked on the
        file. Raw pre-conversion attribution lands in the form_submissions table in the interim.
      </p>

      {!dealsOk && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 font-body mb-4">
          The Zoho deals read failed, so referral stats show empty this load. The partner list and
          documents still render; reload for the full picture.
        </p>
      )}
      {!engagement.ok && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 font-body mb-4">
          The Clerk read failed, so portal sign-in shows not read this load rather than guessing
          who has an account.
        </p>
      )}

      <PartnersHealthTable rows={rows} />
    </div>
  )
}
