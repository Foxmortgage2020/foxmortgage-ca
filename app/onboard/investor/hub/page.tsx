import { redirect } from 'next/navigation'
import { currentUser } from '@clerk/nextjs/server'
import { getPartner } from '@/lib/zoho'
import { ONBOARDING_STEPS, deriveCurrentStepIndex } from '@/lib/onboarding'
import OnboardingHubClient from './OnboardingHubClient'

// Onboarding hub. Auth-gated to Clerk users with role=investor. The
// 8-step skeleton renders here in Commit 1; future commits replace
// the placeholder panels with real form sections.
//
// State persistence rule: ALL step state lives on the Partner record
// in Zoho (Last_Onboarding_Step field). The hub reads it on each
// load and derives current step + completed steps. No localStorage,
// no sessionStorage.

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
    />
  )
}
