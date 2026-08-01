// GET /api/portal/admin/tasks/overdue?asOf=YYYY-MM-DD&offset=N — the overdue
// bucket past the Today endpoint's 200-row cap (A2).
//
// WHY A SECOND READ PATH EXISTS. GET /api/tasks/today caps each bucket at 200
// rows and accepts no paging params, and A2 must not modify fox-underwriting.
// On the first live read overdue was 276, so 76 rows were unreachable from
// that endpoint alone. `tasks` is granted to portal_readonly (fox-underwriting
// migration 0057), so the remainder is read through this repo's existing
// GET-only workbench wrapper.
//
// THE ENDPOINT STAYS AUTHORITATIVE: `asOf` is passed back verbatim from its
// own response. This route never resolves "today" — not from the browser's
// clock, not from the server's. A missing or malformed asOf is refused rather
// than defaulted, because a defaulted date is a silently different filter.
//
// Gated on tasks.view. Read-only; there is no write on this path.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { getAgentIdByEmail, getOverdueTasksPage } from '@/lib/underwriting'
import { OVERDUE_PAGE_ROWS } from '@/lib/today-tasks'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const gate = await apiPermission('tasks.view')
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, kind: gate.status === 401 ? 'auth' : 'forbidden', message: gate.message },
      { status: gate.status },
    )
  }

  const url = new URL(req.url)
  const asOf = url.searchParams.get('asOf') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    return NextResponse.json(
      {
        ok: false,
        kind: 'validation',
        message: 'This read needs the as_of date the Today view resolved.',
      },
      { status: 422 },
    )
  }
  const rawOffset = Number(url.searchParams.get('offset') ?? '0')
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0

  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  if (!agentRes.configured) {
    return NextResponse.json(
      { ok: false, kind: 'unavailable', message: 'The workbench is not connected.' },
      { status: 503 },
    )
  }
  if (!agentRes.ok) {
    return NextResponse.json(
      { ok: false, kind: 'unavailable', message: 'Could not resolve the workbench agent.' },
      { status: 503 },
    )
  }

  const page = await getOverdueTasksPage(agentRes.data, asOf, OVERDUE_PAGE_ROWS, offset)
  if (!page.configured) {
    return NextResponse.json(
      { ok: false, kind: 'unavailable', message: 'The workbench is not connected.' },
      { status: 503 },
    )
  }
  if (!page.ok) {
    // A permission refusal here means the tasks grant is missing on
    // portal_readonly — say so honestly rather than rendering an empty page
    // that reads as "there is nothing more".
    const permission = page.status === 403
    return NextResponse.json(
      {
        ok: false,
        kind: permission ? 'forbidden' : 'unavailable',
        message: permission
          ? 'The workbench has not granted this portal read access to tasks.'
          : 'The workbench did not answer. Retry in a moment.',
      },
      { status: permission ? 403 : 503 },
    )
  }

  return NextResponse.json({
    ok: true,
    data: {
      rows: page.data.rows,
      total: page.data.total,
      offset,
      limit: OVERDUE_PAGE_ROWS,
      // Honest end-of-list: a short page is the last page.
      hasMore: page.data.rows.length === OVERDUE_PAGE_ROWS,
    },
  })
}
