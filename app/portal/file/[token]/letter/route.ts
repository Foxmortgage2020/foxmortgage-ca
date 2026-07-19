// The client's pre-approval letter download (B8b Task 3). GET only.
//
// SAME TOKEN, SAME AUTH as the status page: /portal/file/<token>/letter sits
// under the same public route (middleware publicRoutes += /portal/file/(.*)),
// and the token IS the credential. There is NO client-triggered generation of
// terms: this route reads the FROZEN letter snapshot (or nothing) and renders
// the deterministic PDF Michael minted. It never composes a letter.
//
// The route emits the letter only while it is the CURRENT (non-superseded)
// letter for the deal. An expired letter still downloads (the client may want
// the record) — the status page is where "expired" is said in words.

import { NextResponse } from 'next/server'
import { hashClientToken, isClientTokenShape } from '@/lib/client-links'
import { currentLetterForToken } from '@/lib/client-presentation-store'
import { generatePreapprovalPdf, preapprovalPdfFilename } from '@/lib/preapproval-pdf'
import { isDemoMode } from '@/lib/demo'
import { demoClientFileView } from '@/lib/demo-fixtures'
import type { LetterSnapshot } from '@/lib/client-presentation'

export const dynamic = 'force-dynamic'

const NOT_FOUND = () =>
  NextResponse.json({ error: 'not found' }, { status: 404, headers: { 'X-Robots-Tag': 'noindex, nofollow' } })

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const token = params.token
  if (!isClientTokenShape(token)) return NOT_FOUND()

  let snapshot: LetterSnapshot | null = null
  let fileRef: string | null = null

  if (isDemoMode()) {
    // The demo status page serves the fixture; the demo download does the same,
    // so a render proof can show a working download without a real link.
    const view = demoClientFileView(token)
    snapshot = view?.letter?.snapshot ?? null
    fileRef = snapshot?.fileRef ?? null
  } else {
    const current = await currentLetterForToken(hashClientToken(token))
    if (current.configured && current.ok && current.data) {
      snapshot = current.data.snapshot
      fileRef = snapshot.fileRef
    }
  }

  if (!snapshot) return NOT_FOUND()

  const bytes = await generatePreapprovalPdf(snapshot)
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${preapprovalPdfFilename(fileRef)}"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'Referrer-Policy': 'no-referrer',
    },
  })
}
