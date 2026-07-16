// Generate a lender submission-note DRAFT for a deal (lender-notes wiring
// session, 2026-07-15). Mirrors the document-upload proxy: permission gate,
// bounded payload, forward the browser-minted gates token. POST-only; a GET can
// never generate a note. The workbench does the assembling, model call,
// validation, and persistence; nothing is sent anywhere.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { isDemoMode } from '@/lib/demo'
import { generateLenderNotes, STATUS_BY_KIND } from '@/lib/gates'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { dealId: string } }) {
  const gate = await apiPermission('notes.generate')
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, kind: gate.status === 401 ? 'auth' : 'forbidden', message: gate.message },
      { status: gate.status },
    )
  }
  // Demo mode produces the canned note client-side; a direct POST here would
  // otherwise reject with DemoWriteBlocked and surface as a bare 500. Refuse
  // cleanly (zero real writes in demo).
  if (isDemoMode()) {
    return NextResponse.json(
      { ok: false, kind: 'forbidden', message: 'Demo mode is read-only.' },
      { status: 403 },
    )
  }
  let body: any = null
  try {
    body = await req.json()
  } catch {
    // no body is fine — advisor context is optional
  }
  const advisorContext = typeof body?.advisor_context === 'string' ? body.advisor_context : null
  if (advisorContext !== null && advisorContext.length > 4000) {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: 'Advisor context is limited to 4000 characters.' },
      { status: 422 },
    )
  }
  const allowStale = body?.allow_stale_snapshot === true
  const result = await generateLenderNotes(params.dealId, advisorContext, req.headers.get('x-gates-token'), allowStale)
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
