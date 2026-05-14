import { getPartner, findPartnerByMagicLinkToken } from '@/lib/zoho'
import ExpiredOnboardingClient from './ExpiredOnboardingClient'

// Public route. Shown when the canonical /onboard/investor/{partnerId}/{token}
// route (or the legacy /onboard/investor/{token} fallback) determines the
// link is invalid, expired, or otherwise unusable.
//
// Accepts two query-string shapes:
//   - Path B canonical: ?p={partnerId}&ref={token}
//     Resolves the partner via direct getPartner — immediately
//     consistent and the same code path used to issue the link.
//   - Legacy fallback:  ?ref={token}
//     Resolves the partner via findPartnerByMagicLinkToken (the
//     deprecated /search-by-token). Legacy refs are >5 min old by
//     definition (only pre-Path-B emails generate this shape), so
//     Zoho's search index has caught up.
//
// We attempt a partner lookup so the email Mike receives includes
// the partner's name and a direct link to their detail page. If the
// lookup fails (unknown id, unknown token, Zoho error), we still
// render the same confirmation page — no information leak about
// whether a partner/token existed — but Mike's notification email
// will say "(unknown)" and he can decide whether to investigate.

export const dynamic = 'force-dynamic'

export default async function ExpiredOnboardingPage({
  searchParams,
}: {
  searchParams: { p?: string; ref?: string }
}) {
  const partnerIdParam = searchParams.p ?? ''
  const ref = searchParams.ref ?? ''
  let partnerName: string | null = null
  let partnerEmail: string | null = null

  // Path B canonical: ?p=<partnerId>. Direct lookup is immediately
  // consistent and avoids the search-index path entirely.
  if (/^\d{15,19}$/.test(partnerIdParam)) {
    try {
      const partner = await getPartner(partnerIdParam)
      if (partner) {
        partnerName = partner.name
        partnerEmail = partner.email
      }
    } catch {
      // Same UX either way; swallow.
    }
  } else if (/^[a-f0-9]{64}$/i.test(ref)) {
    // Legacy fallback: only `?ref=<token>` (no `?p=`). Used by pre-
    // Path-B emails that bounced through the legacy redirect at
    // /onboard/investor/[partnerId]/page.tsx.
    try {
      const partner = await findPartnerByMagicLinkToken(ref)
      if (partner) {
        partnerName = partner.name
        partnerEmail = partner.email
      }
    } catch {
      // Same UX either way; swallow.
    }
  }

  return (
    <ExpiredOnboardingClient
      partnerIdParam={partnerIdParam}
      refToken={ref}
      partnerName={partnerName}
      partnerEmail={partnerEmail}
    />
  )
}
