import { redirect } from 'next/navigation'
import { currentUser } from '@clerk/nextjs/server'
import { getPartner } from '@/lib/zoho'
import { computeInvestorDestination } from '@/lib/onboarding'

// Gate for the full investor portal.
//
// This layout wraps every page under /portal/investor/* EXCEPT the
// /inactive page (which lives outside this route group so an Inactive
// investor's redirect-target isn't itself gated, which would cause a
// redirect loop).
//
// Enforcement:
//   1. Must be signed in (Clerk session present).
//   2. Must have role=investor in publicMetadata.
//   3. Must have a Zoho partner record on file.
//   4. Onboarding_Stage MUST be Active or Review Due. Anything else
//      bounces to the stage-appropriate destination (the hub for
//      In Progress / Awaiting Review / Approved; the inactive page
//      for Inactive).
//
// Why a layout instead of middleware: the stage check requires a Zoho
// roundtrip, and middleware running at the edge can't reliably fetch
// Zoho. Layouts run server-side per request, which is the right
// granularity for this check.
//
// Performance note: every page load in the active portal incurs one
// getPartner() roundtrip (typically 200-500ms against Zoho's v2 API).
// The downstream portal pages also fetch partner data via their own
// API routes — see TODO in the future to either cache the partner
// at the layout level via React's cache() or fold the stage check
// into a signed session cookie set on sign-in.

export const dynamic = 'force-dynamic'

export default async function InvestorPortalGate({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await currentUser()
  if (!user) redirect('/portal/sign-in')

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

  // Admin bypass. Admins access investor portal routes via two paths:
  //   1. Impersonating a specific partner — the cookie is set, downstream
  //      pages use getPortalContext().effectivePartnerId to fetch
  //      per-partner data.
  //   2. Direct nav for inspection/support — they see whatever the page
  //      renders without partner context (pre-ec186d4 behavior).
  // The actor's literal Clerk role is `admin`, not `investor`, so the
  // stage gate below would falsely bounce them to /portal → /portal/admin.
  // This bypass restores pre-ec186d4 admin access without weakening the
  // gate for non-admin investors.
  if (roles.includes('admin')) {
    return <>{children}</>
  }

  if (!roles.includes('investor')) {
    // Not an investor — they don't belong here. Send them to /portal
    // for role-based routing.
    redirect('/portal')
  }

  const partnerId = metadata.zoho_partner_id
  if (!partnerId) {
    // Investor account exists in Clerk but isn't linked to a Partner
    // record — this should be unreachable after a clean onboarding
    // signup, but guard for it anyway.
    redirect('/portal/sign-in')
  }

  const partner = await getPartner(partnerId)
  if (!partner) {
    redirect('/portal/sign-in')
  }

  // Stage gate: if computeInvestorDestination says they belong
  // somewhere OTHER than /portal/investor, redirect there. The
  // returned URL is the same string we'd land on from sign-in, so
  // the routing logic is consistent across entry points.
  const dest = computeInvestorDestination(partner.onboardingStage)
  if (dest !== '/portal/investor') {
    redirect(dest)
  }

  return <>{children}</>
}
