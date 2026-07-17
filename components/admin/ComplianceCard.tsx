// Per-file compliance card (Session 6): assembled ONLY from granted
// workbench data the deal room already reads. The posture summary is
// computed by the pure rule in lib/compliance-logic.ts and the rule is
// stated verbatim in the tooltip; fields the workbench does not capture
// yet render as honest gaps and never count toward clear. Server
// component, render-only.
//
// Suitability documentation (Part 4): an active client constraint that
// carries a reason AND a quantified cost is a documented suitability
// assessment. Passed in as the optional `constraint` prop, it renders a
// "Documented suitability" block, drops the suitability line from the
// uncaptured-gap list, and lets an otherwise gaps-unrecorded file read
// clear. It never overrides the attention rule.

import Link from 'next/link'
import {
  POSTURE_LABEL,
  POSTURE_RULE,
  compliancePosture,
  isComplianceCategory,
  workbenchGapFields,
} from '@/lib/compliance-logic'
import { CONSTRAINT_LABEL, type ConstraintType } from '@/lib/constraints'
import type { DealConditionRow, DealFlagRow } from '@/lib/underwriting'
import { fmtDateTime, fmtShortDate } from '@/lib/dates'

const label = (s: string) => s.replace(/_/g, ' ')

function Chip({ tone, children }: { tone: 'green' | 'amber' | 'red' | 'gray' | 'navy'; children: React.ReactNode }) {
  const cls = {
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-700',
    gray: 'bg-gray-100 text-gray-600',
    navy: 'bg-navy/10 text-navy',
  }[tone]
  return <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{children}</span>
}

