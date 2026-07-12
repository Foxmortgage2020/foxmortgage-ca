// POST /api/portal/admin/opportunities/status — records a portal-side
// opportunity status (Zoho has no opportunity field, so status lives in FOXCA).
// Enumerated statuses only; recorded with who and when. Gated by
// opportunities.manage; refused in demo.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { isDemoMode } from '@/lib/demo'
import { setOpportunityStatus } from '@/lib/smm-store'

export const dynamic = 'force-dynamic'

const STATUSES = new Set(['contacted', 'in_discussion', 'application_out', 'converted', 'declined'])

export async function POST(req: Request) {
  const gate = await apiPermission('opportunities.manage')
  if (!gate.ok) return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  if (isDemoMode()) return NextResponse.json({ ok: false, message: 'Demo mode is read-only.' }, { status: 403 })

  const body = (await req.json().catch(() => ({}))) as { householdId?: string; uploadId?: string; status?: string }
  if (!body.householdId || !body.status || !STATUSES.has(body.status)) {
    return NextResponse.json({ ok: false, message: 'A household id and a known status are required.' }, { status: 422 })
  }
  const res = await setOpportunityStatus(body.householdId, body.uploadId ?? null, body.status, gate.user.email, null)
  if (!res.configured) return NextResponse.json({ ok: false, message: 'The status store is not configured.' }, { status: 503 })
  if (!res.ok) return NextResponse.json({ ok: false, message: `The status did not save: ${res.error}` }, { status: 502 })
  return NextResponse.json({ ok: true, id: res.data })
}
