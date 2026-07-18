// The per-deal client-comms card (B7-P Task 3). A quiet, read-only view of what
// the practice has said to this client and what is queued: sent touches with
// dates and kinds, pending drafts (linked to the Approvals comms queue), and
// the suppression state if the client unsubscribed. Nothing is decided here.

import Link from 'next/link'
import type { CommsTimeline, CommsTimelineTouch } from '@/lib/underwriting'
import { COMMS_KIND_LABEL, commsTouchLabel } from '@/lib/comms'
import { fmtShortDate } from '@/lib/dates'

function TouchLine({ touch }: { touch: CommsTimelineTouch }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="font-ui text-sm text-cool-700">
        {commsTouchLabel(touch.skeletonId)}
        <span className="ml-2 text-xs text-cool-400">{COMMS_KIND_LABEL[touch.touchKind]}</span>
      </span>
      <span className="shrink-0 font-ui text-xs tabular-nums text-cool-500">
        {touch.sentAt ? fmtShortDate(touch.sentAt) : touch.scheduledFor ?? ''}
      </span>
    </li>
  )
}

export default function DealCommsCard({ timeline }: { timeline: CommsTimeline }) {
  const { hasSequences, sent, pending, suppression } = timeline

  if (suppression) {
    return (
      <div className="rounded-[9px] border border-amber-200 bg-amber-50 p-4">
        <p className="font-ui text-sm font-semibold text-amber-900">This client has unsubscribed.</p>
        <p className="mt-1 font-ui text-xs text-amber-800">
          They opted out on {fmtShortDate(suppression.suppressedAt)} ({suppression.reason}). No client
          comms will be sent to them, and by law this cannot be undone from the portal.
        </p>
        {sent.length > 0 && (
          <ul className="mt-3 divide-y divide-amber-200/60">
            {sent.map((t, i) => <TouchLine key={i} touch={t} />)}
          </ul>
        )}
      </div>
    )
  }

  if (!hasSequences || (sent.length === 0 && pending.length === 0)) {
    return (
      <p className="font-ui text-sm text-cool-500">
        No client messages have been queued for this file yet.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {sent.length > 0 && (
        <div>
          <p className="font-heading text-[11px] font-semibold uppercase tracking-[0.05em] text-cool-500">
            Sent
          </p>
          <ul className="mt-1 divide-y divide-cool-100">
            {sent.map((t, i) => <TouchLine key={i} touch={t} />)}
          </ul>
        </div>
      )}

      {pending.length > 0 && (
        <div>
          <p className="font-heading text-[11px] font-semibold uppercase tracking-[0.05em] text-cool-500">
            Waiting on your approval
          </p>
          <ul className="mt-1 divide-y divide-cool-100">
            {pending.map((t, i) => <TouchLine key={i} touch={t} />)}
          </ul>
          <Link
            href="/portal/admin/approvals?tab=comms"
            className="mt-2 inline-block font-ui text-xs font-semibold text-navy underline hover:text-ink"
          >
            Review in the comms queue
          </Link>
        </div>
      )}
    </div>
  )
}
