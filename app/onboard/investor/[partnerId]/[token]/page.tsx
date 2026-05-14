import { redirect } from 'next/navigation'
import { findPartnerByIdAndMagicLinkToken } from '@/lib/zoho'
import { isMagicLinkExpired } from '@/lib/onboarding'
import OnboardingWelcomeClient from './OnboardingWelcomeClient'

// Magic-link consumer route (canonical Path B shape).
//
// URL shape: /onboard/investor/{partnerId}/{token}
//
// The partner id is in the URL alongside the token so the server can
// do a direct GET /Partners/{id} (always immediately consistent — no
// search index involved) and constant-time compare the stored
// Magic_Link_Token to the URL token. This eliminates the false-expired
// failure mode that the prior token-only URL had when an investor
// clicked within ~5 min of the send-link POST and the click landed on
// a different lambda than the POST (search index lag, see
// schema_actual.md "Zoho API Gotchas").
//
// Pre-Path-B URLs (single-segment /onboard/investor/{token}) are
// handled by the legacy fallback at [partnerId]/page.tsx which
// 307-redirects to this canonical route.
//
// Public route — no Clerk gate. The id+token pair IS the auth.

export const dynamic = 'force-dynamic'

export default async function OnboardingWelcomePage({
  params,
}: {
  params: { partnerId: string; token: string }
}) {
  const { partnerId, token } = params

  // Cheap sanity check — partnerId is an 18-19 digit Zoho id, token is
  // 64 hex chars. Anything else can't be a URL we issued. Bail without
  // consuming a Zoho lookup. The redirect target carries both params
  // forward so /onboard/expired can still resolve the partner for
  // Mike's "request a new link" email — but only if the inputs are
  // well-formed enough to be safe to interpolate.
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

  // Direct id lookup + constant-time token compare. Returns null on
  // any of: partner missing (Zoho 404), partner has no token on file,
  // stored token doesn't match URL token. All three cases redirect to
  // /onboard/expired with no info leak about which one fired.
  const partner = await findPartnerByIdAndMagicLinkToken(partnerId, token)
  if (!partner) {
    redirect(
      `/onboard/expired?p=${encodeURIComponent(partnerId)}` +
        `&ref=${encodeURIComponent(token)}`,
    )
  }

  // Expired by date → expired page.
  if (isMagicLinkExpired(partner.magicLinkExpiresAt)) {
    redirect(
      `/onboard/expired?p=${encodeURIComponent(partnerId)}` +
        `&ref=${encodeURIComponent(token)}`,
    )
  }

  // Already used → investor has an account and should sign in instead.
  // Magic_Link_Used_At is set by the signup route on success.
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
      partnerId={partnerId}
      token={token}
    />
  )
}
