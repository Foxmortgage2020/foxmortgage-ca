// Mortgage Agent client file — renders the shared, state-driven
// referral-partner client file. All logic lives in ReferralPartnerClientFile;
// only `kind` differs per portal (drives the API base + back-link).

import ReferralPartnerClientFile from '@/components/ReferralPartnerClientFile'

export default function MortgageAgentClientDetailPage({ params }: { params: { id: string } }) {
  return <ReferralPartnerClientFile kind="mortgage-agent" id={params.id} />
}
