// Commitment / amendment upload proxy (Phase B2). The browser reads the file
// with FileReader, base64s it, and POSTs JSON here; this route bounds and
// shapes the body, then forwards to the gates upload endpoint with the
// browser-minted token. Extraction on the workbench mints PENDING conditions
// only — nothing this route does can make them the checklist.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import {
  uploadCommitment,
  COMMITMENT_KINDS,
  STATUS_BY_KIND,
  type CommitmentKind,
} from '@/lib/gates'

export const dynamic = 'force-dynamic'

// Decoded-size ceiling: 3 MB decoded (~4.2M base64 characters), inside
// Vercel's request-body ceiling and the workbench cap. Base64 is 3 bytes per
// 4 characters, so the check runs on string length — no need to materialize
// the buffer to refuse an oversized upload.
const MAX_DECODED_BYTES = 3_145_728

export async function POST(req: Request, { params }: { params: { dealId: string } }) {
  const gate = await apiPermission('commitment.upload')
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, kind: gate.status === 401 ? 'auth' : 'forbidden', message: gate.message },
      { status: gate.status },
    )
  }
  let body: any = null
  try {
    body = await req.json()
  } catch {
    // fall through to the field checks
  }
  const fileName = typeof body?.file_name === 'string' ? body.file_name.trim().slice(0, 200) : ''
  const kind = body?.kind as CommitmentKind
  const contentBase64 = typeof body?.content_base64 === 'string' ? body.content_base64 : ''
  if (!fileName) {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: 'file_name is required.' },
      { status: 422 },
    )
  }
  if (!COMMITMENT_KINDS.includes(kind)) {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: 'kind must be commitment or amendment.' },
      { status: 422 },
    )
  }
  if (!contentBase64) {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: 'content_base64 is required (the file, base64 encoded).' },
      { status: 422 },
    )
  }
  const decodedBytes = Math.floor((contentBase64.length * 3) / 4)
  if (decodedBytes > MAX_DECODED_BYTES) {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: '3 MB limit (larger documents: local ingest)' },
      { status: 422 },
    )
  }
  const result = await uploadCommitment(
    params.dealId,
    { file_name: fileName, kind, content_base64: contentBase64 },
    req.headers.get('x-gates-token'),
  )
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
