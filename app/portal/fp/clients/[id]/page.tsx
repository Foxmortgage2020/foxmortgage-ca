// Financial-planner client file — renders the shared, state-driven
// referral-partner client file. All logic lives in ReferralPartnerClientFile;
// only `kind` differs per portal (drives the API base + back-link).

import ReferralPartnerClientFile from '@/components/ReferralPartnerClientFile'

export default function FPClientDetailPage({ params }: { params: { id: string } }) {
  return <ReferralPartnerClientFile kind="fp" id={params.id} />
}
