import { redirect } from 'next/navigation'
import { findPartnerByIdAndMagicLinkToken } from '@/lib/zoho'
import { isMagicLinkExpired } from '@/lib/onboarding'
import { getPartnerConfigByZohoType } from '@/lib/partner-types'
import OnboardingPartnerWelcomeClient from './OnboardingPartnerWelcomeClient'

// Partner magic-link consumer route. Mirrors the investor consumer at
// /onboard/investor/[partnerId]/[token], but lands FP / Realtor / Lawyer
// partners instead of investors. The investor consumer is untouched.
//
// URL shape: /onboard/partner/{partnerId}/{token}
//
// The same id+token primitive is used (direct GET /Partners/{id} +
// constant-time token compare via findPartnerByIdAndMagicLinkToken),
// so this avoids the Zoho search-index lag the investor consumer also
// avoids.
//
// Public route — no Clerk gate. The id+token pair IS the auth.

export const dynamic = 'force-dynamic'

export default async function OnboardingPartnerWelcomePage({
  params,
}: {
  params: { partnerId: string; token: string }
}) {
  const { partnerId, token } = params

  // Same input-shape sanity check as the investor page — 15-19 digit
  // Zoho id, 64 hex chars token.
  if (
    !partnerId ||
    !token ||
    !/^\d{15,19}$/.test(partnerId) ||
    !/^[a-f0-9]{64}$/i.test(token)
  ) {
    redirect(
      `/onboard/expired?p=${encodeURIComponent(partnerId ?? '')}` +
        `&ref=${encodeURIComponent(token ?? '')}`,
    )
  }

  const partner = await findPartnerByIdAndMagicLinkToken(partnerId, token)
  if (!partner) {
    redirect(
      `/onboard/expired?p=${encodeURIComponent(partnerId)}` +
        `&ref=${encodeURIComponent(token)}`,
    )
  }

  if (isMagicLinkExpired(partner.magicLinkExpiresAt)) {
    redirect(
      `/onboard/expired?p=${encodeURIComponent(partnerId)}` +
        `&ref=${encodeURIComponent(token)}`,
    )
  }

  if (partner.magicLinkUsedAt) {
    redirect('/portal/sign-in')
  }

  // Resolve config from Partner_Type. If the Partner_Type was changed
  // in Zoho between invite and click to something unsupported (or to
  // 'Investor'), bounce back to expired with a hint — the partner
  // can ask Mike to re-issue from the right route.
  const config = getPartnerConfigByZohoType(partner.partnerType)
  if (!config || !config.usesPartnerOnboarding) {
    redirect(
      `/onboard/expired?p=${encodeURIComponent(partnerId)}` +
        `&ref=${encodeURIComponent(token)}` +
        `&reason=wrong-flow`,
    )
  }

  const firstName =
    partner.preferredName ||
    (partner.name ?? '').split(' ')[0] ||
    'there'

  const kindLabel =
    config.kind === 'fp' ? 'Financial Planner'
    : config.kind === 'realtor' ? 'Realtor'
    : config.kind === 'lawyer' ? 'Lawyer'
    : config.kind === 'mortgage_agent' ? 'Mortgage Agent'
    : 'Partner'

  return (
    <OnboardingPartnerWelcomeClient
      firstName={firstName}
      email={partner.email ?? ''}
      partnerId={partnerId}
      token={token}
      kindLabel={kindLabel}
    />
  )
}
