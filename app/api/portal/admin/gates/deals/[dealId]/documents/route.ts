// General borrower-document upload to a deal room (document-pull session,
// 2026-07-14). Mirrors the commitment upload proxy: permission gate, bounded
// payload, decoded-size ceiling, forward the browser-minted gates token.
// POST-only; a GET can never store a document.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { uploadDealDocument, STATUS_BY_KIND, type DocumentUploadBody } from '@/lib/gates'

export const dynamic = 'force-dynamic'

const MAX_DECODED_BYTES = 3_145_728 // 3 MB, matches the Gates API contract

export async function POST(req: Request, { params }: { params: { dealId: string } }) {
  const gate = await apiPermission('document.upload')
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
    // fall through to validation
  }
  const fileName = typeof body?.file_name === 'string' ? body.file_name : ''
  const docKind = typeof body?.doc_kind === 'string' ? body.doc_kind : ''
  const contentBase64 = typeof body?.content_base64 === 'string' ? body.content_base64 : ''
  if (!fileName || fileName.length > 200) {
    return NextResponse.json({ ok: false, kind: 'validation', message: 'A file name is required.' }, { status: 422 })
  }
  if (!docKind) {
    return NextResponse.json({ ok: false, kind: 'validation', message: 'A document kind is required.' }, { status: 422 })
  }
  if (!contentBase64) {
    return NextResponse.json({ ok: false, kind: 'validation', message: 'The file is empty.' }, { status: 422 })
  }
  // Decoded-size ceiling without materializing the buffer.
  if (Math.floor((contentBase64.length * 3) / 4) > MAX_DECODED_BYTES) {
    return NextResponse.json({ ok: false, kind: 'validation', message: '3 MB limit (for a larger document, use local ingest).' }, { status: 422 })
  }
  const borrowerId = typeof body?.borrower_id === 'string' && body.borrower_id.trim() ? body.borrower_id.trim() : null
  const payload: DocumentUploadBody = { file_name: fileName, doc_kind: docKind, borrower_id: borrowerId, content_base64: contentBase64 }
  const result = await uploadDealDocument(params.dealId, payload, req.headers.get('x-gates-token'))
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
