// POST /api/portal/admin/underwriting/lender-notes/[dealId] — the portal's
// caller for the native Lender Notes Generator (N-06, 2026-07-29).
//
// This is the CRM WRITE, and it is not the deal-room draft. The draft stays
// exactly where it is, at /api/portal/admin/gates/deals/[dealId]/lender-notes:
// it generates into the workbench, lands an editable draft, and sends nothing.
// THIS route runs the ported n8n generator, which on a real run overwrites
// Lender_Notes on the Zoho Deal (previous notes copied to a history Note
// first) and appends a log Note. Two different actions, two different engines,
// so this one carries its own admin-only key, notes.crm.write.
//
// THE BROWSER NEVER NAMES THE ZOHO RECORD. The card posts the workbench deal
// id it is already rendering. The route reads that deal through the read-only
// workbench role and takes the Zoho and Finmo identifiers off the row. A
// client-supplied Zoho id on a CRM write is how one file's note lands on
// another file, so the identifier is resolved on this side or not at all.
//
// The secret lives in lib/lender-notes-bridge.ts and never reaches the
// browser. Nothing here mints a gates token: generation is a machine path that
// records no human actor by design, and the human is gated right here.

import { NextResponse } from 'next/server'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { apiPermission } from '@/lib/authz'
import { isDemoMode } from '@/lib/demo'
import {
  LENDER_NOTES_STATUS_BY_KIND,
  runLenderNotesOnCrm,
  type LenderNotesMode,
} from '@/lib/lender-notes-bridge'
import { getAgentIdByEmail, getDealDetail } from '@/lib/underwriting'

export const dynamic = 'force-dynamic'
// A generation is a model call over a whole file. The agent chat route carries
// the same ceiling for the same reason.
export const maxDuration = 300

export async function POST(req: Request, { params }: { params: { dealId: string } }) {
  const gate = await apiPermission('notes.crm.write')
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, kind: gate.status === 401 ? 'auth' : 'forbidden', message: gate.message },
      { status: gate.status },
    )
  }
  // Demo mode writes nothing anywhere. The card hides the control in demo; a
  // direct POST refuses cleanly rather than reaching a real Zoho file.
  if (isDemoMode()) {
    return NextResponse.json(
      { ok: false, kind: 'forbidden', message: 'Demo mode is read-only.' },
      { status: 403 },
    )
  }

  let body: Record<string, unknown> = {}
  try {
    body = ((await req.json()) ?? {}) as Record<string, unknown>
  } catch {
    // An empty body is a plain DRAFT run.
  }
  const dryRun = body.dry_run === true
  const force = body.force === true
  const rawMode = typeof body.mode === 'string' ? body.mode.toUpperCase() : 'DRAFT'
  if (rawMode !== 'DRAFT' && rawMode !== 'FINAL') {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: 'Mode must be DRAFT or FINAL.' },
      { status: 422 },
    )
  }
  const mode = rawMode as LenderNotesMode

  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  const agentId = agentRes.configured && agentRes.ok ? agentRes.data : null
  if (!agentId) {
    return NextResponse.json(
      { ok: false, kind: 'unavailable', message: 'The workbench is not answering, so the deal could not be read.' },
      { status: 503 },
    )
  }
  const dealRes = await getDealDetail(agentId, params.dealId)
  const deal = dealRes.configured && dealRes.ok ? dealRes.data : null
  if (!deal) {
    return NextResponse.json(
      { ok: false, kind: 'not-found', message: 'That deal room was not found in the workbench.' },
      { status: 404 },
    )
  }

  const result = await runLenderNotesOnCrm({
    zohoDealId: deal.zohoPotentialId,
    finmoApplicationId: deal.finmoAppId,
    mode,
    force,
    dryRun,
  })

  if (result.ok) return NextResponse.json({ ok: true, run: result.run })
  return NextResponse.json(
    { ok: false, kind: result.kind, message: result.message, run: result.run },
    { status: LENDER_NOTES_STATUS_BY_KIND[result.kind] },
  )
}
