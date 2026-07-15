// Save an in-place edit of a deal's current lender note (finmo-substrate
// session, 2026-07-15). POST-only; permission-gated (notes.edit); forwards the
// browser-minted gates token. The workbench appends a human_edited row that
// supersedes the prior; both survive. Demo-refused.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { isDemoMode } from '@/lib/demo'
import { saveLenderNoteEdit, STATUS_BY_KIND } from '@/lib/gates'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { dealId: string } }) {
  const gate = await apiPermission('notes.edit')
  if (!gate.ok) {
    return NextResponse.json({ ok: false, kind: gate.status === 401 ? 'auth' : 'forbidden', message: gate.message }, { status: gate.status })
  }
  if (isDemoMode()) {
    return NextResponse.json({ ok: false, kind: 'forbidden', message: 'Demo mode is read-only.' }, { status: 403 })
  }
  let body: any = null
  try { body = await req.json() } catch { /* validated below */ }
  const text = typeof body?.text === 'string' ? body.text : ''
  if (text.trim().length < 20) {
    return NextResponse.json({ ok: false, kind: 'validation', message: 'The edited note is too short to save.' }, { status: 422 })
  }
  if (text.length > 20000) {
    return NextResponse.json({ ok: false, kind: 'validation', message: 'The edited note is too long to save.' }, { status: 422 })
  }
  const result = await saveLenderNoteEdit(params.dealId, text, req.headers.get('x-gates-token'))
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
