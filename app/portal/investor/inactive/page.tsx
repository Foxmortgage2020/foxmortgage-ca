import { redirect } from 'next/navigation'
import { currentUser } from '@clerk/nextjs/server'
import { getPartner } from '@/lib/zoho'
import { getPortalContext } from '@/lib/auth'
import InactiveClient from './InactiveClient'

// Inactive investor landing page.
//
// Shown when an investor's Onboarding_Stage = Inactive. They reached
// this page from one of:
//   - Sign-in pre-check (server-side redirect from the sign-in route)
//   - The /portal/investor/(active)/layout.tsx gate bouncing them out
//   - A direct nav / bookmark to /portal/investor/inactive
//
// This page lives OUTSIDE the (active) route group so the gate at
// (active)/layout.tsx doesn't apply here — that gate redirects
// Inactive users to this page, and gating this page too would
// produce a redirect loop.
//
// The page itself enforces "must be signed in as an investor whose
// stage actually is Inactive". An Active investor who hits this URL
// gets bounced back to the active portal; a non-investor gets
// bounced to /portal for role routing. This keeps the UX honest:
// you can't see the "inactive" copy unless that's actually your
// state.

export const dynamic = 'force-dynamic'

export default async function InactiveInvestorPage() {
  const user = await currentUser()
  if (!user) redirect('/portal/sign-in')

  const metadata = (user.publicMetadata ?? {}) as {
    roles?: string[] | string
    role?: string
    zoho_partner_id?: string
  }
  const roles: string[] = Array.isArray(metadata.roles)
    ? metadata.roles
    : typeof metadata.roles === 'string'
      ? [metadata.roles]
      : typeof metadata.role === 'string'
        ? [metadata.role]
        : []

  // Admin bypass — symmetric with the (active)/layout.tsx bypass. An
  // admin may need to view the inactive screen for support purposes
  // (typically arriving via impersonation of an Inactive investor).
  // When impersonating, getPortalContext's effectivePartnerId points
  // at the impersonated partner so we can show their name in the
  // page header. When NOT impersonating, fall back to a generic
  // "Investor" label since admin has no partner record of their own.
  if (roles.includes('admin')) {
    const ctx = await getPortalContext()
    let displayName = 'Investor'
    if (ctx?.impersonation?.partnerName) {
      displayName = ctx.impersonation.partnerName
    } else if (ctx?.effectivePartnerId) {
      const partner = await getPartner(ctx.effectivePartnerId)
      if (partner?.name) displayName = partner.name
    }
    return <InactiveClient fullName={displayName} />
  }

  if (!roles.includes('investor')) redirect('/portal')

  const partnerId = metadata.zoho_partner_id
  if (!partnerId) redirect('/portal/sign-in')

  const partner = await getPartner(partnerId)
  if (!partner) redirect('/portal/sign-in')

  // Honesty check: only Inactive investors should see this copy. If
  // they're somehow Active / Awaiting Review / etc., bounce them to
  // their correct destination instead of showing misleading content.
  if (partner.onboardingStage !== 'Inactive') {
    // Re-use the canonical resolver so the redirect target matches
    // wherever they'd have landed via sign-in.
    const dest =
      partner.onboardingStage === 'Active' ||
      partner.onboardingStage === 'Review Due'
        ? '/portal/investor'
        : '/onboard/investor/hub'
    redirect(dest)
  }

  return <InactiveClient fullName={partner.name ?? 'Investor'} />
}
