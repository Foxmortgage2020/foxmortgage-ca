// CSV export of the audit viewer's current filter view. Admin permission
// checked (audit.view), row cap stated in the UI, server-generated so no
// workbench data ever routes through the browser unfiltered.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { AUDIT_EXPORT_CAP, WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import {
  getAgentIdByEmail,
  getAuditEntries,
  getDealIdByFileRef,
  type AuditFilters,
} from '@/lib/underwriting'
import { torontoDayEndISO, torontoDayStartISO, torontoTodayYMD } from '@/lib/dates'

export const dynamic = 'force-dynamic'

const csvCell = (v: unknown): string => {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return `"${s.replace(/"/g, '""')}"`
}

export async function GET(req: Request) {
  const gate = await apiPermission('audit.view')
  if (!gate.ok) {
    return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  }

  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  if (!agentRes.configured || !agentRes.ok) {
    return NextResponse.json({ ok: false, message: 'Workbench not available' }, { status: 503 })
  }
  const agentId = agentRes.data

  const url = new URL(req.url)
  const ymd = /^\d{4}-\d{2}-\d{2}$/
  const filters: AuditFilters = {}
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const actor = url.searchParams.get('actor')
  const action = url.searchParams.get('action')
  const deal = url.searchParams.get('deal')
  if (from && ymd.test(from)) filters.fromISO = torontoDayStartISO(from)
  if (to && ymd.test(to)) filters.toISO = torontoDayEndISO(to)
  if (actor && ['system', 'claude', 'michael', 'portal'].includes(actor)) filters.actor = actor
  if (action?.trim()) filters.actionLike = action.trim().slice(0, 60)
  if (deal?.trim()) {
    const dealRes = await getDealIdByFileRef(agentId, deal.trim())
    if (dealRes.configured && dealRes.ok && dealRes.data) filters.dealId = dealRes.data
    else {
      return NextResponse.json(
        { ok: false, message: 'No workbench deal matches that file ref.' },
        { status: 404 },
      )
    }
  }

  const res = await getAuditEntries(agentId, filters, AUDIT_EXPORT_CAP, 0)
  if (!res.configured || !res.ok) {
    return NextResponse.json({ ok: false, message: 'Audit query failed' }, { status: 502 })
  }

  const header = 'id,created_at,actor,actor_email,actor_clerk_id,action,deal_ref,detail'
  const lines = res.data.rows.map(r =>
    [r.id, r.createdAt, r.actor, r.actorEmail, r.actorClerkId, r.action, r.dealRef, r.detail]
      .map(csvCell)
      .join(','),
  )
  const capped = res.data.total !== null && res.data.total > AUDIT_EXPORT_CAP
  const body = [header, ...lines].join('\n') + (capped ? `\n"NOTE: capped at ${AUDIT_EXPORT_CAP} of ${res.data.total} rows"` : '')

  console.log(`[audit-export] rows=${lines.length} capped=${capped}`)
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="audit-log-${torontoTodayYMD()}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
