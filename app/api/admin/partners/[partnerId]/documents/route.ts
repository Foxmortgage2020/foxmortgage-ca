import { NextRequest, NextResponse } from 'next/server'
import { getPortalContext } from '@/lib/auth'
import {
  getPartner,
  createPartnerDocument,
  updatePartnerDocument,
  uploadAttachment,
} from '@/lib/zoho'

// Document size + MIME guardrails. Mirror the values shown to the
// admin in the upload form. 10 MiB is well below Zoho's per-attachment
// cap (20 MiB for v2) and matches the spec.
const MAX_FILE_BYTES = 10 * 1024 * 1024
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
])

const ALLOWED_DOCUMENT_TYPES = new Set([
  'KYC', 'AML Declaration', 'Accredited Investor', 'Risk Disclosure',
  'Source of Funds', 'Investor Agreement', 'Void Cheque',
  'Government ID Front', 'Government ID Back', 'Proof of Address',
  'Subscription Agreement', 'T5 Slip', 'Mortgage Statement',
  'Compliance Package', 'Other',
])

// POST /api/admin/partners/[partnerId]/documents
//
// Multipart upload. Form fields:
//   file        — required, PDF/JPG/PNG, ≤10 MiB
//   documentType— required, one of the picklist values above
//   expiryDate  — optional, yyyy-MM-dd
//   notes       — optional, ≤2000 chars (goes into Reviewer_Notes)
//
// Flow:
//   1. Admin gate
//   2. Validate partner exists (so we don't create orphan records)
//   3. Validate file + form fields
//   4. Create Partner_Documents record with status=Approved (admin
//      uploads are presumed reviewed)
//   5. Attach the file to that record via Zoho Attachments API
//   6. Update the record's File_URL with our portal download URL
//      (purely for human reference in Zoho UI — the real download
//      flow re-fetches attachments by document id)
//
// Any step 4-6 failure leaves a partial record in Zoho. We don't roll
// back automatically — Mike can manually delete a record from Zoho if
// the upload half fails. Logged loudly so it's easy to find.
export async function POST(
  req: NextRequest,
  { params }: { params: { partnerId: string } },
) {
  try {
    const ctx = await getPortalContext()
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!ctx.actor.roles.includes('admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { partnerId } = params
    if (!partnerId) {
      return NextResponse.json({ error: 'Partner ID required.' }, { status: 400 })
    }

    // Confirm the partner exists before doing any record-creation work.
    // A typoed partner id should fail loud, not create orphans.
    const partner = await getPartner(partnerId)
    if (!partner) {
      return NextResponse.json({ error: 'Partner not found.' }, { status: 404 })
    }

    const form = await req.formData()
    const file = form.get('file')
    const documentType = String(form.get('documentType') ?? '')
    const expiryDate = String(form.get('expiryDate') ?? '').trim()
    const notes = String(form.get('notes') ?? '').trim()

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'File is required.' }, { status: 400 })
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'File is empty.' }, { status: 400 })
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `File too large. Max ${MAX_FILE_BYTES / (1024 * 1024)} MB.` },
        { status: 400 },
      )
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        { error: 'Unsupported file type. PDF, JPG, or PNG only.' },
        { status: 400 },
      )
    }
    if (!ALLOWED_DOCUMENT_TYPES.has(documentType)) {
      return NextResponse.json({ error: 'Invalid document type.' }, { status: 400 })
    }
    if (expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
      return NextResponse.json({ error: 'Invalid expiry date.' }, { status: 400 })
    }
    if (notes.length > 2000) {
      return NextResponse.json({ error: 'Notes too long. Max 2000 characters.' }, { status: 400 })
    }

    // Display name shown in Zoho UI and the investor's document table.
    const today = new Date().toISOString().slice(0, 10)
    const name = `${documentType} - ${today}`

    const documentId = await createPartnerDocument({
      name,
      partnerId,
      documentType,
      documentStatus: 'Approved',
      uploadedDate: today,
      expiryDate: expiryDate || null,
      reviewerNotes: notes || null,
    })

    try {
      await uploadAttachment('Partner_Documents', documentId, file, file.name)
    } catch (attachErr) {
      console.error(
        '[POST admin/partners/documents] attachment upload failed after record creation',
        { documentId, partnerId },
        attachErr,
      )
      // Leave the record in place but surface the failure. Mike can
      // re-upload or delete the orphan in Zoho.
      return NextResponse.json(
        {
          error: 'Document record was created but the file upload failed. Delete the empty record in Zoho before retrying.',
          documentId,
        },
        { status: 500 },
      )
    }

    // Best-effort File_URL backfill — fine if it fails since the
    // download flow doesn't rely on it.
    const baseUrl = req.nextUrl.origin
    const fileUrl = `${baseUrl}/api/portal/investor/documents/${documentId}`
    try {
      await updatePartnerDocument(documentId, { File_URL: fileUrl })
    } catch (urlErr) {
      console.error('[POST admin/partners/documents] File_URL backfill failed', { documentId }, urlErr)
    }

    return NextResponse.json({ ok: true, documentId, fileUrl }, { status: 201 })
  } catch (error) {
    console.error(
      '[POST /api/admin/partners/[partnerId]/documents]',
      new Date().toISOString(),
      error,
    )
    return NextResponse.json(
      { error: "We couldn't load this data right now. Please try again in a moment.", code: 'ZOHO_UNAVAILABLE' },
      { status: 503 },
    )
  }
}
