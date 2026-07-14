// Knowledge document upload proxy. The browser reads the file with
// FileReader, base64s it, and POSTs JSON here; this route bounds and
// shapes the body, then forwards to the gates upload endpoint with the
// browser-minted token. Extraction on the workbench mints PENDING claims
// only — nothing this route does can approve anything.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import {
  uploadKnowledgeDocument,
  KNOWLEDGE_UPLOAD_KINDS,
  STATUS_BY_KIND,
  type KnowledgeUploadKind,
} from '@/lib/gates'

export const dynamic = 'force-dynamic'

// Decoded-size ceiling, matching the client form: 3 MB decoded (~4.2M
// base64 characters — inside Vercel's ~4.5 MB request-body ceiling and the
// workbench's 4,200,000-character zod cap). Base64 carries 3 bytes per 4
// characters, so the check runs on the string length — no need to
// materialize the buffer to refuse an oversized upload.
const MAX_DECODED_BYTES = 3_145_728

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/

export async function POST(req: Request) {
  const gate = await apiPermission('knowledge.upload')
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
  const lenderSlug = typeof body?.lender_slug === 'string' ? body.lender_slug.trim().toLowerCase() : ''
  const fileName = typeof body?.file_name === 'string' ? body.file_name.trim().slice(0, 200) : ''
  const kind = body?.kind as KnowledgeUploadKind
  const contentBase64 = typeof body?.content_base64 === 'string' ? body.content_base64 : ''
  if (!SLUG_RE.test(lenderSlug)) {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: 'lender_slug must be a lender slug (lowercase letters, digits, dashes).' },
      { status: 422 },
    )
  }
  if (!fileName) {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: 'file_name is required.' },
      { status: 422 },
    )
  }
  if (!KNOWLEDGE_UPLOAD_KINDS.includes(kind)) {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: 'kind must be broker_guide, comp_schedule, policy_bulletin, rate_guide, or other.' },
      { status: 422 },
    )
  }
  if (!contentBase64) {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: 'content_base64 is required (the file, base64 encoded).' },
      { status: 422 },
    )
  }
  const decodedBytes = Math.floor(contentBase64.length * 3 / 4)
  if (decodedBytes > MAX_DECODED_BYTES) {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: '3 MB limit (larger documents: local ingest)' },
      { status: 422 },
    )
  }
  const result = await uploadKnowledgeDocument(
    { lender_slug: lenderSlug, file_name: fileName, kind, content_base64: contentBase64 },
    req.headers.get('x-gates-token'),
  )
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
