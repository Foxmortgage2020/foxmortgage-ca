// The Commitment tab (handoff 45) — the uploader and the committed-terms card.
//
// REUSE, NOT A FORK. Both are the deal room's own components, rendered here
// unchanged: same gate proxies, same permission keys, same browser-minted token
// path. The routes are keyed on record ids rather than pages, so nothing needed
// duplicating.
//
// THE PROVENANCE RENDERING IS NOT DECORATION and survives the move intact
// because the card itself is untouched: the printed string is always the value,
// `value_numeric` renders nowhere, and the maturity keeps its "reads as
// 6 October 2031 (2031-10-06) · day-month-year" second line with the stored
// basis. A decision on evidence is not a decision on a summary.
//
// IRREVERSIBILITY, REPORTED NOT CHANGED. Approving the ten terms is one-way and
// so is rejecting — the gate moves only pending rows and no reverse verb exists
// anywhere in the system, so reject is not the cautious option. The card as it
// stands carries NO copy saying so, on the button or anywhere else. That is
// carried across exactly as it is rather than edited here, because changing the
// wording would change it in the deal room too. Proposed wording is in the
// session report for Michael to accept before anyone edits the card.

import CommitmentTermsCard from '@/components/admin/CommitmentTermsCard'
import CommitmentUploader from '@/components/admin/CommitmentUploader'
import type { TermGroup } from '@/lib/commitment-terms'

export default function FileCommitment({
  roomId,
  groups,
  canDecideTerms,
  canUpload,
  hasRealCommitment,
  demo,
  notGranted,
}: {
  roomId: string | null
  groups: TermGroup[]
  canDecideTerms: boolean
  canUpload: boolean
  hasRealCommitment: boolean
  demo: boolean
  notGranted: boolean
}) {
  if (!roomId) {
    return (
      <section
        data-testid="beta-file-commitment-noroom"
        className="mt-4 rounded-[9px] border border-cool-200 bg-white p-5"
      >
        <h2 className="font-heading text-sm font-semibold text-navy">Commitment</h2>
        <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-cool-600 font-ui">
          The lender’s offer appears here once it arrives, with the ten committed terms read off it
          for approval.
        </p>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-cool-600 font-ui">
          This file has no underwriting room yet, so there is nowhere to upload a commitment to. It
          is in the record layer but has never been opened for underwriting.
        </p>
      </section>
    )
  }

  return (
    <div className="mt-4 space-y-4" data-testid="beta-file-commitment">
      {/* Every empty state that instructs an action carries the control inline.
          A retired synthetic or rejected commitment never counts as a real one
          (guardrail 20), so it can never suppress the upload control. */}
      {canUpload && (
        <section className="rounded-[9px] border border-cool-200 bg-white p-4">
          <CommitmentUploader
            dealId={roomId}
            kind={hasRealCommitment ? 'amendment' : 'commitment'}
            title={hasRealCommitment ? 'Upload an amendment' : 'Upload the commitment'}
            hint={
              hasRealCommitment
                ? 'If the lender revised the commitment, drop the amendment here. It supersedes the current condition set on approval.'
                : 'No lender commitment is on file yet. Drop it here to draft the checklist and read the committed terms.'
            }
            compact
          />
        </section>
      )}

      <section>
        <h2 className="font-heading text-sm font-semibold text-navy">Committed terms</h2>
        <div className="mt-2">
          {notGranted ? (
            <p className="rounded-[9px] border border-amber-200 bg-amber-50 p-4 text-sm font-ui text-amber-800">
              Committed terms are outside the portal’s read grant on the workbench.
            </p>
          ) : (
            <CommitmentTermsCard groups={groups} canDecide={canDecideTerms} demo={demo} />
          )}
        </div>
      </section>
    </div>
  )
}
