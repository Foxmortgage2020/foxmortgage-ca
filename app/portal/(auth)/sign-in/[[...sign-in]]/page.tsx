import { redirect } from 'next/navigation'
import { currentUser } from '@clerk/nextjs/server'
import { getPartner } from '@/lib/zoho'
import { computeInvestorDestination } from '@/lib/onboarding'
import { PARTNER_TYPE_CONFIGS } from '@/lib/partner-types'
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
//   - Signed in, no recognized role → render the client component,
//     which shows an "access pending" card (it does NOT bounce them to
//     the public home). The server can't signOut from a Server
//     Component, so this safe-fallback decision lives client-side.
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

    // Partner dashboard paths come from PARTNER_TYPE_CONFIGS so this
    // server gate can never drift from lib/partner-types.ts.
    if (roles.includes('financial-planner') || roles.includes('fp')) {
      redirect(PARTNER_TYPE_CONFIGS.fp.portalDashboard)
    }

    if (roles.includes('realtor')) {
      redirect(PARTNER_TYPE_CONFIGS.realtor.portalDashboard)
    }

    if (roles.includes('lawyer')) {
      redirect(PARTNER_TYPE_CONFIGS.lawyer.portalDashboard)
    }

    if (roles.includes('mortgage_agent')) {
      redirect(PARTNER_TYPE_CONFIGS.mortgage_agent.portalDashboard)
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

    // Signed in but no recognized partner role. Fall through to the
    // client component, whose useEffect pre-check renders an "access
    // pending" card (with a manual sign-out option) instead of bouncing
    // the user to the public home. A valid partner is matched by one of
    // the role checks above, so reaching here means the account genuinely
    // has no portal role yet.
  }

  return <SignInClient />
}
