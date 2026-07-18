// Correct a client-comms draft before approval (comms.decide, admin). Saves a
// superseding human_edited draft; the touch stays pending. Michael's edits are
// the highest authority and feed future drafts for this client.
import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { editCommsTouchDraft, STATUS_BY_KIND } from '@/lib/gates'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { touchId: string } }) {
  const gate = await apiPermission('comms.decide')
  if (!gate.ok) {
    return NextResponse.json({ ok: false, kind: gate.status === 401 ? 'auth' : 'forbidden', message: gate.message }, { status: gate.status })
  }
  let body: any = null
  try { body = await req.json() } catch { /* required below */ }
  // The workbench CommsEditBody requires a body of at least 20 characters.
  if (typeof body?.body !== 'string' || body.body.trim().length < 20) {
    return NextResponse.json({ ok: false, kind: 'validation', message: 'The edited message needs at least 20 characters.' }, { status: 422 })
  }
  const subject = typeof body?.subject === 'string' && body.subject.trim() ? body.subject.trim().slice(0, 200) : undefined
  const result = await editCommsTouchDraft(
    params.touchId,
    { body: body.body.trim().slice(0, 8000), ...(subject ? { subject } : {}) },
    req.headers.get('x-gates-token'),
  )
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
