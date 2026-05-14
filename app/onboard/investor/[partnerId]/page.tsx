// TODO(2026-05-29): DELETE THIS FILE — all pre-Path-B magic link emails will
// have expired by this date (Magic_Link_Expires_At is 14 days post-issue;
// the latest possible legacy token was issued ~2026-05-14). Also delete the
// `findPartnerByMagicLinkToken` function in lib/zoho.ts at the same time.

import { redirect } from 'next/navigation'
import { findPartnerByMagicLinkToken } from '@/lib/zoho'

export const dynamic = 'force-dynamic'

// LEGACY route. Pre-Path-B emails embed the URL `/onboard/investor/{token}` —
// a single path segment. After Path B the canonical shape is
// `/onboard/investor/{partnerId}/{token}` (two segments). Next.js routes
// one-segment URLs here.
//
// The `params.partnerId` name is a Next.js misnomer in this file — the
// segment is named [partnerId] because the directory is shared with the
// canonical [partnerId]/[token]/ route, but the value arriving here is
// actually a legacy magic-link token. We look it up via the deprecated
// /search-by-token path (legacy tokens are by definition >5 min old, so
// Zoho's search index has caught up) and 307-redirect to the canonical
// URL. The user lands on the new flow with the URL bar showing the
// canonical shape.
export default async function LegacyOnboardingRedirect({
  params,
}: {
  params: { partnerId: string }
}) {
  // Despite the param name, the value is a token in this legacy path.
  const legacyToken = params.partnerId

  if (!legacyToken || !/^[a-f0-9]{64}$/i.test(legacyToken)) {
    redirect(`/onboard/expired?ref=${encodeURIComponent(legacyToken ?? '')}`)
  }

  const partner = await findPartnerByMagicLinkToken(legacyToken)
  if (!partner) {
    redirect(`/onboard/expired?ref=${encodeURIComponent(legacyToken)}`)
  }

  // Resolved — bounce to the canonical route. The canonical page will
  // re-validate via direct getPartner + timingSafeEqual, check expiry,
  // and either render the welcome page or redirect to expired/sign-in.
  redirect(`/onboard/investor/${partner.id}/${legacyToken}`)
}
