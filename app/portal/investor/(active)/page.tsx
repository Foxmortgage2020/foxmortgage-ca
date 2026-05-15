import { redirect } from 'next/navigation'

// /portal/investor canonical entry point.
//
// computeInvestorDestination returns "/portal/investor" for Active and
// Review Due stages, so this is where they land after sign-in. We
// immediately redirect to /portal/investor/dashboard which is the
// actual home of the active investor portal. The dashboard contains
// the KPIs, deals table, and recent activity that "/portal/investor"
// implies as a concept.
//
// The (active)/layout.tsx gate above us has already verified the user
// is an Active / Review Due investor by the time this redirect fires.
export const dynamic = 'force-dynamic'

export default function InvestorPortalRoot() {
  redirect('/portal/investor/dashboard')
}
