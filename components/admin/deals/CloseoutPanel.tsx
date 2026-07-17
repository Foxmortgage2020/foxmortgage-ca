// The Complete-and-paid panel (B2b, Task 6) — READ ONLY. The compliance
// package state comes from the Zoho Compliance_Status picklist (the one
// field this session adds to a read); Paid reads the commission truth the
// Revenue surface already uses (Total_Commission > 0 is the actual, 0 means
// not recorded). Nothing here writes anywhere.
//
// The workbench package checker's per-deal wiring is a NAMED capability
// placeholder — gray, what it will be, what it waits on. Never a faked
// checklist state, never lime.

import type { ComplianceState } from '@/lib/deals-surface'
import { fmtMoney } from '@/lib/dates'

const STATE_CHIP: Record<ComplianceState, { label: string; cls: string }> = {
  not_started: { label: 'Not started', cls: 'bg-cool-100 text-cool-700' },
  under_review: { label: 'Under review', cls: 'bg-navy text-white' },
  approved: { label: 'Approved', cls: 'bg-green-100 text-green-700' },
  rejected: { label: 'Came back', cls: 'bg-caution-bg text-caution' },
  unread: { label: 'Not read', cls: 'bg-cool-100 text-cool-500' },
}

function complianceCopy(state: ComplianceState, raw: string | null, hasZohoLink: boolean): string {
  switch (state) {
    case 'not_started':
      return 'Not started. Assemble the package per the BRX Ontario checklist and submit it with the compliance submission skill, by hand today.'
    case 'under_review':
      return `The package is with compliance. Zoho reads "${raw}".`
    case 'approved':
      return 'The compliance package is approved.'
    case 'rejected':
      return `The package came back as "${raw}". Fix it and submit it again.`
    case 'unread':
      return hasZohoLink
        ? 'The compliance status could not be read from Zoho right now.'
        : 'No linked Zoho record, so the compliance status cannot be read.'
  }
}

export default function CloseoutPanel({
  state,
  rawStatus,
  hasZohoLink,
  totalCommission,
}: {
  state: ComplianceState
  rawStatus: string | null
  hasZohoLink: boolean
  totalCommission: number | null
}) {
  const chip = STATE_CHIP[state]
  return (
    <div className="space-y-3">
      {/* The compliance package, read-only */}
      <div
        className={`rounded-lg border px-4 py-3 ${
          state === 'rejected' ? 'border-caution/40 bg-caution-bg' : 'border-cool-200 bg-white'
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-heading text-[13px] font-semibold text-navy">Compliance package</p>
          <span className={`rounded-full px-2 py-0.5 font-ui text-[11px] font-semibold ${chip.cls}`}>
            {state === 'under_review' && rawStatus ? rawStatus : chip.label}
          </span>
        </div>
        <p className={`mt-1.5 font-ui text-[13px] ${state === 'rejected' ? 'text-caution' : 'text-cool-700'}`}>
          {complianceCopy(state, rawStatus, hasZohoLink)}
        </p>
      </div>

      {/* Paid: the commission truth, or the quiet not-yet */}
      <div className="rounded-lg border border-cool-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-heading text-[13px] font-semibold text-navy">Paid</p>
          {totalCommission !== null ? (
            <span className="rounded-full bg-green-100 px-2 py-0.5 font-ui text-[11px] font-semibold text-green-700 tabular-nums">
              {fmtMoney(totalCommission)} recorded
            </span>
          ) : (
            <span className="rounded-full bg-cool-100 px-2 py-0.5 font-ui text-[11px] font-semibold text-cool-500">
              not recorded yet
            </span>
          )}
        </div>
        <p className="mt-1.5 font-ui text-[13px] text-cool-700">
          {totalCommission !== null
            ? 'The commission is recorded in Zoho. Revenue reads the same figure.'
            : 'No commission is recorded in Zoho yet. The figure lands here the day it is.'}
        </p>
      </div>

      {/* Named capability placeholder: the package checker */}
      <div className="rounded-lg border border-dashed border-cool-300 px-4 py-3">
        <p className="font-ui text-xs font-semibold text-cool-700">Package completeness check is coming</p>
        <p className="mt-1 font-ui text-[11.5px] leading-relaxed text-cool-500">
          The workbench package checker will read this file against the BRX Ontario checklist and
          say what is missing. It waits on its per-deal wiring.
        </p>
      </div>
    </div>
  )
}
