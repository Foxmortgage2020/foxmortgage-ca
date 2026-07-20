// Renewal nurture (slim band). The 150-day drip, split by how far each
// sequence has progressed. The portal read model carries entered / drafts
// minted / sent only; reply tracking and "no reply after the full sequence"
// need a workbench field that does not exist yet, so the band says so plainly
// and never invents a number. While the send build is dark, sent is zero and
// the band reads "Sends not yet live." Links to Beyond funding.

import { Band, BandLink } from '@/components/admin/today/ui'
import type { NurtureBuckets } from '@/lib/today'

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <span className="font-heading text-lg font-bold text-ink tabular-nums">{n}</span>{' '}
      <span className="font-ui text-xs text-muted">{label}</span>
    </div>
  )
}

export default function RenewalNurture({ buckets }: { buckets: NurtureBuckets }) {
  const action = <BandLink href="/portal/admin/beyond?tab=renewals">Beyond funding</BandLink>

  if (buckets.total === 0) {
    return (
      <Band title="Renewal nurture" action={action}>
        <p className="font-ui text-sm text-muted leading-relaxed">
          Funded files enter the 150-day renewal window on their own. When one does, its nurture
          progress shows here.
        </p>
      </Band>
    )
  }

  return (
    <Band
      title="Renewal nurture"
      sub={`${buckets.total} in the 150-day window`}
      action={action}
    >
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <Stat n={buckets.entered} label="entered" />
        <Stat n={buckets.draftsMinted} label="drafts ready" />
        <Stat n={buckets.sent} label="sent" />
      </div>
      <p className="mt-2.5 font-ui text-[12px] text-muted leading-relaxed">
        {buckets.sendsLive
          ? 'Reply tracking arrives with the workbench send build.'
          : 'Sends not yet live. Reply tracking arrives with the send build.'}
      </p>
    </Band>
  )
}
