// The Conditions tab (handoff 45).
//
// REUSE, NOT A FORK. This renders the deal room's own ConditionsChecklist —
// the same component, the same gate proxies, the same permission keys, the same
// browser-minted token path. The gate routes are keyed on record ids rather
// than pages, so nothing needed duplicating. Two surfaces reading the same rows
// is the intended state during the move; a second card would be two things to
// fix for every future bug.
//
// IT READS `public.conditions`, NEVER `rec.conditions`. The record layer's
// table has no `gate_status` column at all (Postgres answers 42703 on the
// filter), so a tab reading it would show an ungated population with no way to
// tell a live condition from a retired one — rebuilding the exact defect
// handoff 44 removed from Today, on a brand new surface. The decisions, the
// audit trail and the supersession history all live in `public.conditions`.
//
// Keyed on the workbench deal id from resolveRoom. A file with no room gets the
// honest empty state; no room is ever invented.

import Link from 'next/link'
import type { ReactNode } from 'react'
import ConditionsChecklist from '@/components/admin/ConditionsChecklist'
import type { DealConditionRow, PendingCommitmentCondition } from '@/lib/underwriting'

/** THE EMPTY STATE MUST SAY WHICH OF TWO SITUATIONS THE READER IS IN
 *  (handoff 54). Zero conditions with NO commitment on file means upload one.
 *  Zero conditions WITH a real commitment on file means the extraction
 *  failed, and the old sentence's "upload the commitment" sent Michael toward
 *  a second document and a second extraction — the churn that left one file
 *  carrying 157 rows. The failed-extraction variant points at the re-extract
 *  control instead and says plainly not to upload again. Keyed on
 *  hasRealCommitment, which is computed on document provenance, so a retired
 *  synthetic or rejected upload can never put a file in the wrong branch
 *  (guardrail 20). */
function emptyStateFor(hasRealCommitment: boolean): ReactNode {
  if (!hasRealCommitment) {
    return (
      <p className="text-sm text-cool-500 font-ui" data-testid="beta-conditions-empty-nocommitment">
        No conditions on this file yet, because no lender commitment is on file. Upload the
        commitment below to draft the checklist, or add a condition by hand above.
      </p>
    )
  }
  return (
    <div
      className="max-w-prose rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5"
      data-testid="beta-conditions-empty-failed"
    >
      <p className="text-sm font-ui text-amber-900">
        The commitment is on file and its terms are extracted, but no conditions were ever
        drafted, which means the condition extraction failed. Re-run it from the{' '}
        <Link href="?tab=commitment" className="font-semibold underline underline-offset-2">
          Commitment tab
        </Link>
        , where the preview shows the checklist it would draft before anything is written.
      </p>
      <p className="mt-1.5 text-sm font-ui text-amber-900">
        Do not upload the commitment again. A second upload creates a second document and a
        second extraction on the same file.
      </p>
    </div>
  )
}

export default function FileConditions({
  roomId,
  approved,
  pending,
  borrowers,
  canDecide,
  canWaive,
  canRecompute,
  canUpload,
  hasRealCommitment,
  todayYMD,
  userId,
  notGranted,
}: {
  /** The workbench deal id, or null when this rec file has no room. */
  roomId: string | null
  approved: DealConditionRow[]
  pending: PendingCommitmentCondition[]
  borrowers: { id: string; fullName: string }[]
  canDecide: boolean
  canWaive: boolean
  canRecompute: boolean
  canUpload: boolean
  hasRealCommitment: boolean
  todayYMD: string
  userId: string
  /** True when the workbench refused the read (403), as distinct from a file
   *  that simply has no conditions. */
  notGranted: boolean
}) {
  if (!roomId) {
    return (
      <section
        data-testid="beta-file-conditions-noroom"
        className="mt-4 rounded-[9px] border border-cool-200 bg-white p-5"
      >
        <h2 className="font-heading text-sm font-semibold text-navy">Conditions</h2>
        <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-cool-600 font-ui">
          Conditions appear here once the lender sends the commitment and the file is opened for
          underwriting.
        </p>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-cool-600 font-ui">
          This file has no underwriting room yet, so there are no conditions to read. It is in the
          record layer but has never been opened for underwriting.
        </p>
      </section>
    )
  }

  if (notGranted) {
    return (
      <section className="mt-4 rounded-[9px] border border-amber-200 bg-amber-50 p-5">
        <p className="text-sm font-ui text-amber-800">
          Conditions are outside the portal’s read grant on the workbench.
        </p>
      </section>
    )
  }

  const open = approved.filter(c => c.status !== 'satisfied' && c.status !== 'waived').length

  return (
    <section className="mt-4" data-testid="beta-file-conditions">
      <h2 className="font-heading text-sm font-semibold text-navy">
        Conditions ({open} open of {approved.length})
      </h2>
      <div className="mt-3">
        <ConditionsChecklist
          dealId={roomId}
          pending={pending}
          approved={approved}
          borrowers={borrowers}
          canDecide={canDecide}
          canWaive={canWaive}
          canRecompute={canRecompute}
          canUpload={canUpload}
          hasRealCommitment={hasRealCommitment}
          todayYMD={todayYMD}
          userId={userId}
          emptyState={emptyStateFor(hasRealCommitment)}
        />
      </div>
    </section>
  )
}
