// POST /api/portal/admin/opportunities/upload — the Strategic Mortgage
// Monitoring CSV upload, persist-first. Every raw row is written to FOXCA
// (smm_uploads header + smm_rows raw) BEFORE any parsing can fail, so the raw
// upload is the guaranteed capture and audit trail. Then the batch is parsed
// and finalized with its summary. Gated by opportunities.manage; refused in
// demo. Client PII never reaches the logs (counts and household ids only).

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { isDemoMode } from '@/lib/demo'
import {
  checkSignConvention,
  collapseCoBorrowers,
  hasParseFailure,
  isPlaceholder,
  parseCsv,
  parseSmmRow,
  SMM_COLUMNS,
} from '@/lib/smm'
import { createUpload, finalizeUpload, insertRawRows } from '@/lib/smm-store'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await apiPermission('opportunities.manage')
  if (!gate.ok) return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  if (isDemoMode()) {
    return NextResponse.json({ ok: false, message: 'Demo mode is read-only; uploads are disabled.' }, { status: 403 })
  }

  let file: File | null = null
  let filename = 'client-export.csv'
  try {
    const form = await req.formData()
    const f = form.get('file')
    if (f instanceof File) {
      file = f
      filename = f.name || filename
    }
  } catch {
    return NextResponse.json({ ok: false, message: 'Could not read the upload.' }, { status: 400 })
  }
  if (!file) return NextResponse.json({ ok: false, message: 'No CSV file was provided.' }, { status: 400 })

  const text = await file.text()
  const raw = parseCsv(text)
  if (raw.length === 0) {
    return NextResponse.json({ ok: false, message: 'The CSV had no data rows.' }, { status: 422 })
  }
  // A minimal structure check: the header must carry the key columns.
  const missing = ['Household ID', 'Mortgage outstanding balance', 'Mortgage rate', 'Mortgage lender'].filter(
    c => !(c in raw[0]),
  )
  if (missing.length > 0) {
    return NextResponse.json(
      { ok: false, message: `The CSV is missing expected columns: ${missing.join(', ')}.` },
      { status: 422 },
    )
  }

  // ── Persist-first: header + raw rows before any parsing ──
  const created = await createUpload(filename, gate.user.email)
  if (!created.configured) {
    return NextResponse.json({ ok: false, message: 'The upload store is not configured.' }, { status: 503 })
  }
  if (!created.ok) {
    return NextResponse.json({ ok: false, message: `Could not start the upload: ${created.error}` }, { status: 502 })
  }
  const uploadId = created.data
  const inserted = await insertRawRows(uploadId, raw)
  if (!inserted.configured || !inserted.ok) {
    const reason = inserted.configured ? inserted.error : 'store not configured'
    return NextResponse.json({ ok: false, message: `Raw rows did not persist: ${reason}` }, { status: 502 })
  }

  // ── Parse (never fatal to the captured raw rows) ──
  const parsed = raw.map(parseSmmRow)
  const { mortgages, collapsedCount } = collapseCoBorrowers(parsed)
  const placeholders = parsed.filter(isPlaceholder).length
  const parseFailures = parsed
    .filter(hasParseFailure)
    .map(r => ({ householdId: r.householdId, fileRef: r.fileRef, reasons: r.parseErrors.map(e => `${e.field}: ${e.message}`) }))
  const unmappedLenders = Array.from(
    new Set(parsed.filter(r => r.lenderRaw && !r.lender.mapped).map(r => r.lenderRaw)),
  )
  const sign = checkSignConvention(parsed)

  const notes = {
    unmappedLenders,
    parseFailureCount: parseFailures.length,
    placeholderCount: placeholders,
    signOk: sign.ok,
    signViolationCount: sign.violations.length,
  }
  await finalizeUpload(uploadId, parsed.length, mortgages.length, collapsedCount, notes)

  return NextResponse.json({
    ok: true,
    uploadId,
    summary: {
      rawRows: raw.length,
      inserted: inserted.data,
      mortgages: mortgages.length,
      collapsed: collapsedCount,
      placeholders,
      parseFailures,
      unmappedLenders,
      sign: { ok: sign.ok, violations: sign.violations },
      columnsExpected: SMM_COLUMNS.length,
    },
  })
}
