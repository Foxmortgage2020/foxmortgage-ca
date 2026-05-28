import { redirect } from 'next/navigation'
import { currentUser } from '@clerk/nextjs/server'
import { getPartner } from '@/lib/zoho'
import { computeInvestorDestination } from '@/lib/onboarding'
import SignInClient from './SignInClient'

// Sign-in route — Server Component wrapper.
//
// Pre-check pattern: when an investor closes their browser without
// signing out and later returns to /portal/sign-in, Clerk's session
// is still active. The old behavior was to throw "session_exists" on
// any signIn.create() attempt; the new behavior is to detect the
// active session server-side and redirect to the user's
// stage-appropriate destination BEFORE rendering the form.
//
// Routing rules:
//   - Not signed in → render the client form (SignInClient).
//   - Signed in, role=admin → /portal/admin
//   - Signed in, role=financial-planner|fp → /portal/fp/dashboard
//   - Signed in, role=investor → computeInvestorDestination(stage),
//     which routes Active/Review Due → /portal/investor (which
//     itself redirects to /portal/investor/dashboard), Inactive →
//     /portal/investor/inactive, and everything else → the hub.
//   - Signed in, no recognized role → render the form anyway and
//     let the client's useEffect handle the signOut + re-auth path
//     (server can't signOut from a Server Component).
//
// Performance: only the investor branch incurs a Zoho roundtrip
// (one getPartner call). Sign-in is infrequent enough that this is
// acceptable; the alternative (folding stage into a signed cookie
// at sign-in time) is a future optimization, not a launch blocker.

export const dynamic = 'force-dynamic'

export default async function SignInPage() {
  const user = await currentUser()

  if (user) {
    const metadata = (user.publicMetadata ?? {}) as {
      roles?: string[] | string
      role?: string
      zoho_partner_id?: string
    }

    // Same 3-shape role normalization the rest of the portal uses.
    const roles: string[] = Array.isArray(metadata.roles)
      ? metadata.roles
      : typeof metadata.roles === 'string'
        ? [metadata.roles]
        : typeof metadata.role === 'string'
          ? [metadata.role]
          : []

    if (roles.includes('admin')) {
      redirect('/portal/admin')
    }

    if (
      roles.includes('financial-planner') ||
      roles.includes('fp')
    ) {
      redirect('/portal/fp/dashboard')
    }

    if (roles.includes('realtor')) {
      redirect('/portal/realtor/dashboard')
    }

    if (roles.includes('lawyer')) {
      redirect('/portal/lawyer/dashboard')
    }

    if (roles.includes('investor')) {
      const partnerId = metadata.zoho_partner_id
      if (partnerId) {
        const partner = await getPartner(partnerId)
        if (partner) {
          redirect(computeInvestorDestination(partner.onboardingStage))
        }
      }
      // No partner record or partner fetch failed — fall through to
      // /onboard/investor/hub as a safe default. The hub's own page
      // will re-validate and route them out if they don't belong
      // there.
      redirect('/onboard/investor/hub')
    }

    // Signed in but no recognized role. Fall through to the client
    // form; its useEffect pre-check calls signOut() so the user can
    // re-authenticate fresh. (Server Components can't trigger
    // signOut on the user's behalf.)
  }

  return <SignInClient />
}
