import { NextRequest, NextResponse } from 'next/server'
import { getPortalContext } from '@/lib/auth'
import {
  getPartnerDocument,
  listAttachments,
  fetchAttachment,
} from '@/lib/zoho'

// GET /api/portal/investor/documents/[documentId]
//
// Streams the document's file binary back to the caller with
// Content-Disposition: attachment. Authorization rules:
//   - investor: must own the document (document's Partner.id equals
//     ctx.effectivePartnerId)
//   - admin (impersonating): same effectivePartnerId check applies
//   - admin (not impersonating): allowed — admins can download any
//     document for support / review purposes
//
// On any failure path, the body is sanitized — never leaks Zoho text.
export async function GET(
  _req: NextRequest,
  { params }: { params: { documentId: string } },
) {
  try {
    const ctx = await getPortalContext()
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isInvestor = ctx.actor.roles.includes('investor')
    const isAdmin = ctx.actor.roles.includes('admin')
    if (!isInvestor && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { documentId } = params
    if (!documentId) {
      return NextResponse.json({ error: 'Document ID required.' }, { status: 400 })
    }

    const doc = await getPartnerDocument(documentId)
    if (!doc) {
      return NextResponse.json({ error: 'Document not found.' }, { status: 404 })
    }

    // Ownership check. An admin who is NOT impersonating skips the check.
    // An admin who IS impersonating must impersonate the document's owner.
    // An investor must own the document outright.
    const adminWithoutImpersonation = isAdmin && !ctx.impersonation
    if (!adminWithoutImpersonation && doc.partnerId !== ctx.effectivePartnerId) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You do not have access to this document.' },
        { status: 403 },
      )
    }

    const attachments = await listAttachments('Partner_Documents', documentId)
    if (attachments.length === 0) {
      return NextResponse.json({ error: 'No file attached to this document.' }, { status: 404 })
    }
    // Phase 1 contract: one attachment per Partner_Documents record. If
    // a record ever has multiple, we serve the first — could expose a
    // multi-attachment picker in a future phase.
    const attachment = attachments[0]
    const { body, contentType } = await fetchAttachment(
      'Partner_Documents',
      documentId,
      attachment.id,
    )

    // Quote-escape filename for Content-Disposition. ASCII-only fallback
    // for older clients; RFC 5987 filename* for full Unicode support.
    const safeName = attachment.fileName.replace(/"/g, '')
    const encodedName = encodeURIComponent(attachment.fileName)

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${safeName}"; filename*=UTF-8''${encodedName}`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    console.error('[GET /api/portal/investor/documents/[documentId]]', new Date().toISOString(), error)
    return NextResponse.json(
      { error: "We couldn't load this data right now. Please try again in a moment.", code: 'ZOHO_UNAVAILABLE' },
      { status: 503 },
    )
  }
}
