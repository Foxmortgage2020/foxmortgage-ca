import { redirect } from 'next/navigation'
import { currentUser } from '@clerk/nextjs/server'
import { getPartner } from '@/lib/zoho'
import {
  ONBOARDING_STEPS,
  computeInvestorDestination,
  deriveCurrentStepIndex,
} from '@/lib/onboarding'
import OnboardingHubClient from './OnboardingHubClient'

// Onboarding hub. Auth-gated to Clerk users with role=investor. The
// 8-step skeleton renders here for In Progress investors; future
// commits replace the placeholder panels with real form sections.
//
// State persistence rule: ALL step state lives on the Partner record
// in Zoho (Last_Onboarding_Step + Onboarding_Stage). The hub reads
// both on each load and derives current step + render state. No
// localStorage, no sessionStorage.
//
// Stage-based routing (Path B of access control):
//   - Active / Review Due  → bounce to /portal/investor (they have
//                            access to the full investor portal; the
//                            hub is for in-flight onboarding only)
//   - Inactive             → bounce to /portal/investor/inactive
//   - Lead / Invited / In Progress / Awaiting Review / Approved / null
//                          → render the hub. The client component
//                            picks the correct UI state based on
//                            onboardingStage + lastOnboardingStep.
//
// The redirect rule is symmetric with /portal/investor/(active)/layout.tsx:
// both routes call computeInvestorDestination and only render their
// own content when it returns their own URL. Anywhere else, redirect.

export const dynamic = 'force-dynamic'

export default async function OnboardingHubPage() {
  const user = await currentUser()
  if (!user) redirect('/portal/sign-in')

  const metadata = (user.publicMetadata ?? {}) as {
    roles?: string[] | string
    role?: string
    zoho_partner_id?: string
  }

  // Same 3-shape role normalization the rest of the portal uses.
  let roles: string[] = []
  if (Array.isArray(metadata.roles)) roles = metadata.roles
  else if (typeof metadata.roles === 'string') roles = [metadata.roles]
  else if (typeof metadata.role === 'string') roles = [metadata.role]

  if (!roles.includes('investor')) {
    redirect('/portal/sign-in')
  }

  const partnerId = metadata.zoho_partner_id
  if (!partnerId) {
    // Investor account exists but isn't linked to a Partner record —
    // this should be unreachable after a clean onboarding signup, but
    // guard for it anyway.
    redirect('/portal/sign-in')
  }

  const partner = await getPartner(partnerId)
  if (!partner) {
    redirect('/portal/sign-in')
  }

  // Stage gate. If the canonical destination isn't the hub, bounce.
  const dest = computeInvestorDestination(partner.onboardingStage)
  if (dest !== '/onboard/investor/hub') {
    redirect(dest)
  }

  const firstName =
    partner.preferredName ||
    (partner.name ?? '').split(' ')[0] ||
    'there'

  const currentStepIndex = deriveCurrentStepIndex(partner.lastOnboardingStep)

  return (
    <OnboardingHubClient
      firstName={firstName}
      fullName={partner.name ?? 'Investor'}
      partnerId={partnerId}
      steps={ONBOARDING_STEPS}
      currentStepIndex={currentStepIndex}
      lastOnboardingStep={partner.lastOnboardingStep}
      onboardingStage={partner.onboardingStage}
    />
  )
}
