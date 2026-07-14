// One lender's knowledge page (Session 4; claims-backed since the
// knowledge-pipeline session). The server shell computes the approved-quote
// count and loads the lender's knowledge claims + uploaded documents from
// the granted workbench tables; the git-versioned knowledge content itself
// is fetched in the browser (gates auth posture).

import { can, requirePermission } from '@/lib/authz'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import {
  getAgentIdByEmail,
  getKnowledgeClaims,
  getKnowledgeDocuments,
  getRateQuoteBrowser,
  type KnowledgeClaimRow,
  type KnowledgeDocumentRow,
} from '@/lib/underwriting'
import { isDemoMode } from '@/lib/demo'
import LenderKnowledge from '@/components/admin/LenderKnowledge'
import { torontoTodayYMD } from '@/lib/dates'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function LenderKnowledgePage({ params }: { params: { slug: string } }) {
  const user = await requirePermission('knowledge.view')
  const demo = isDemoMode()
  // Demo mode is read-only: no upload control renders, and the server
  // rejects any stray write with DemoWriteBlocked.
  const canUpload = !demo && can(user, 'knowledge.upload')

  // Quote count is a cross-link nicety; the page renders without it.
  // Claims and documents degrade to empty the same way — the git-versioned
  // knowledge content still renders when the workbench is unreachable.
  let approvedQuoteCount: number | null = null
  let claims: KnowledgeClaimRow[] = []
  let documents: KnowledgeDocumentRow[] = []
  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  if (agentRes.configured && agentRes.ok) {
    const [quotesR, claimsR, docsR] = await Promise.all([
      getRateQuoteBrowser(agentRes.data),
      getKnowledgeClaims(agentRes.data, params.slug),
      getKnowledgeDocuments(agentRes.data, params.slug),
    ])
    if (quotesR.configured && quotesR.ok) {
      approvedQuoteCount = quotesR.data.filter(
        q => q.status === 'approved' && q.lenderSlug === params.slug,
      ).length
    }
    if (claimsR.configured && claimsR.ok) claims = claimsR.data
    if (docsR.configured && docsR.ok) documents = docsR.data
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
        claims={claims}
        documents={documents}
        canUpload={canUpload}
      />
    </div>
  )
}
