// Knowledge — the lender knowledge base index (Session 4). Content comes
// from the Gates API knowledge endpoints, which serve the git-versioned
// workbench files verbatim. The fetch happens in the browser because
// knowledge rides the same auth posture as the gates (browser-minted
// token).

import { requirePermission } from '@/lib/authz'
import KnowledgeIndex from '@/components/admin/KnowledgeIndex'
import { torontoTodayYMD } from '@/lib/dates'

export const dynamic = 'force-dynamic'

export default async function KnowledgePage() {
  await requirePermission('knowledge.view')
  return (
    <div className="max-w-4xl">
      <div>
        <h1 className="font-heading text-navy text-2xl font-bold">Knowledge</h1>
        <p className="text-gray-500 font-body text-sm mt-1">
          Lender profiles and notes with their as-of dates. Anything older than 90 days is
          flagged; stale knowledge is worse than no knowledge.
        </p>
      </div>
      <div className="mt-6">
        <KnowledgeIndex todayYMD={torontoTodayYMD()} />
      </div>
      <p className="text-xs text-gray-400 font-body mt-6">
        This content is git-versioned in the workbench repo and updates ship with its deploys.
        Every figure keeps its as-of date; never quote one without it.
      </p>
    </div>
  )
}