export default function ComplianceCard({
  stage,
  status,
  conditions,
  flags,
  todayYMD,
  constraint = null,
}: {
  stage: string | null
  status: string
  conditions: DealConditionRow[]
  flags: DealFlagRow[]
  todayYMD: string
  /** The active client constraint with its cost, passed by the deal room. A
   * reason plus a cost sentence make it a documented suitability assessment. */
  constraint?: {
    type: ConstraintType
    lenderLabel: string
    reason: string
    costSentence: string
    actingEmail: string
    createdAt: string
  } | null
}) {
  const complianceFlags = flags.filter(f => f.kind === 'compliance_gap')
  const openComplianceFlags = complianceFlags.filter(f => f.status === 'open')
  const complianceConds = conditions.filter(c => isComplianceCategory(c.category))
  const isOpenCond = (c: DealConditionRow) => c.status !== 'satisfied' && c.status !== 'waived'
  const overdueComplianceConds = complianceConds.filter(
    c => isOpenCond(c) && c.dueDate !== null && c.dueDate < todayYMD,
  )
  const documentedSuitability = Boolean(constraint && constraint.reason && constraint.costSentence)
  const posture = compliancePosture({
    openComplianceFlags: openComplianceFlags.length,
    overdueComplianceConditions: overdueComplianceConds.length,
    hasAnyRecorded: conditions.length > 0 || flags.length > 0,
    documentedSuitability,
  })

  const prechecked = conditions.filter(c => c.precheckStatus !== null)
  const precheckCounts = prechecked.reduce<Record<string, number>>((acc, c) => {
    acc[c.precheckStatus!] = (acc[c.precheckStatus!] ?? 0) + 1
    return acc
  }, {})

  const byCategory = new Map<string, DealConditionRow[]>()
  for (const c of complianceConds) {
    const key = c.category ?? 'uncategorized'
    if (!byCategory.has(key)) byCategory.set(key, [])
    byCategory.get(key)!.push(c)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5" data-testid="compliance-card">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h2 className="font-heading text-navy font-bold text-base">Compliance</h2>
        <span
          title={POSTURE_RULE}
          aria-label={POSTURE_RULE}
          className={`cursor-help inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
            posture === 'attention'
              ? 'bg-amber-100 text-amber-900'
              : posture === 'clear'
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-600'
          }`}
          data-testid="compliance-posture"
        >
          {POSTURE_LABEL[posture]}
          <span aria-hidden className="opacity-60">&#9432;</span>
        </span>
        <Link
          href="/portal/admin/compliance"
          className="ml-auto text-xs font-semibold text-navy underline hover:text-ink"
        >
          Compliance module
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 text-xs font-body">
        {stage && <Chip tone="gray">stage: {label(stage)}</Chip>}
        <Chip tone={status === 'active' ? 'green' : 'gray'}>{status}</Chip>
        {prechecked.length > 0 ? (
          <Chip tone="navy">
            system precheck on {prechecked.length} condition{prechecked.length === 1 ? '' : 's'}:{' '}
            {Object.entries(precheckCounts)
              .map(([k, v]) => `${label(k)} ${v}`)
              .join(', ')}
          </Chip>
        ) : (
          <Chip tone="gray">no system prechecks recorded</Chip>
        )}
      </div>

      {/* Compliance-class flags with disposition history */}
      <div className="mt-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Compliance flags</h3>
        {complianceFlags.length === 0 ? (
          <p className="text-sm text-gray-400 font-body mt-1">No compliance_gap flags raised on this file.</p>
        ) : (
          <div className="mt-1.5 space-y-1.5">
            {complianceFlags.map(f => (
              <div key={f.id} className="text-sm font-body">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={f.severity === 'high' ? 'red' : f.severity === 'warning' ? 'amber' : 'gray'}>
                    {f.severity}
                  </Chip>
                  <Chip tone={f.status === 'open' ? 'amber' : 'green'}>{f.status}</Chip>
                  <span className="text-[11px] text-gray-400">raised {fmtDateTime(f.createdAt)}</span>
                </div>
                {f.status !== 'open' && f.resolution && (
                  <p className="text-xs text-gray-600 mt-0.5">
                    dispositioned {f.resolution}
                    {f.resolvedAt ? ` ${fmtDateTime(f.resolvedAt)}` : ''}
                    {f.reason ? `: ${f.reason}` : ''}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Compliance-bearing conditions, grouped by the stored category */}
      <div className="mt-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Compliance-bearing conditions (solicitor, borrower execution)
        </h3>
        {complianceConds.length === 0 ? (
          <p className="text-sm text-gray-400 font-body mt-1">
            No conditions in the compliance-bearing categories on this file.
          </p>
        ) : (
          <div className="mt-1.5 space-y-2">
            {Array.from(byCategory.entries()).map(([cat, rows]) => (
              <div key={cat}>
                <p className="text-xs font-semibold text-navy font-body capitalize">{label(cat)}</p>
                <div className="mt-0.5 space-y-1">
                  {rows.map(c => {
                    const overdue = isOpenCond(c) && c.dueDate !== null && c.dueDate < todayYMD
                    return (
                      <div key={c.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm font-body">
                        <Chip
                          tone={
                            c.status === 'satisfied' || c.status === 'waived'
                              ? 'green'
                              : overdue
                                ? 'red'
                                : 'amber'
                          }
                        >
                          {label(c.status)}
                          {overdue ? ', overdue' : ''}
                        </Chip>
                        <span className="text-gray-700 min-w-0">{c.text}</span>
                        {c.dueDate && <span className="text-[11px] text-gray-400">due {fmtShortDate(c.dueDate)}</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-gray-400 font-body mt-1.5">
          The full condition list with decision controls is in the Conditions section below.
        </p>
      </div>

      {/* Documented suitability: a constraint with a reason and a cost is a
          recorded compliance asset, not a gap */}
      {documentedSuitability && constraint && (
        <div
          className="mt-3 bg-green-50 border border-green-100 rounded-lg px-3 py-2.5"
          data-testid="documented-suitability"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="green">Documented suitability</Chip>
            <span className="text-xs font-semibold text-navy font-body">
              {CONSTRAINT_LABEL[constraint.type]}: {constraint.lenderLabel}
            </span>
          </div>
          <p className="text-sm text-gray-700 font-body mt-1.5">{constraint.reason}</p>
          <p className="text-xs text-gray-600 font-body mt-1">{constraint.costSentence}</p>
          <p className="text-[11px] text-gray-400 font-body mt-1">
            Recorded by {constraint.actingEmail} {fmtDateTime(constraint.createdAt)}
          </p>
        </div>
      )}

      {/* Honest gaps: never fabricated from adjacent data */}
      <div className="mt-3 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
        <p className="text-xs font-semibold text-gray-500 font-body">Not yet captured by the workbench</p>
        <p className="text-xs text-gray-500 font-body mt-1">
          {workbenchGapFields(documentedSuitability).join('; ')}. These render as gaps rather than guesses
          and never count toward a clear posture.
        </p>
      </div>
    </div>
  )
}
