import { redirect } from 'next/navigation'
import { findPartnerByMagicLinkToken } from '@/lib/zoho'
import { isMagicLinkExpired } from '@/lib/onboarding'
import OnboardingWelcomeClient from './OnboardingWelcomeClient'

// Magic-link consumer route. Public — no Clerk gate (the token IS the
// auth). Server-side validates the token against Zoho and either:
//   - renders the welcome page + sign-up client component, OR
//   - redirects to /onboard/expired with the original token preserved
//     as ?ref= for the new-link request flow.
//
// All the Zoho work happens server-side so the client never sees a
// raw Magic_Link_Token round-trip. The client only receives the
// validated partner's email + display name.

export const dynamic = 'force-dynamic'

export default async function OnboardingWelcomePage({
  params,
}: {
  params: { token: string }
}) {
  const { token } = params

  // Cheap sanity check — token must be 64 hex chars. Anything else
  // can't possibly be a token we issued; route the user to expired
  // without consuming the Zoho lookup quota.
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
    redirect(`/onboard/expired?ref=${encodeURIComponent(token ?? '')}`)
  }

  const partner = await findPartnerByMagicLinkToken(token)

  // No partner matches → token is wrong, fabricated, or rotated.
  if (!partner) {
    redirect(`/onboard/expired?ref=${encodeURIComponent(token)}`)
  }

  // Expired by date → expired page.
  if (isMagicLinkExpired(partner.magicLinkExpiresAt)) {
    redirect(`/onboard/expired?ref=${encodeURIComponent(token)}`)
  }

  // Already used → investor has an account and should sign in instead.
  // We can't reliably check Clerk here without an additional API call,
  // but the Magic_Link_Used_At field is set when the signup route
  // completes, so it's a reliable proxy.
  if (partner.magicLinkUsedAt) {
    redirect('/portal/sign-in')
  }

  // Determine display name. Preferred_Name wins, then first token of
  // the legal Name, then a friendly fallback.
  const firstName =
    partner.preferredName ||
    (partner.name ?? '').split(' ')[0] ||
    'there'

  return (
    <OnboardingWelcomeClient
      firstName={firstName}
      email={partner.email ?? ''}
      token={token}
    />
  )
}
