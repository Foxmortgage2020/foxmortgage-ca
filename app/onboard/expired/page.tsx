import { findPartnerByMagicLinkToken } from '@/lib/zoho'
import ExpiredOnboardingClient from './ExpiredOnboardingClient'

// Public route. Shown when /onboard/investor/[token] determines the
// token is invalid, expired, or otherwise unusable. The original
// token comes through as ?ref= so we can correlate the request-new-link
// CTA back to the partner record server-side.
//
// We attempt a partner lookup so the email Mike receives includes
// the partner's name and a direct link to their detail page. If the
// token is fabricated / unknown, we still render the same confirmation
// (no information leak about whether a token existed) but Mike's
// email will say "(unknown token)" and he can decide whether to
// investigate.

export const dynamic = 'force-dynamic'

export default async function ExpiredOnboardingPage({
  searchParams,
}: {
  searchParams: { ref?: string }
}) {
  const ref = searchParams.ref ?? ''
  let partnerName: string | null = null
  let partnerEmail: string | null = null

  // Look up the partner only when the ref looks plausible — a
  // 64-hex-char token. Anything else gets the generic confirmation.
  if (/^[a-f0-9]{64}$/i.test(ref)) {
    try {
      const partner = await findPartnerByMagicLinkToken(ref)
      if (partner) {
        partnerName = partner.name
        partnerEmail = partner.email
      }
    } catch {
      // Lookup failure isn't fatal — the user-facing UX is the same
      // either way.
    }
  }

  return (
    <ExpiredOnboardingClient
      refToken={ref}
      partnerName={partnerName}
      partnerEmail={partnerEmail}
    />
  )
}
