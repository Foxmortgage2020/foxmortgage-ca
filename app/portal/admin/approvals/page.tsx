// Approvals — the live desk (Session 3). Four queues with decisions
// flowing through the fox-underwriting Gates API: statement reviews, rate
// sheets, flag dispositions, shadow scores. The server page loads the
// queue data read-only; every decision goes through the gate proxy routes
// with the signed-in user's own token.

import Link from 'next/link'
import { can, requirePermission } from '@/lib/authz'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { getAgentIdByEmail } from '@/lib/underwriting'
import { getApprovalsData } from '@/lib/approvals-data'
import { gatesConfigured } from '@/lib/gates'
import { isDemoMode } from '@/lib/demo'
import { torontoTodayYMD } from '@/lib/dates'
import ApprovalsDesk from '@/components/admin/ApprovalsDesk'

export const dynamic = 'force-dynamic'

const TAB_KEYS = ['statements', 'sheets', 'offers', 'flags', 'shadow', 'knowledge', 'comms'] as const

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const user = await requirePermission('approvals.view')
  const demo = isDemoMode()
  const rawTab = typeof searchParams?.tab === 'string' ? searchParams.tab : undefined
  const initialTab = TAB_KEYS.find(t => t === rawTab) ?? 'statements'

  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  const agentId = agentRes.configured && agentRes.ok ? agentRes.data : null

  let body: React.ReactNode
  if (!agentRes.configured) {
    body = (
      <div className="mt-6 bg-white border border-cool-200 rounded-xl p-5">
        <p className="text-sm text-cool-500 font-ui">
          Workbench not connected. Queues appear here once UW_SUPABASE_URL,
          UW_SUPABASE_READONLY_KEY, and UW_SUPABASE_PUBLISHABLE_KEY are set.
        </p>
      </div>
    )
  } else if (!agentId) {
    body = (
      <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-5">
        <p className="text-sm text-amber-800 font-ui">
          Workbench is configured but not answering. See{' '}
          <Link href="/portal/admin/status" className="underline">
            Status
          </Link>{' '}
          for details.
        </p>
      </div>
    )
  } else {
    const data = await getApprovalsData(agentId)
    body = (
      <div className="mt-6">
        {!gatesConfigured() && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-sm text-amber-800 font-ui">
              The Gates API is not connected (GATES_API_URL is not set), so queues are read-only
              right now. Decisions will fail until it is configured.
            </p>
          </div>
        )}
        <ApprovalsDesk
          initial={data}
          initialTab={initialTab}
          todayYMD={torontoTodayYMD()}
          canDecide={{
            // Session 9: demo mode is read-only — no decision controls render
            // (the server also rejects any write with DemoWriteBlocked).
            statements: !demo && can(user, 'approvals.statement.decide'),
            sheets: !demo && can(user, 'approvals.ratesheet.decide'),
            offers: !demo && can(user, 'approvals.offer.decide'),
            flags: !demo && can(user, 'flags.disposition'),
            shadow: !demo && can(user, 'shadow.score'),
            knowledge: !demo && can(user, 'approvals.knowledge.decide'),
            comms: !demo && can(user, 'comms.decide'),
          }}
        />
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <div>
        <h1 className="font-heading text-navy text-2xl font-bold">Approvals</h1>
        <p className="text-cool-500 font-ui text-sm mt-1">
          Statement reviews, rate sheets, promotional offers, flags, shadow scores, and lender
          knowledge claims. Every decision is recorded in the workbench audit log under your name.
        </p>
      </div>
      {body}
    </div>
  )
}
