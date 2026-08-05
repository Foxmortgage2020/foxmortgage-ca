// Committed-terms gate proxy (2026-08-04). approve makes the extracted set the
// file's committed terms (superseding a prior document's set); reject discards
// it. Keyed on the SOURCE DOCUMENT, not the deal — the twin of the
// commitment-conditions proxy beside it, off the same upload.
//
// The authority key is enforced here BEFORE any token is minted or forwarded,
// and again server-side by the gates API on every call. Both sides are admin
// only; the key name is a cross-repo contract (config/authority.ts).
//
// Validation is mirrored from the contract so garbage never burns a 60-second
// token on a round trip that cannot succeed: the action vocabulary, the
// document id's UUID shape (the route answers 422 on a malformed id), and the
// note ceiling. An over-long note is REFUSED rather than truncated — silently
// shortening what a person wrote changes the record they meant to leave.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { decideCommitmentTerms, STATUS_BY_KIND } from '@/lib/gates'
import {
  COMMITMENT_TERMS_ACTIONS,
  TERM_NOTE_MAX,
  isUuid,
  type CommitmentTermsAction,
} from '@/lib/commitment-terms'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: { documentId: string } }) {
  const gate = await apiPermission('approvals.commitment_terms.decide')
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, kind: gate.status === 401 ? 'auth' : 'forbidden', message: gate.message },
      { status: gate.status },
    )
  }

  if (!isUuid(params.documentId)) {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: 'That commitment document id is not a valid id.' },
      { status: 422 },
    )
  }

  let body: any = null
  try {
    body = await req.json()
  } catch {
    // fall through to the action check
  }

  const action = body?.action as CommitmentTermsAction
  if (!COMMITMENT_TERMS_ACTIONS.includes(action)) {
    return NextResponse.json(
      { ok: false, kind: 'validation', message: 'Action must be approve or reject.' },
      { status: 422 },
    )
  }

  const note = typeof body?.note === 'string' ? body.note : undefined
  if (note && note.length > TERM_NOTE_MAX) {
    return NextResponse.json(
      {
        ok: false,
        kind: 'validation',
        message: `That note is ${note.length} characters. Shorten it to ${TERM_NOTE_MAX} or fewer and it will send as written.`,
      },
      { status: 422 },
    )
  }

  const result = await decideCommitmentTerms(
    params.documentId,
    action,
    req.headers.get('x-gates-token'),
    note,
  )
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS_BY_KIND[result.kind] })
}
