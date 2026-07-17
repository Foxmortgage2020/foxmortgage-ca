import ExpiredOnboardingClient from './ExpiredOnboardingClient'

// Public route. Shown when the canonical /onboard/investor/{partnerId}/{token}
// route (or the legacy /onboard/investor/{token} fallback) determines the
// link is invalid, expired, or otherwise unusable.
//
// Accepts two query-string shapes, both forwarded verbatim to the
// request-a-new-link API and deliberately NOT resolved here:
//   - Path B canonical: ?p={partnerId}&ref={token}
//   - Legacy fallback:  ?ref={token}
//
// SECURITY (fixed 2026-07-17, B5). This page used to resolve the partner
// server-side from the `p` query param and render "Linked to {name}
// ({email})". That param is visitor-controlled and only shape-checked
// (^\d{15,19}$), and this route is PUBLIC — so anyone could walk the Zoho
// partner id space (an org prefix plus a short sequence, not a random
// 19-digit space) and harvest partner names and emails one request at a
// time. The old comment called it "never as a leak channel" because the
// value was resolved server-side; that reasoning missed that the VISITOR
// chooses which record gets resolved.
//
// Nothing is lost by removing it. The lookup existed only to feed that one
// cosmetic line, and Mike's notification email is built independently by
// /api/onboard/request-new-link, which resolves the partner from the same
// params server-side. The page renders the identical confirmation either
// way — which was always the intent: no signal about whether a partner or a
// token exists.

export const dynamic = 'force-dynamic'

export default function ExpiredOnboardingPage({
  searchParams,
}: {
  searchParams: { p?: string; ref?: string }
}) {
  return (
    <ExpiredOnboardingClient
      partnerIdParam={searchParams.p ?? ''}
      refToken={searchParams.ref ?? ''}
    />
  )
}
