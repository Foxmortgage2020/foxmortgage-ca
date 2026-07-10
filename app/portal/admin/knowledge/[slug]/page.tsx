// One lender's knowledge page (Session 4). The server shell computes the
// approved-quote count from the granted workbench tables; the knowledge
// content itself is fetched in the browser (gates auth posture).

import { requirePermission } from '@/lib/authz'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { getAgentIdByEmail, getRateQuoteBrowser } from '@/lib/underwriting'
import LenderKnowledge from '@/components/admin/LenderKnowledge'
import { torontoTodayYMD } from '@/lib/dates'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function LenderKnowledgePage({ params }: { params: { slug: string } }) {
  await requirePermission('knowledge.view')

  // Quote count is a cross-link nicety; the page renders without it.
  let approvedQuoteCount: number | null = null
  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  if (agentRes.configured && agentRes.ok) {
    const quotesR = await getRateQuoteBrowser(agentRes.data)
    if (quotesR.configured && quotesR.ok) {
      approvedQuoteCount = quotesR.data.filter(
        q => q.status === 'approved' && q.lenderSlug === params.slug,
      ).length
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-2">
        <Link href="/portal/admin/knowledge" className="text-xs font-semibold text-gray-400 hover:text-navy">
          &larr; Knowledge
        </Link>
      </div>
      <LenderKnowledge
        slug={params.slug}
        todayYMD={torontoTodayYMD()}
        approvedQuoteCount={approvedQuoteCount}
      />
    </div>
  )
}
