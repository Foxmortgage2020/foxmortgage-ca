// Approvals — stub this session, but the pending counts are live through
// the read-only workbench wiring. Decisions (approve / reject / hold) land
// in Session 3 through the fox-underwriting gates API.

import Link from 'next/link'
import StubPage from '@/components/admin/StubPage'
import { requirePermission } from '@/lib/authz'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import {
  getAgentIdByEmail,
  getDealsSummary,
  getPendingSheetReviews,
  getPendingStatementReviews,
  getShadowTally,
} from '@/lib/underwriting'
import { fmtDateTime, fmtShortDate } from '@/lib/dates'

export const dynamic = 'force-dynamic'

export default async function ApprovalsPage() {
  await requirePermission('approvals.view')

  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  const agentId = agentRes.configured && agentRes.ok ? agentRes.data : null

  let body: React.ReactNode
  if (!agentRes.configured) {
    body = (
      <div className="mt-6 bg-white border border-gray-200 rounded-xl p-5">
        <p className="text-sm text-gray-500 font-body">
          Workbench not connected. Pending counts appear here once UW_SUPABASE_URL and
          UW_SUPABASE_SERVICE_ROLE_KEY are set.
        </p>
      </div>
    )
  } else if (!agentId) {
    body = (
      <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-5">
        <p className="text-sm text-amber-800 font-body">
          Workbench is configured but not answering. See{' '}
          <Link href="/portal/admin/status" className="underline">
            Status
          </Link>{' '}
          for details.
        </p>
      </div>
    )
  } else {
    const [stmtsR, sheetsR, shadowR, wbDealsR] = await Promise.all([
      getPendingStatementReviews(agentId),
      getPendingSheetReviews(agentId),
      getShadowTally(agentId),
      getDealsSummary(agentId),
    ])
    const stmts = stmtsR.configured && stmtsR.ok ? stmtsR.data : []
    const sheets = sheetsR.configured && sheetsR.ok ? sheetsR.data : []
    const shadow = shadowR.configured && shadowR.ok ? shadowR.data : null
    const wbDeals = wbDealsR.configured && wbDealsR.ok ? wbDealsR.data : []
    const shadowDue = shadow
      ? wbDeals.filter(d => d.status === 'active' && !shadow.scoredFileRefs.includes(d.fileRef))
      : []

    body = (
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="font-heading text-3xl text-navy font-bold">{stmts.length}</p>
          <p className="text-sm text-gray-600 font-body mt-1">Statement reviews pending</p>
          <div className="mt-2 space-y-1">
            {stmts.slice(0, 4).map(s => (
              <p key={s.documentId} className="text-xs text-gray-500 font-body truncate">
                {s.docClass.replace(/_/g, ' ')} on {s.dealRef ?? 'file'} ({s.fieldCount} fields)
              </p>
            ))}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="font-heading text-3xl text-navy font-bold">{sheets.length}</p>
          <p className="text-sm text-gray-600 font-body mt-1">Rate sheet reviews pending</p>
          <div className="mt-2 space-y-1">
            {sheets.slice(0, 4).map(s => (
              <p key={s.intelItemId} className="text-xs text-gray-500 font-body truncate">
                {s.lenderSlug ?? 'unknown lender'}: {s.quoteCount} quotes
                {s.asOfDate ? `, as of ${fmtShortDate(s.asOfDate)}` : ''}
              </p>
            ))}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="font-heading text-3xl text-navy font-bold">{shadowDue.length}</p>
          <p className="text-sm text-gray-600 font-body mt-1">Shadow scores due</p>
          {shadow && (
            <div className="mt-2 space-y-1 text-xs text-gray-500 font-body">
              <p>{shadow.filesScored} files scored so far</p>
              <p>Agreement streak: {shadow.agreementStreak}</p>
              <p>
                Last score:{' '}
                {shadow.lastScoreDate ? fmtDateTime(shadow.lastScoreDate) : 'none yet'}
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <StubPage
      title="Approvals"
      session={3}
      description="One queue for statement reviews, rate sheet reviews, and shadow scores. Counts below are live from the workbench; the decision actions arrive with the gates API."
    >
      {body}
    </StubPage>
  )
}
