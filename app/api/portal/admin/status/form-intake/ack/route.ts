// Acknowledge a triaged zoho_failed form submission (Session 4). This is
// a write on the FOXCA project, this repo's own database, through the
// narrow security-definer function; the workbench stays read-only. Records
// who acknowledged and when. Admin only.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { acknowledgeFormSubmission } from '@/lib/status'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: Request) {
  const gate = await apiPermission('status.acknowledge')
  if (!gate.ok) {
    return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  }
  let body: any = null
  try {
    body = await req.json()
  } catch {
    // fall through to the id check
  }
  const id = body?.id
  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, message: 'A submission id is required.' }, { status: 422 })
  }
  const done = await acknowledgeFormSubmission(id, gate.user.email || gate.user.userId)
  if (!done) {
    return NextResponse.json(
      { ok: false, message: 'Nothing to acknowledge: the row is missing, already acknowledged, or the project did not answer.' },
      { status: 409 },
    )
  }
  console.log(`[form-intake] acknowledged ${id}`)
  return NextResponse.json({ ok: true })
}
