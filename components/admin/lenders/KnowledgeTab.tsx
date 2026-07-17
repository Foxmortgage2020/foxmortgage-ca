// The Knowledge engine (Session 4) — reparented unchanged as the Lenders
// page's Knowledge tab (B3). Content comes from the Gates API knowledge
// endpoints, which serve the git-versioned workbench files verbatim. The
// fetch happens in the browser because knowledge rides the same auth
// posture as the gates (browser-minted token). Lender detail pages keep
// their own /portal/admin/knowledge/[slug] routes.

import KnowledgeIndex from '@/components/admin/KnowledgeIndex'
import { torontoTodayYMD } from '@/lib/dates'

export default function KnowledgeTab() {
  return (
    <div>
      <p className="font-ui text-sm text-cool-600">
        Lender profiles and notes with their as-of dates. Anything older than 90 days is
        flagged; stale knowledge is worse than no knowledge.
      </p>
      <div className="mt-4">
        <KnowledgeIndex todayYMD={torontoTodayYMD()} />
      </div>
      <p className="mt-6 font-ui text-xs text-cool-500">
        This content is git-versioned in the workbench repo and updates ship with its deploys.
        Every figure keeps its as-of date; never quote one without it.
      </p>
    </div>
  )
}
