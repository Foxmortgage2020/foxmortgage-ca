// Save Michael's edit of a drip draft (append-only human_edited row; his
// corrections are the skill's highest authority for this client).
import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { editRenewalTouchDraft, STATUS_BY_KIND } from '@/lib/gates'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { touchId: string } }) {
  const gate = await apiPermission('renewal.decide')
  if (!gate.ok) {
    return NextResponse.json({ ok: false, kind: gate.status === 401 ? 'auth' : 'forbidden', message: gate.message }, { status: gate.status })
  }
  let body: any = null
  try { body = await req.json() } catch { /* required below */ }
  if (typeof body?.body !== 'string' || body.body.trim().length < 20) {
    return NextResponse.json({ ok: false, kind: 'validation', message: 'The edited body is required (20+ characters).' }, { status: 422 })
  }
  const result = await editRenewalTouchDraft(
    params.touchId,
    { subject: typeof body?.subject === 'string' ? body.subject : undefined, body: body.body, note: typeof body?.note === 'string' ? body.note : undefined },
    req.headers.get('x-gates-token'),
  )
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
