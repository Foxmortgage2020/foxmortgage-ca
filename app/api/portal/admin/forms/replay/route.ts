// POST /api/portal/admin/forms/replay — re-attempt the Zoho write for every
// captured submission whose downstream write failed (B0, 2026-07-27).
//
// A zoho_failed row means the lead is safe in form_submissions but never
// reached the CRM. Until now the only recovery was by hand. Gated by
// status.acknowledge (admin only — the same key that triages these rows on the
// Status page) and refused in demo. GET reports what would be replayed without
// touching Zoho, so the queue can be inspected before anything is written.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { isDemoMode } from '@/lib/demo'
import { listReplayCandidates, replayFailedSubmissions } from '@/lib/form-replay'

export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await apiPermission('status.acknowledge')
  if (!gate.ok) return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  try {
    const candidates = await listReplayCandidates()
    if (candidates === null) {
      return NextResponse.json({ ok: false, message: 'The submission store is not configured.' }, { status: 503 })
    }
    return NextResponse.json({
      ok: true,
      pending: candidates.length,
      rows: candidates.map(c => ({
        id: c.id,
        source: c.source,
        createdAt: c.createdAt,
        errorDetail: c.errorDetail,
      })),
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : 'Could not read the replay queue.' },
      { status: 502 },
    )
  }
}

export async function POST() {
  const gate = await apiPermission('status.acknowledge')
  if (!gate.ok) return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })

  // Demo is read-only. First, before any store read or Zoho write.
  if (isDemoMode()) {
    return NextResponse.json({ ok: false, message: 'Demo mode is read-only.' }, { status: 403 })
  }

  const report = await replayFailedSubmissions()
  if (!report.configured) {
    return NextResponse.json({ ok: false, message: 'The submission store is not configured.' }, { status: 503 })
  }
  if (report.error) {
    return NextResponse.json({ ok: false, message: report.error }, { status: 502 })
  }
  console.log(
    `[form-intake] replay by ${gate.user.email}: ${report.succeeded} recovered, ${report.failed} still failing, ${report.skipped} skipped`,
  )
  return NextResponse.json({ ok: true, ...report })
}
